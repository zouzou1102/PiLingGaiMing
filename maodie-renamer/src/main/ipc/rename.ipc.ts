/**
 * md:rename:* —— 改名执行与取消（业务通道）。
 *
 * 进度事件用 `webContents.send` 推送，节流由执行器负责（每 50 项 / 每 100ms）。
 * 10000 项若每项推一次就是 10000 次 IPC + 10000 次 Vue 更新，界面必然卡死。
 */

import { ipcMain } from 'electron'
import { CH } from '@shared/channels'
import { MD_ERROR, MdError } from '@shared/errors'
import { DEFAULT_RULE, type ExecuteRequest, type RuleConfig } from '@shared/types'
import { cancelRenameTask, runRenameTask } from '../services/rename-service'
import { getMainWindow } from '../window'
import { business } from './result'

/** 不信任渲染层：把入参逐字段收敛成合法形状 */
function sanitizeRule(raw: unknown): RuleConfig {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const r = (typeof src.rule === 'object' && src.rule !== null ? src.rule : {}) as Record<string, unknown>
  const del = (typeof src.delete === 'object' && src.delete !== null ? src.delete : {}) as Record<string, unknown>
  const rep = (typeof src.replace === 'object' && src.replace !== null ? src.replace : {}) as Record<string, unknown>

  const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

  const mode = src.mode === 'replace' || src.mode === 'rule' ? src.mode : 'delete'
  const seqPosition = r.seqPosition === 'prefix' ? 'prefix' : 'suffix'
  const dateFormat =
    r.dateFormat === 'YYYYMMDD' || r.dateFormat === 'YYYY年MM月DD日' ? r.dateFormat : 'YYYY-MM-DD'

  return {
    mode,
    caseSensitive: bool(src.caseSensitive, DEFAULT_RULE.caseSensitive),
    autoResolveConflict: bool(src.autoResolveConflict, DEFAULT_RULE.autoResolveConflict),
    delete: { text: str(del.text) },
    replace: { find: str(rep.find), to: str(rep.to) },
    rule: {
      prefix: str(r.prefix),
      suffix: str(r.suffix),
      seqEnabled: bool(r.seqEnabled, false),
      seqStart: Math.max(0, Math.trunc(num(r.seqStart, 1))),
      seqStep: Math.max(1, Math.trunc(num(r.seqStep, 1))),
      seqPad: Math.min(6, Math.max(0, Math.trunc(num(r.seqPad, 3)))),
      seqPosition,
      dateEnabled: bool(r.dateEnabled, false),
      dateFormat,
      keepOriginal: bool(r.keepOriginal, true),
    },
  }
}

function sanitizeExecute(raw: unknown): ExecuteRequest {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const items = Array.isArray(src.items) ? src.items : []

  return {
    taskId: typeof src.taskId === 'string' && src.taskId !== '' ? src.taskId : `task-${Date.now()}`,
    items: items
      .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
      .map((it, i) => ({
        id: typeof it.id === 'string' ? it.id : `id-${i}`,
        dirPath: typeof it.dirPath === 'string' ? it.dirPath : '',
        fromName: typeof it.fromName === 'string' ? it.fromName : '',
        isDir: it.isDir === true,
      }))
      // 目录与名称是必需项；缺一个就直接拒绝，绝不猜
      .filter((it) => it.dirPath !== '' && it.fromName !== ''),
    rule: sanitizeRule(src.rule),
    date: typeof src.date === 'string' ? src.date : '',
    autoResolveConflict: src.autoResolveConflict === true,
  }
}

export function registerRenameIpc(): void {
  ipcMain.handle(CH.RENAME_EXECUTE, (_e, raw: unknown) =>
    business(async () => {
      const req = sanitizeExecute(raw)
      if (req.items.length === 0) throw new MdError(MD_ERROR.E_LIST_EMPTY)
      return runRenameTask(req, (progress) => {
        getMainWindow()?.webContents.send(CH.EV_RENAME_PROGRESS, progress)
      })
    }),
  )

  ipcMain.handle(CH.RENAME_CANCEL, (_e, raw: unknown) =>
    business(async () => {
      const taskId = (raw as { taskId?: unknown } | null)?.taskId
      if (typeof taskId !== 'string' || taskId === '') {
        throw new MdError(MD_ERROR.E_TASK_NOT_FOUND)
      }
      return cancelRenameTask(taskId)
    }),
  )
}
