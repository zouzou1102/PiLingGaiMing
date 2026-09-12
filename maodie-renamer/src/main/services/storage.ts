/**
 * 存储服务 —— 原子写 + 写入队列串行化 + 损坏恢复（数据库设计 §7 / §8 / §9）。
 *
 * 三条不能省的关键细节：
 *  1. **临时文件必须与原文件同目录** —— 放 %TEMP% 会跨盘，`rename` 退化为
 *     「复制 + 删除」，不再是原子操作，中途失败还会留下半个文件。
 *  2. **`fh.sync()` 不能省** —— 少了它数据可能只在 OS 写缓存里，
 *     断电 / 强制关机 → 文件为空或截断。这个 bug 在拔电源测试之外几乎测不出来。
 *  3. **`prev.then(job, job)` 的第二个参数不能省** —— 否则一次写入失败会让
 *     之后所有写入都不执行（比原问题更严重）。
 */

import {
  copyFileSync,
  promises as fs,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { MAX_CORRUPT_BACKUPS, STORE_FILES, TMP_STALE_MS } from '@shared/constants'
import type { Envelope, StoreName, StorageWarningPayload } from '@shared/types'

/* ── 路径注入（不依赖 electron，便于集成测试传入临时目录）─────────────── */

let userDataDir = ''

export function initStorage(dir: string): void {
  userDataDir = dir
}

export function getUserDataDir(): string {
  return userDataDir
}

export function storePath(name: StoreName): string {
  return join(userDataDir, STORE_FILES[name])
}

/* ── 损坏 / 写失败的对外通告 ─────────────────────────────────────────── */

let warningSink: (w: StorageWarningPayload) => void = () => {}

export function setStorageWarningSink(fn: (w: StorageWarningPayload) => void): void {
  warningSink = fn
}

function notify(w: StorageWarningPayload): void {
  warningSink(w)
}

/**
 * 「版本比软件新」的文件一律**拒绝写入**（数据库设计 §3.3 第 4 条）。
 *
 * 场景：用户装了新版又回退（或两台机器的数据被同步工具覆盖）。此时旧版不认识
 * 新结构，「宽容地」按旧结构解析再写回会**把新版才有的字段全部抹掉** ——
 * 用户的撤销记录被静默摧毁。正确做法是拒绝写入 + 备份 + 告知。
 */
const writeBlocked = new Set<StoreName>()

export function isWriteBlocked(name: StoreName): boolean {
  return writeBlocked.has(name)
}

/* ── 原子写 ─────────────────────────────────────────────────────────── */

function tmpPathFor(file: string): string {
  // 带 pid + 时间戳：固定名在异常退出后会残留，下次写入可能读到上次的残留内容
  return join(dirname(file), `.${basename(file)}.tmp-${process.pid}-${Date.now()}`)
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = tmpPathFor(file)
  const text = JSON.stringify(data, null, 2)

  let fh: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    fh = await fs.open(tmp, 'w')
    await fh.writeFile(text, 'utf8')
    // ★ 确保数据真正落盘，而不是留在操作系统写缓存里
    await fh.sync()
  } catch (err) {
    await fh?.close().catch(() => {})
    await safeUnlink(tmp)
    throw err
  }

  /**
   * ★ Windows 上**必须先关闭句柄再 rename**。
   * 句柄没关就 rename，会拿到 `EPERM: operation not permitted` ——
   * 因为在 Windows 上「改一个仍处于打开状态的文件」不是被允许的操作。
   * 这个坑在 Linux/macOS 上完全不存在，因此极容易被忽略。
   */
  await fh.close()

  try {
    await fs.rename(tmp, file)
  } catch (err) {
    await safeUnlink(tmp)
    throw err
  }
}

/**
 * ★ 关闭窗口时必须用同步写（数据库设计 §5.2）。
 *
 * `win.on('close')` 之后进程随时可能退出；异步写会在写完之前就结束，
 * 用户最后一次调整的窗口尺寸就丢了。文件只有约 150 字节，同步写 < 1ms，
 * 换来的好处是不需要 `event.preventDefault()` + 手动 `window.destroy()`
 * （那种写法会让关闭有一瞬卡顿，还容易写出「忘了 destroy」导致关不掉）。
 */
export function flushJsonSync(file: string, data: unknown): void {
  const tmp = tmpPathFor(file)
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

/**
 * 唯一允许删除文件的地方（P-03 的例外）：删掉**程序自己刚生成的**临时文件。
 * 路径由 `tmpPathFor` 构造，不接受任何外部输入。
 */
async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p)
  } catch {
    /* 已经不存在就无所谓 */
  }
}

/* ── 写入串行化（按文件分队列，不同文件不互相阻塞）──────────────────── */

const queues = new Map<string, Promise<unknown>>()

export function enqueueWrite<T>(file: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(file) ?? Promise.resolve()
  // 前一个失败也要继续执行后一个 —— 否则一次失败会卡死整条队列
  const next = prev.then(job, job)
  queues.set(
    file,
    next.catch(() => {}),
  )
  return next
}

/** 供测试等待队列排空 */
export async function drainWrites(): Promise<void> {
  await Promise.allSettled([...queues.values()])
  queues.clear()
}

/* ── 读取：信封解析 + 版本判定 + 迁移 + 损坏恢复 ─────────────────────── */

export type Migration = (payload: any) => any

export interface ReadStoreOptions<T> {
  name: StoreName
  /** 当前 schema 版本 */
  currentVersion: number
  /** 每个 store 一张迁移表：key = 从哪个版本升到 key+1 */
  migrations: Record<number, Migration>
  fallback: T
  /** 结构校验：JSON 合法但结构不符时同样算损坏 */
  validate: (payload: unknown) => payload is T
}

