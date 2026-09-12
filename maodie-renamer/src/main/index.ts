/**
 * 主进程入口 —— app 生命周期、单实例锁、存储初始化、窗口创建。
 *
 * ⚠ 两处顺序要求不能动：
 *  1. `app.setPath('userData', ...)` 必须在**任何** `app.getPath('userData')`
 *     之前执行（包括 storage 的初始化），否则不生效。
 *  2. `app.requestSingleInstanceLock()` 必须在窗口创建之前 —— 两个实例同时改
 *     同一批文件会绕过进程内的写入队列。
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CH } from '@shared/channels'
import { USER_DATA_DIR_NAME } from '@shared/constants'
import { registerAllIpc } from './ipc'
import { buildAppMenu } from './menu'
import { loadHistory } from './services/history-store'
import { loadPrefs, setAppVersion } from './services/prefs-store'
import { cleanupStaleTemp, initStorage, storePath } from './services/storage'
import { setStorageWarningOutbound } from './services/rename-service'
import { createMainWindow, getMainWindow, hardenSession, hardenWebContents } from './window'

/* ── 1. userData 目录名主动设成英文（数据库设计 §3.1）───────────────────
   electron-builder 的 productName 是中文，Electron 默认会拿它当目录名，
   于是路径变成 `%APPDATA%\耄耋改名\`。中文路径能跑，但会让部分备份 / 同步
   工具与命令行工具处理不佳，用户手动找目录时也更容易出错。
   用 setPath 而不是 setName —— 后者会连带改掉快捷方式名等显示名称。 */
app.setPath('userData', join(app.getPath('appData'), USER_DATA_DIR_NAME))

/* ── 2. 单实例锁 ─────────────────────────────────────────────────────── */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  hardenSession()
  hardenWebContents()

  setAppVersion(app.getVersion())
  initStorage(app.getPath('userData'))

  // 启动时清理自己生成的 .tmp 残留（只删「命名匹配 + 超过 1 天」的）
  cleanupStaleTemp(app.getPath('userData'))

  // 存储告警 → 界面状态栏（不弹窗、不打断操作）
  setStorageWarningOutbound((warning) => {
    getMainWindow()?.webContents.send(CH.EV_APP_STORAGE_WARNING, warning)
  })

  // 应用启动只读不写（数据库设计 §4.4.5）
  await loadPrefs()
  await loadHistory()

  buildAppMenu()
  registerAllIpc()

  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
  })
}

app.on('window-all-closed', () => {
  // 单窗口应用：关掉窗口就退出（Windows 上的常规行为）
  app.quit()
})

/** 便于排障：把数据目录打出来（仅开发环境）*/
if (!app.isPackaged) {
  console.log('[md] userData =', storePath('history').replace(/[^\\/]*$/, ''))
}
