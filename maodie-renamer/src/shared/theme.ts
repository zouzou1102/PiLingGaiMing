/**
 * 主题（P2-A · F-14）。
 *
 * 三态：跟随系统 / 始终浅色 / 始终深色，默认**始终浅色** ——
 * 让软件在任何机器上首屏都长一样，对非技术用户更「稳定」。
 *
 * 为什么放在 `shared/` 而不是主进程：这里全是纯函数（不 import electron / fs），
 * 主进程的存储兜底与 IPC 入参校验都要用它，而且**能被单测直接跑**
 * —— 同 `regex-cheatsheet.ts` 的理由。
 */

export const THEMES = ['system', 'light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'light'

/** 是不是三个合法值之一（用于在主进程边界上挡掉渲染层传来的野值）*/
export function isTheme(raw: unknown): raw is Theme {
  return typeof raw === 'string' && (THEMES as readonly string[]).includes(raw)
}

/** 只认三个合法值；prefs.json 被手改坏、或渲染层传了野值时回落到默认 */
export function normalizeTheme(raw: unknown): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME
}

/**
 * 窗口底色的兜底值（主进程建窗口那一刻用）。
 *
 * 为什么必须有一份 TS 拷贝：`BrowserWindow.backgroundColor` 要在建窗口时立刻给出，
 * 那时 CSS 还没加载 —— 而**它就是「首帧不闪」那一帧用的颜色**。
 *
 * ⚠️ 这两个值必须与 `styles/tokens.css` 里 `--md-bg-cream` 的浅色值 / 深色值
 * 逐字节相同。靠人同步不住，所以 `tests/p2a-theme.test.ts` 会**解析 CSS** 把两边
 * 钉在一起：改了 CSS 忘了改这里，单测会红。
 */
export const WINDOW_BG = {
  light: '#fffbf5',
  dark: '#251a14',
} as const

/** 深色与否 → 窗口底色（themeSource 为 system 时由主进程先解析成布尔）*/
export function windowBackgroundFor(dark: boolean): string {
  return dark ? WINDOW_BG.dark : WINDOW_BG.light
}
