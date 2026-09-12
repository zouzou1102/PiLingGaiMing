/**
 * md:window:* —— 无边框窗口控制（简单通道）。
 *
 * 本项目用 `frame: false` + 自绘标题栏，所以三个系统按钮的行为要自己实现。
 * `minimize` / `close` 是**唯一允许用 send（单向）**的两个通道 ——
 * 发了就不需要知道结果。
 */

import { ipcMain } from 'electron'
import { CH } from '@shared/channels'
import { getMainWindow, getWindowState, toggleMaximize } from '../window'

export function registerWindowIpc(): void {
  ipcMain.handle(CH.WINDOW_GET_STATE, () => getWindowState())

  ipcMain.on(CH.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize()
  })

  ipcMain.handle(CH.WINDOW_TOGGLE_MAXIMIZE, () => toggleMaximize())

  ipcMain.on(CH.WINDOW_CLOSE, () => {
    // 关闭前主进程会先把 window.json 同步写完（见 window.ts 的 close 处理）
    getMainWindow()?.close()
  })
}
