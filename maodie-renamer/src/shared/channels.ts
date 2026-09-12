/**
 * IPC 通道名常量（接口文档 §1.2）。
 *
 * 全部通道名集中在这里，**主进程与 preload 都从这里 import** ——
 * 杜绝「一边写 `md:fs:pickFiles`、另一边写 `md:fs:pickfiles`」这类拼写事故。
 *
 * 命名规范：`md:<域>:<动作>`；事件通道用过去式 / 名词表示「已发生」。
 * 合计 15 个请求响应通道 + 3 个事件通道。
 */

export const CH = {
  /* ── md:app:* ── 应用信息与偏好（简单通道：失败即 reject）── */
  APP_GET_INFO: 'md:app:getInfo',
  APP_GET_PREFS: 'md:app:getPrefs',
  APP_SET_PREFS: 'md:app:setPrefs',

  /* ── md:window:* ── 无边框窗口控制（简单通道）── */
  WINDOW_GET_STATE: 'md:window:getState',
  WINDOW_MINIMIZE: 'md:window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'md:window:toggleMaximize',
  WINDOW_CLOSE: 'md:window:close',

  /* ── md:fs:* ── 文件系统与系统对话框（业务通道：返回 MdResult）── */
  FS_PICK_FILES: 'md:fs:pickFiles',
  FS_PICK_DIRECTORY: 'md:fs:pickDirectory',
  FS_RESOLVE_PATHS: 'md:fs:resolvePaths',

  /* ── md:rename:* ── 改名执行（业务通道）── */
  RENAME_EXECUTE: 'md:rename:execute',
  RENAME_CANCEL: 'md:rename:cancel',

  /* ── md:history:* ── 撤销与历史（业务通道）── */
  HISTORY_LIST: 'md:history:list',
  HISTORY_UNDO_TASK: 'md:history:undoTask',
  HISTORY_UNDO_ALL: 'md:history:undoAll',

  /* ── 事件通道（main → renderer）── */
  EV_RENAME_PROGRESS: 'md:rename:progress',
  EV_WINDOW_MAXIMIZE_CHANGED: 'md:window:maximizeChanged',
  EV_APP_STORAGE_WARNING: 'md:app:storageWarning',
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]

/** 允许用 send（单向、发了就不管）的通道白名单 —— 只有这两个 */
export const SEND_ONLY_CHANNELS = new Set<string>([CH.WINDOW_MINIMIZE, CH.WINDOW_CLOSE])
