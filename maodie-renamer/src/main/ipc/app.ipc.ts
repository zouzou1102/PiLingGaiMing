/**
 * md:app:* —— 应用信息与偏好（简单通道：失败即 reject）。
 *
 * handler 只做「参数校验 → 调 service → 包装返回」，
 * 超过 20 行就说明逻辑该挪进 services/（P-09）。
 */

import { app, ipcMain } from 'electron'
import { CH } from '@shared/channels'
import { isTheme } from '@shared/theme'
import type { AppInfo, Prefs } from '@shared/types'
import { getPrefs, setPrefs } from '../services/prefs-store'
import { applyThemeSource } from '../services/theme'

export function getAppInfo(): AppInfo {
  return {
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    platform: 'win32',
    arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    userDataPath: app.getPath('userData'),
    isDev: !app.isPackaged,
    // P2-C：设置里「复制程序路径」用。加字段比加通道轻（P2-C §4）。
    // ⚠️ 未打包时它是 Electron 引擎的路径，那条示例命令要先打包成 exe 才可直接用。
    execPath: process.execPath,
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
  // 主题：只收三个合法值，其余一律忽略（P2-A 起 theme 才真的能改 ——
  // 之前这里没这个字段，渲染层改主题会被静默丢掉）
  if (isTheme(src.theme)) out.theme = src.theme
  return out
}

export function registerAppIpc(): void {
  ipcMain.handle(CH.APP_GET_INFO, () => getAppInfo())
  ipcMain.handle(CH.APP_GET_PREFS, () => getPrefs())
  ipcMain.handle(CH.APP_SET_PREFS, async (_e, patch: unknown) => {
    const next = await setPrefs(sanitizePatch(patch))
    // 主题变更要立刻交给 Electron：渲染层的 prefers-color-scheme 会跟着变，
    // 所以**不需要**新增「主题变了」的 IPC 广播（接口文档只留了 3 个事件通道）。
    applyThemeSource(next.theme)
    return next
  })
}
