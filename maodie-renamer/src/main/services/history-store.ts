/**
 * 历史记录与撤销（数据库设计 §4 / PRD §4.5）。
 *
 * ── 三条不可动摇的规则 ──────────────────────────────────────────────
 * 1. `entries` **只记录改名成功的项**。跳过 / 失败 / 非法的项根本没改变磁盘
 *    状态，记下来只会让撤销变成「试图还原一个从未被改过的文件」。
 *    顺带把极端场景的明细量从 20 万条压到可控范围。
 * 2. **淘汰不静默**：从最旧整条淘汰（不切半条），**最新任务永不淘汰**。
 * 3. **撤销不产生新记录**：只把 status 改成 `undone`，`undone` 是终态。
 */

import { HISTORY_MAX_TASKS, HISTORY_MAX_TOTAL_ENTRIES } from '@shared/constants'
import { MD_ERROR, MdError } from '@shared/errors'
import type { ExecuteResult, RenameTask, UndoAllResult, UndoResult } from '@shared/types'
import { undoEntries, type ProgressFn } from './rename-executor'
import { CURRENT_VERSION, MIGRATIONS } from './migrations'
import { enqueueWrite, isWriteBlocked, readStore, storePath, writeJsonAtomic } from './storage'
import { getAppVersion } from './prefs-store'

/* ── 内存镜像 ──────────────────────────────────────────────────────── */

let tasks: RenameTask[] = []

function isHistoryPayload(p: unknown): p is { tasks: RenameTask[] } {
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray((p as { tasks?: unknown }).tasks)
  )
}

/** 排序永远以 `createdAt` 为准（不依赖数组顺序），最新在前 */
function sortDesc(list: RenameTask[]): RenameTask[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadHistory(): Promise<boolean> {
  const { payload, reset } = await readStore<{ tasks: RenameTask[] }>({
    name: 'history',
    currentVersion: CURRENT_VERSION.history,
    migrations: MIGRATIONS.history,
    fallback: { tasks: [] },
    validate: isHistoryPayload,
  })
  tasks = sortDesc(payload.tasks)
  return reset
}

export function listTasks(): RenameTask[] {
  return sortDesc(tasks)
}

/* ── 容量治理（数据库设计 §4.4.3）──────────────────────────────────── */

function sumEntries(list: RenameTask[]): number {
  return list.reduce((n, t) => n + t.entries.length, 0)
}

/**
 * 找出「最旧」那一条的下标。
 *
 * ★ 必须从**末尾往前**找最小值：数组是「最新在前」，当多条任务的 `createdAt`
 * 相同时（连续改名很容易落在同一毫秒），从前往后找会返回下标 0 —— 也就是
 * **最新那条**，于是淘汰逻辑会误判成「最旧的就是最新」，直接 break 掉不淘汰。
 */
function oldestIndex(list: RenameTask[]): number {
  let idx = list.length - 1
  for (let i = list.length - 2; i >= 0; i--) {
    if (list[i].createdAt < list[idx].createdAt) idx = i
  }
  return idx
}

/** @returns 被淘汰的任务条数（供界面显式提示，不静默）*/
export function evict(): number {
  if (tasks.length === 0) return 0
  const newestId = tasks.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b)).id
  let evicted = 0

  // ① 任务条数硬上限（DEC-06）
  while (tasks.length > HISTORY_MAX_TASKS) {
    const i = oldestIndex(tasks)
    if (tasks[i].id === newestId) break // ★ 最新任务永不淘汰
    tasks.splice(i, 1)
    evicted++
  }

  // ② 总明细条数软上限 —— 把极端场景从 36MB 压到约 9MB
  while (sumEntries(tasks) > HISTORY_MAX_TOTAL_ENTRIES && tasks.length > 1) {
    const i = oldestIndex(tasks)
    if (tasks[i].id === newestId) break
    tasks.splice(i, 1)
    evicted++
  }

  return evicted
}

/* ── 写入 ──────────────────────────────────────────────────────────── */

async function persist(): Promise<void> {
  if (isWriteBlocked('history')) {
    throw new MdError(MD_ERROR.E_UNKNOWN, 'history.json 版本比软件新，已拒绝写入')
  }
  const file = storePath('history')
  await enqueueWrite(file, () =>
    writeJsonAtomic(file, {
      schemaVersion: CURRENT_VERSION.history,
      appVersion: getAppVersion(),
      payload: { tasks },
    }),
  )
}

