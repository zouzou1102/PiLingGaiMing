/**
 * 冲突检测（F-16 / DEC-05 / 技术方案 §4.1.4）。
 *
 * **这是整个产品最重要的一段逻辑。** 它必须同时处理两种冲突，
 * 且绝不产生覆盖语义：
 *   · `batch` 批次内两项撞名（EX-05）
 *   · `disk`  与目录下已有文件撞名（EX-06）
 *
 * ── 目录快照为什么必须「剔除会腾空的源名称」──────────────────────────
 *
 * ```
 * 目录 D 下现有：  A.txt,  B.txt
 * 本批次要改：     A.txt → C.txt，  B.txt → A.txt
 *
 * 若不剔除：检查 B.txt → A.txt 时发现 A.txt「已存在」→ 误判磁盘冲突。
 *           但实际执行时 A.txt 会先被改成 C.txt，这个位置是空的。
 * 剔除后：  可用集合 = {A.txt,B.txt} − {A.txt(源),B.txt(源)} = {} → 不是冲突 ✓
 * ```
 *
 * 这是「两阶段改名」在检测侧的对应物 —— 两半缺一不可。
 *
 * ── 本实现对文档的一处**收紧**（不是偏离，是补齐）────────────────────
 *
 * 剔除源名称时，只剔除「**确实会腾空**」的那些：即 `fromName` 与 `toName`
 * 不相同的项。理由是有一条文档未覆盖的真实边界：
 *
 * ```
 * 批次：a.txt → a.txt（无变化，不算入列改名） 与  b.txt → a.txt
 * 若把 a.txt 当作「源名称」无条件剔除，则 b.txt → a.txt 会被漏判为「无冲突」；
 * 但 a.txt 并不会被改走，它仍在磁盘上 → 执行时真的会撞。
 * ```
 *
 * 收紧后，预览与执行（执行侧还有 safeRename 兜底）判定一致。
 */

import { CONFLICT_MAX_RETRY } from './constants'
import { MD_ERROR, type MdErrorCode } from './errors'
import { splitName } from './name-split'
import { dirKey } from './path-utils'
import type { ConflictKind } from './types'

export interface DirSnapshot {
  /** 目录绝对路径（已归一化，保留原大小写用于显示）*/
  dirPath: string
  /** 该目录下的现存名称（未剔除源名称）*/
  names: string[]
}

export interface ConflictInput {
  /** 列表项 id，用于把结果映射回去 */
  id: string
  dirPath: string
  /** 当前名（含扩展名）*/
  fromName: string
  /** 目标名（含扩展名）*/
  toName: string
  isDir: boolean
}

export interface ConflictResult {
  kind: ConflictKind
  /** 撞上的那个名字，用于界面显示「已经有同名文件了」 */
  conflictWith?: string
}

export interface ConflictOutcome {
  input: ConflictInput
  result: ConflictResult
  /** 开启「自动加序号」且原本冲突时，为该项算出的最终名字 */
  resolvedName?: string
  /** 自动加序号失败（99 次仍冲突）时的原因码 */
  code?: MdErrorCode
}

/** 把 IPC 传过来的普通对象快照转成可查询的 Map（键 = 归一化目录路径）*/
export function toSnapshotMap(record: Record<string, string[]>): Map<string, DirSnapshot> {
  const map = new Map<string, DirSnapshot>()
  for (const [dirPath, names] of Object.entries(record)) {
    map.set(dirKey(dirPath), { dirPath, names })
  }
  return map
}

/**
 * 按「扩展名之前」追加补救序号（DEC-05）。
 * `报告.docx` → `报告_1.docx`；无扩展名 `说明` → `说明_1`
 */
export function appendResolveSuffix(name: string, i: number, isDir: boolean): string {
  const { stem, ext } = splitName(name, isDir)
  return `${stem}_${i}${ext}`
}

interface Availability {
  /** dirKey → 可用名称的小写集合 */
  names: Map<string, Set<string>>
  /** dirKey → 原始大小写的可用名称，用于界面提示「撞上了谁」 */
  raw: Map<string, string[]>
}

/**
 * 构造「目录可用名称集合」。
 *
 * 只剔除**确实会腾空**的源名称（见文件头说明）。`moves` 必须是**已算出新名**
 * 之后的清单，否则判断不出哪些项会腾空。
 */
export function buildAvailability(
  snapshots: Map<string, DirSnapshot>,
  moves: Array<{ dirPath: string; fromName: string; toName: string }>,
): Availability {
  const vacated = new Map<string, Set<string>>()
  for (const m of moves) {
    // 名字没变（含仅大小写变化的保留情形以外的情况）→ 该位置不会被腾空
    if (m.fromName === m.toName) continue
    const k = dirKey(m.dirPath)
    let set = vacated.get(k)
    if (!set) {
      set = new Set()
      vacated.set(k, set)
    }
    set.add(m.fromName.toLowerCase())
  }

  const names = new Map<string, Set<string>>()
  const raw = new Map<string, string[]>()
  for (const [k, snap] of snapshots) {
    const gone = vacated.get(k)
    const kept = gone ? snap.names.filter((n) => !gone.has(n.toLowerCase())) : snap.names.slice()
    names.set(k, new Set(kept.map((n) => n.toLowerCase())))
    raw.set(k, kept)
  }
  return { names, raw }
}

