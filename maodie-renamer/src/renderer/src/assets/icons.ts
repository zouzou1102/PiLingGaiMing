/**
 * 图标资源（切图资源/icons 的 11 个 SVG）。
 *
 * 放在 `assets/` 而不是 `resources/` 的理由（技术方案 §3.2）：
 * 图标是**被构建工具处理**的静态资源（内联进产物、由 CSS 控尺寸）；
 * 而猫咪形象是**运行时可能要整体替换**的资源，所以放 `resources/cats`。
 *
 * 用 `?raw` 内联而不是作为 <img src> 的理由：内联后 `currentColor`、
 * 悬停滤镜、CSS 尺寸都能作用到 SVG 内部，而 <img> 方式完全不可控。
 */

import arrowLeft from './icons/icon-箭头左.svg?raw'
import arrowRight from './icons/icon-箭头右.svg?raw'
import caretDown from './icons/icon-下拉.svg?raw'
import check from './icons/icon-勾选.svg?raw'
import close from './icons/icon-关闭.svg?raw'
import fileIcon from './icons/icon-文件.svg?raw'
import folder from './icons/icon-文件夹.svg?raw'
import maximize from './icons/icon-最大化.svg?raw'
import minimize from './icons/icon-最小化.svg?raw'
import rowDelete from './icons/icon-行内删除.svg?raw'
import warn from './icons/icon-警告.svg?raw'

export const ICONS = {
  arrowLeft,
  arrowRight,
  caretDown,
  check,
  close,
  file: fileIcon,
  folder,
  maximize,
  minimize,
  rowDelete,
  warn,
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]
