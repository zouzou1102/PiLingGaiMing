/**
 * 主题 → Electron 的接线（P2-A §7）。
 *
 * 这里只有两件事，都在主进程侧：
 *  1. 把用户选的三态交给 `nativeTheme.themeSource`。
 *  2. 问出「现在实际是深色吗」。
 *
 * **零新增 IPC 通道**：接口文档把事件通道固定成 3 个，不能加「主题变了」的广播。
 * 也不需要 —— `themeSource` 一改，Chromium 在渲染层的 `prefers-color-scheme`
 * 就跟着变，渲染层与 CSS 因此自动收到通知。
 */

import { nativeTheme } from 'electron'
import { type Theme } from '@shared/theme'

/**
 * ★ 必须在 `new BrowserWindow` **之前**调用，否则首帧会闪一下浅色（验收 TC-30）。
 *
 * 用户的三个选择与 Electron 的取值域完全一致（都是 system / light / dark），
 * 所以直接透传 —— 不做「light 映射成 system」这类自作聪明的转换。
 */
export function applyThemeSource(theme: Theme): void {
  nativeTheme.themeSource = theme
}

/** 当前实际是不是深色（themeSource 为 system 时读系统设置）*/
export function isDarkNow(theme: Theme): boolean {
  return theme === 'system' ? nativeTheme.shouldUseDarkColors : theme === 'dark'
}
