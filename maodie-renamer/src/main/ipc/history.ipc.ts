/**
 * md:history:* —— 列表、单条撤销、全部撤销（业务通道）。
 *
 * 撤销的进度也走 `md:rename:progress`（phase = 'to_temp'）——
 * 撤销本质就是一批改名，复用同一条事件通道，不必新增。
 */

import { ipcMain } from 'electron'
import { CH } from '@shared/channels'
import { MD_ERROR, MdError } from '@shared/errors'
import { listTasks, undoAll, undoTask } from '../services/history-store'
import { getMainWindow } from '../window'
import { business } from './result'

const emitProgress = (payload: unknown): void => {
  getMainWindow()?.webContents.send(CH.EV_RENAME_PROGRESS, payload)
}

function taskIdOf(raw: unknown): string {
  const id = (raw as { taskId?: unknown } | null)?.taskId
  if (typeof id !== 'string' || id === '') throw new MdError(MD_ERROR.E_TASK_NOT_FOUND)
  return id
}

export function registerHistoryIpc(): void {
  ipcMain.handle(CH.HISTORY_LIST, () => business(async () => listTasks()))

  ipcMain.handle(CH.HISTORY_UNDO_TASK, (_e, raw: unknown) =>
    business(() => undoTask(taskIdOf(raw), emitProgress)),
  )

  ipcMain.handle(CH.HISTORY_UNDO_ALL, () => business(() => undoAll(emitProgress)))
}