/**
 * 判定顺序（严格按此顺序，短路返回）：
 *
 * ```
 * 1. toName 与 fromName 完全相同（含大小写）→ 'self'（无变化，界面显示 —）
 * 2. 仅大小写不同                          → 'case-only'
 * 3. toName 在「批次已分配目标名集合」中    → 'batch'
 * 4. toName 在「目录可用名称集合」中        → 'disk'
 * 5. 否则                                  → 'none'，并记入已分配集合
 * ```
 *
 * `case-only` 的处置（本方案新增，PRD 未覆盖）：Windows 上
 * `rename('a.txt','A.txt')` 行为在部分文件系统 / 网络盘上不一致。
 * 决定：**不算冲突、允许执行**，但强制走两阶段（阶段 1 先改成临时名，
 * 天然绕开该问题），预览中也不标红。
 *
 * 注意：`self` 与 `case-only` 的目标名同样要登记进「已分配集合」——
 * 否则 `a.txt → A.txt` 与 `c.txt → A.txt` 这种真实撞名会被漏判。
 */
export function detectConflicts(
  inputs: ConflictInput[],
  snapshots: Map<string, DirSnapshot>,
  autoResolve: boolean,
): ConflictOutcome[] {
  const availability = buildAvailability(
    snapshots,
    inputs.map((i) => ({ dirPath: i.dirPath, fromName: i.fromName, toName: i.toName })),
  )

  /** dirKey → 已分配目标名（小写） */
  const allocated = new Map<string, Set<string>>()
  const outcomes: ConflictOutcome[] = []

  for (const input of inputs) {
    const k = dirKey(input.dirPath)
    const taken = allocated.get(k) ?? new Set<string>()
    const available = availability.names.get(k) ?? new Set<string>()
    const fromLower = input.fromName.toLowerCase()
    const toLower = input.toName.toLowerCase()

    // ① 完全相同 → 无变化
    if (input.toName === input.fromName) {
      outcomes.push({ input, result: { kind: 'self' } })
      continue
    }

    // ② 仅大小写不同 → 允许执行，不标红
    if (toLower === fromLower) {
      taken.add(toLower)
      allocated.set(k, taken)
      outcomes.push({ input, result: { kind: 'case-only' } })
      continue
    }

    // ③④ 批次内 / 磁盘冲突
    const batchHit = taken.has(toLower)
    const diskHit = available.has(toLower)

    if (!batchHit && !diskHit) {
      taken.add(toLower)
      allocated.set(k, taken)
      outcomes.push({ input, result: { kind: 'none' } })
      continue
    }

    // 冲突。默认策略：跳过（DEC-05 的默认值，绝不覆盖）
    if (!autoResolve) {
      outcomes.push({
        input,
        result: {
          kind: batchHit ? 'batch' : 'disk',
          conflictWith: batchHit ? undefined : findRaw(availability.raw.get(k), toLower),
        },
      })
      // 注意：被跳过项的目标名**不登记**进已分配集合，
      // 否则会把「本来不冲突的后续项」误判成冲突。
      continue
    }

    // 开启「自动加序号」：最多尝试 99 次，仍冲突则退回 skip
    const resolved = tryResolve(input, available, taken)
    if (resolved) {
      taken.add(resolved.toLowerCase())
      allocated.set(k, taken)
      outcomes.push({ input, result: { kind: 'none' }, resolvedName: resolved })
    } else {
      outcomes.push({
        input,
        result: {
          kind: batchHit ? 'batch' : 'disk',
          conflictWith: batchHit ? undefined : findRaw(availability.raw.get(k), toLower),
        },
        code: batchHit ? MD_ERROR.E_CONFLICT_BATCH : MD_ERROR.E_CONFLICT_DISK,
      })
    }
  }

  return outcomes
}

function findRaw(list: string[] | undefined, lower: string): string | undefined {
  return list?.find((n) => n.toLowerCase() === lower)
}

function tryResolve(
  input: ConflictInput,
  available: Set<string>,
  taken: Set<string>,
): string | undefined {
  for (let i = 1; i <= CONFLICT_MAX_RETRY; i++) {
    const candidate = appendResolveSuffix(input.toName, i, input.isDir)
    const lower = candidate.toLowerCase()
    if (lower === input.fromName.toLowerCase()) continue
    if (available.has(lower) || taken.has(lower)) continue
    return candidate
  }
  return undefined
}
