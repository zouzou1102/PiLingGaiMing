/**
 * 文件系统安全原语 —— 「绝不覆盖」的第 3 层防护（技术方案 §4.2.1 / §7.1）。
 *
 * 本模块与 rename-executor.ts 分开，是为了让 ESLint 的 P-02 规则能生效：
 * `rename-executor.ts` 内**禁止出现裸 rename**，只允许调用这里的 `safeRename`。
 * 如果把 `safeRename` 写在执行器内部，lint 就分不出「允许的那一次」与
 * 「禁止的其它次」—— 规则会形同虚设。
 *
 * ⚠ 为什么 `existsInsensitive` 是真正的承重墙：
 * Node 在 Windows 上调用 `fs.rename` 时走的是 `MoveFileEx` +
 * `MOVEFILE_REPLACE_EXISTING` —— **rename 本身就会直接覆盖目标**。
 * 所以「绝不覆盖」完全依赖改名前的存在性检查，而不是依赖 rename 的行为。
 * 这一点决定了下面两个函数不能有任何「猜」的成分：
 *   · 目录读不出来时**不能当作「目标不存在」**（那等于放弃检查）
 *   · 排除源自身时**只能排除源那一个名字**，不能放宽成「不检查」
 */

import { constants as FS_CONSTANTS, promises as fsp } from 'node:fs'
import { MD_ERROR, MdError, type MdErrorCode } from '@shared/errors'
import { baseName, dirName, joinPath } from '@shared/path-utils'

/**
 * 读目录清单。
 * - 返回 `null` 表示**目录确定不存在** → 其中的目标必然也不存在，可以继续
 * - 抛 `MdError(E_PERM)` 表示**读不出来但不是不存在** → 无法确认，
 *   宁可拒绝改名也不冒险覆盖
 */
export async function listDirOrNull(dir: string): Promise<string[] | null> {
  try {
    return await fsp.readdir(dir === '' ? '.' : dir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw new MdError(MD_ERROR.E_PERM, dir)
  }
}

/**
 * 不区分大小写地判断目标是否已存在。
 *
 * 不用 `existsSync`：直接 existsSync 在 Windows 上本来就不区分大小写，
 * 但为了行为一致与可测试（开发机上可能是 Linux），统一走
 * 「读目录 + 小写集合比对」。
 *
 * @param exceptBaseName 允许忽略的那**一个**名字（撤销 case-only 改名时，
 *   匹配到的「已存在」其实就是要被改名的源自己）。除此以外一律照拦。
 */
export async function existsInsensitive(
  target: string,
  exceptBaseName?: string,
): Promise<boolean> {
  const names = await listDirOrNull(dirName(target))
  if (names === null) return false

  const lower = baseName(target).toLowerCase()
  const except = exceptBaseName?.toLowerCase()

  return names.some((n) => {
    const nl = n.toLowerCase()
    if (nl !== lower) return false
    // 名字相同但就是源自身 → 不算冲突
    if (except !== undefined && nl === except) return false
    return true
  })
}

/**
 * ★ 唯一允许的改名原语。它不可能覆盖任何东西。
 *
 * 抛出的 `MdError(E_CONFLICT_DISK)` 表示「目标已存在，拒绝覆盖」；
 * 抛 `MdError(E_PERM)` 表示「无法确认目标是否存在」，同样拒绝。
 */
export async function safeRename(from: string, to: string): Promise<void> {
  // 同目录改名是本产品的硬约束（P-08），因此源名与目标名可直接按 basename 比较
  const self = baseName(from)
  if (await existsInsensitive(to, self)) {
    throw new MdError(MD_ERROR.E_CONFLICT_DISK, to)
  }
  await fsp.rename(from, to)
}

/**
 * 把 Node 的 fs 错误码映射成产品的错误码（接口文档 §6.1）。
 *
 * Windows 上「文件被占用」和「无权限」可能报同一个 `EPERM`，必须做一次区分：
 * 再探一次目录是否可写 —— 能写说明是被占用，不能写说明是权限。
 * **这个探测只在出错路径上跑，正常流程零开销。**
 */
export async function toMdErrorCode(err: unknown, dirPath: string): Promise<MdErrorCode> {
  if (err instanceof MdError) return err.code

  const code = (err as NodeJS.ErrnoException | undefined)?.code
  switch (code) {
    case 'EBUSY':
      return MD_ERROR.E_BUSY
    case 'EACCES':
      return MD_ERROR.E_PERM
    case 'ENOENT':
      return MD_ERROR.E_SOURCE_MISSING
    case 'EPERM': {
      const canWrite = await fsp.access(dirPath, FS_CONSTANTS.W_OK).then(
        () => true,
        () => false,
      )
      return canWrite ? MD_ERROR.E_BUSY : MD_ERROR.E_PERM
    }
    default:
      // 归到 E_UNKNOWN 时把原始错误打出来 —— 否则线上只能看到「出了点小意外」，
      // 完全无从定位（本项目的第一次集成测试就是被这一条掩盖了真实原因）
      console.warn('[md] 未归类的文件系统错误：', err)
      return MD_ERROR.E_UNKNOWN
  }
}

/** 拼接「目录 + 名称」 */
export function pathOf(dirPath: string, name: string): string {
  return joinPath(dirPath, name)
}