export interface ReadStoreResult<T> {
  payload: T
  /** 是否因损坏 / 版本过新而被重置为默认值 */
  reset: boolean
}

export async function readStore<T extends object>(opts: ReadStoreOptions<T>): Promise<ReadStoreResult<T>> {
  const { name, currentVersion, migrations, fallback, validate } = opts
  const file = storePath(name)

  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      // ① 文件不存在 → 返回默认值，不报错、不创建文件
      return { payload: fallback, reset: false }
    }
    // 被其他程序锁定 → **不备份**（不是损坏），返回默认值 + 下次读取重试
    notify({
      file: name,
      kind: 'corrupted',
      message: `${STORE_FILES[name]} 暂时读不出来（可能被其他程序占用），本次使用默认值`,
    })
    return { payload: fallback, reset: true }
  }

  // ② 空文件不算「空数据」，算损坏
  if (raw.trim() === '') {
    return corrupt(name, file, fallback, '空文件')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return corrupt(name, file, fallback, 'JSON 解析失败')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return corrupt(name, file, fallback, '顶层不是对象')
  }

  const env = parsed as Partial<Envelope<unknown>>
  // ③ 缺 schemaVersion → 当作 0，走迁移链
  const version = Number.isInteger(env.schemaVersion) ? (env.schemaVersion as number) : 0

  // ④ 版本比软件新 → 不迁移、不写入、备份、告知
  if (version > currentVersion) {
    const backup = backupFile(file, 'future')
    writeBlocked.add(name)
    notify({
      file: name,
      kind: 'corrupted',
      backupPath: backup,
      message: '数据文件版本比软件更新，已备份并跳过',
    })
    return { payload: fallback, reset: true }
  }

  // 结构校验：JSON 合法但结构不符 → 同样算损坏
  if (!validate(env.payload)) {
    return corrupt(name, file, fallback, '结构不符')
  }

  // ⑤ 版本更旧 → 逐级迁移（迁移前备份，迁移后立即落盘）
  let payload: unknown = env.payload
  if (version < currentVersion) {
    const backup = backupFile(file, `v${version}`)
    try {
      for (let v = version; v < currentVersion; v++) {
        const m = migrations[v]
        if (m) payload = m(payload)
      }
      await writeJsonAtomic(file, { schemaVersion: currentVersion, appVersion: env.appVersion ?? '0.0.0', payload })
      void backup
    } catch {
      // 迁移失败不阻止软件启动
      notify({ file: name, kind: 'corrupted', backupPath: backup, message: '数据文件迁移失败，已备份并重置' })
      return { payload: fallback, reset: true }
    }
  }

  if (!validate(payload)) {
    return corrupt(name, file, fallback, '迁移后结构不符')
  }

  return { payload, reset: false }
}

function corrupt<T extends object>(
  name: StoreName,
  file: string,
  fallback: T,
  reason: string,
): ReadStoreResult<T> {
  const backup = backupFile(file, 'corrupt')
  notify({
    file: name,
    kind: 'corrupted',
    backupPath: backup,
    message: `${STORE_FILES[name]} 损坏（${reason}），已重置`,
  })
  return { payload: fallback, reset: true }
}

/* ── 备份与清理 ─────────────────────────────────────────────────────── */

/** ISO 时间戳去掉冒号与短横线，保证文件名合法 */
function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
}

function backupFile(file: string, tag: string): string {
  const target = join(dirname(file), `${basename(file).replace(/\.json$/, '')}.${tag}-${stamp()}.json`)
  try {
    // 用 copyFile 而非 rename：坏文件保留在原处，用户还能自己打开看
    copyFileSync(file, target)
  } catch {
    /* 备份失败不影响主流程 */
  }
  pruneBackups(dirname(file), basename(file).replace(/\.json$/, ''))
  return target
}

/** 最多保留最近 3 个损坏备份（数据库设计 §9）*/
function pruneBackups(dir: string, stem: string): void {
  try {
    const files = readdirSync(dir)
      .filter((n) => n.startsWith(`${stem}.`) && /\.(corrupt|future|v\d+)-\d{8}T\d+\.json$/.test(n))
      .map((n) => ({ n, mtime: statSync(join(dir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const f of files.slice(MAX_CORRUPT_BACKUPS)) {
      unlinkSync(join(dir, f.n))
    }
  } catch {
    /* 目录不可读就算了 */
  }
}

/**
 * 启动时清理 `.tmp-*` 残留（数据库设计 §7.2）。
 *
 * **加「超过 1 天」这个条件**：不加的话，若用户在写入的瞬间启动第二个实例
 * （虽然打了单实例锁，但时间窗口极小），会把正在使用的临时文件删掉。
 * 只清理确定已经废弃的文件 —— 这是「谨慎删除」的一贯做法。
 */
export function cleanupStaleTemp(dir: string): number {
  let removed = 0
  try {
    for (const n of readdirSync(dir)) {
      if (!/^\..+\.tmp-\d+-\d+$/.test(n)) continue
      const p = join(dir, n)
      try {
        if (Date.now() - statSync(p).mtimeMs > TMP_STALE_MS) {
          unlinkSync(p)
          removed++
        }
      } catch {
        /* 单个文件失败不影响其余 */
      }
    }
  } catch {
    /* 目录不存在等 */
  }
  return removed
}

/** 供测试直接同步读（不参与迁移）*/
export function readRawSync(file: string): string {
  return readFileSync(file, 'utf8')
}
