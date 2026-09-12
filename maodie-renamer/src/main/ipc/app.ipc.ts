/**
 * md:app:* —— 应用信息与偏好（简单通道：失败即 reject）。
 *
 * handler 只做「参数校验 → 调 service → 包装返回」，
 * 超过 20 行就说明逻辑该挪进 services/（P-09）。
 */

import { app, ipcMain } from 'electron'
import { CH } from '@shared/channels'
import type { AppInfo, Prefs } from '@shared/types'
import { getPrefs, setPrefs } from '../services/prefs-store'

export function getAppInfo(): AppInfo {
  return {
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    platform: 'win32',
    arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    userDataPath: app.getPath('userData'),
    isDev: !app.isPackaged,
  }
}

/** 只接受已知字段，且类型必须对（不信任渲染层的一切）*/
function sanitizePatch(raw: unknown): Partial<Prefs> {
  if (typeof raw !== 'object' || raw === null) return {}
  const src = raw as Record<string, unknown>
  const out: Partial<Prefs> = {}
  if (typeof src.soundEnabled === 'boolean') out.soundEnabled = src.soundEnabled
  if (typeof src.reduceMotion === 'boolean') out.reduceMotion = src.reduceMotion
  if (typeof src.confirmThreshold === 'number') out.confirmThreshold = src.confirmThreshold
  return out
}

export function registerAppIpc(): void {
  ipcMain.handle(CH.APP_GET_INFO, () => getAppInfo())
  ipcMain.handle(CH.APP_GET_PREFS, () => getPrefs())
  ipcMain.handle(CH.APP_SET_PREFS, (_e, patch: unknown) => setPrefs(sanitizePatch(patch)))
}
