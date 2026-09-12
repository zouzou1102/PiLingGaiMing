/**
 * md:fs:* —— 文件系统与系统对话框。
 *
 * 关于 DEC-01 的实现保证：`md:fs:pickDirectory` **永远只返回选中的那一个路径**，
 * 不做任何子项枚举。递归能力从接口形状上就不存在 —— 界面拿到的就是一个字符串。
 */

import { dialog, ipcMain } from 'electron'
import { CH } from '@shared/channels'
import { MD_ERROR, MdError } from '@shared/errors'
import type { ResolvePathsRequest, ResolvedBatch } from '@shared/types'
import { resolvePaths } from '../services/fs-scan'
import { getMainWindow } from '../window'
import { business } from './result'

function sanitize(req: unknown): ResolvePathsRequest {
  const src = (typeof req === 'object' && req !== null ? req : {}) as Record<string, unknown>
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return { paths: asArray(src.paths), existingPaths: asArray(src.existingPaths) }
}

export function registerFsIpc(): void {
  ipcMain.handle(CH.FS_PICK_FILES, () =>
    business(async () => {
      const win = getMainWindow()
      if (!win) throw new MdError(MD_ERROR.E_UNKNOWN, '窗口不存在')
      const r = await dialog.showOpenDialog(win, {
        title: '选择要改名的文件',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '所有文件', extensions: ['*'] }],
      })
      return { canceled: r.canceled, paths: r.filePaths }
    }),
  )

  ipcMain.handle(CH.FS_PICK_DIRECTORY, () =>
    business(async () => {
      const win = getMainWindow()
      if (!win) throw new MdError(MD_ERROR.E_UNKNOWN, '窗口不存在')
      const r = await dialog.showOpenDialog(win, {
        title: '选择要改名的文件夹',
        // ★ 绝不能加任何递归 / 展开相关的属性（DEC-01）
        properties: ['openDirectory'],
      })
      return { canceled: r.canceled, path: r.filePaths[0] ?? null }
    }),
  )

  ipcMain.handle(CH.FS_RESOLVE_PATHS, (_e, req: unknown) =>
    business<ResolvedBatch>(() => resolvePaths(sanitize(req))),
  )
}