/** 由一次改名结果构造历史记录。`entries` 只含成功项 */
export function buildTask(taskId: string, date: string, ruleSummary: string, result: ExecuteResult, entries: RenameTask['entries']): RenameTask {
  return {
    id: taskId,
    createdAt: Date.now(),
    date,
    ruleSummary,
    status: 'active',
    undoneAt: null,
    entries,
    counts: { ...result.summary },
  }
}

/** @returns 是否成功写入（false 时界面必须明确警告「本次改名无法撤销」）*/
export async function appendTask(task: RenameTask): Promise<boolean> {
  try {
    tasks = sortDesc([task, ...tasks])
    evict()
    await persist()
    return true
  } catch (err) {
    // ★ 写历史失败绝不能让改名流程失败：文件已经改好了，
    //   此时报「改名失败」是错上加错（用户会以为没改成，重新再改一次）
    console.warn('[md] 写入历史记录失败：', err)
    return false
  }
}

/* ── 清空（P2-C · IX-101 / EX-17）──────────────────────────────────── */

/**
 * 清空**全部**历史记录。
 *
 * ★ 红线（数据库设计 §4.7 / 技术方案 §11 遗留项 13）：
 *   **只删记录，绝不触碰任何文件** —— 本函数里不出现任何 fs 改名调用。
 *   文案里那句「文件本身不会被删除，也不会被改名」就是这条的对外承诺。
 *
 * ★ 落盘失败要回滚内存：否则会出现「界面空了、磁盘还在」——
 *   用户下次启动记录又冒出来，会以为软件骗他。
 *
 * @returns 被清掉的条数（供状态栏文案「已清空全部 N 条历史记录」）
 */
export async function clearAllTasks(): Promise<number> {
  const n = tasks.length
  if (n === 0) return 0

  const backup = tasks
  tasks = []
  try {
    await persist()
  } catch (err) {
    tasks = backup
    throw err
  }
  return n
}

/* ── 撤销 ──────────────────────────────────────────────────────────── */

function findTask(taskId: string): RenameTask {
  const t = tasks.find((x) => x.id === taskId)
  if (!t) throw new MdError(MD_ERROR.E_TASK_NOT_FOUND, taskId)
  return t
}

/** 撤销单个任务。**不改动其他任务，也不产生新记录** */
export async function undoTask(taskId: string, onProgress: ProgressFn): Promise<UndoResult> {
  const t0 = Date.now()
  const task = findTask(taskId)

  // 前置校验：已是终态 → 安全性幂等（不会二次改名）
  if (task.status !== 'active') {
    throw new MdError(MD_ERROR.E_UNDO_ALREADY, taskId)
  }

  const { restored, skipped, anySuccess } = await undoEntries(taskId, task.entries, onProgress)

  task.status = 'undone'
  task.undoneAt = Date.now()
  await persist().catch((err) => {
    console.warn('[md] 撤销后写入历史失败：', err)
  })

  const status: UndoResult['status'] =
    skipped.length === 0 ? 'ok' : restored > 0 || anySuccess ? 'partial' : 'failed'

  return { taskId, status, restored, skipped, elapsedMs: Date.now() - t0 }
}

/**
 * 全部撤销（IX-072）：把 `status === 'active'` 的任务**按时间倒序**
 * （最新先撤）逐条撤销；任一条失败不中断，最后汇总。
 */
export async function undoAll(onProgress: ProgressFn): Promise<UndoAllResult> {
  const active = sortDesc(tasks).filter((t) => t.status === 'active')
  const perTask: UndoAllResult['perTask'] = []
  let restoredFiles = 0
  let skippedTotal = 0
  let undoneTasks = 0

  for (const t of active) {
    try {
      const r = await undoTask(t.id, onProgress)
      perTask.push({ taskId: t.id, status: r.status, restored: r.restored })
      restoredFiles += r.restored
      skippedTotal += r.skipped.length
      if (r.status !== 'failed') undoneTasks++
    } catch (err) {
      const code = err instanceof MdError ? err.code : MD_ERROR.E_UNKNOWN
      perTask.push({ taskId: t.id, status: code === MD_ERROR.E_UNDO_ALREADY ? 'already_undone' : 'failed', restored: 0 })
    }
  }

  return { taskCount: active.length, undoneTasks, restoredFiles, skippedTotal, perTask }
}

