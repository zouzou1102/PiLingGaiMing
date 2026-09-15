/**
 * 历史明细的纯逻辑（P2-C · EL-112）。
 *
 * 为什么单拎一个文件：**「只渲染前 100 条」是一条可验证的规则**，
 * 写在组件里就只能靠肉眼看；放共享层能被单测直接钉住。
 *
 * ⚠️ 刻意不实现设计稿里的「（无变化）」分支：
 * `RenameTask.entries` 的定义是「**只记录改名成功的明细**」（types.ts），
 * 执行器也只 push 成功项（rename-executor.ts）。所以 `toName === fromName`
 * 的项根本进不来 —— 那是个死分支，写了也测不到。
 *
 * ── 淘汰检测 ──────────────────────────────────────────────────────────
 * `detectEviction` 也放这里，因为它和明细一样是「界面行为背后的纯判定」，
 * 而它承载了一条**很容易漏的红线**（见函数注释）。
 */
import type { RenameEntry } from './types'

/** 明细一次最多渲染多少行（设计 §1.4 取舍 1：一个任务可能几千条，全渲染会卡）*/
export const DETAIL_RENDER_LIMIT = 100

export interface DetailRow {
  /** 序号，从 1 开始（界面右对齐显示）*/
  index: number
  fromName: string
  toName: string
}

export function detailRows(entries: RenameEntry[]): DetailRow[] {
  return entries.map((e, i) => ({ index: i + 1, fromName: e.fromName, toName: e.toName }))
}

export function visibleDetailRows(
  entries: RenameEntry[],
  limit: number = DETAIL_RENDER_LIMIT,
): { rows: DetailRow[]; hidden: number; total: number } {
  const total = entries.length
  return { rows: detailRows(entries.slice(0, limit)), hidden: Math.max(0, total - limit), total }
}

export function hiddenDetailText(hidden: number, total: number): string {
  return `还有 ${hidden} 项未显示（共 ${total} 项）`
}

/* ══ 淘汰检测（DEC-09「淘汰不静默」）═══════════════════════════════════ */

/**
 * 判断「本次刷新是否发生了系统淘汰」。
 *
 * ★ **用户主动清空时两个条件恰好同时成立**：
 *   列表变空 → 本次最旧 id 变 null；而上次最旧 id 是真实 id；且 0 <= 上次计数。
 *   不特判就会弹「为保证性能，较旧的记录已被清理」—— 用户自己点的清空，
 *   却被系统告知「系统帮你清了」，是**假警报**（P2-C §2.6）。
 *
 * 所以这里把「本次为空」显式排除：空列表一律不算淘汰。
 * 清空后由 store 调 `resetEvictionBaseline()` 把基准也置空，两侧一起兜住。
 *
 * @param lastOldestId 上一份列表里最旧那条的 id（清空后必须置回 null）
 * @param lastCount    上一份列表的长度
 * @param next         本次拿到的列表（约定：最新在前）
 */
export function detectEviction(
  lastOldestId: string | null,
  lastCount: number,
  next: { id: string }[],
): 0 | 1 {
  if (next.length === 0) return 0
  const nextOldestId = next[next.length - 1].id
  if (lastOldestId !== null && nextOldestId !== lastOldestId && next.length <= lastCount) return 1
  return 0
}
