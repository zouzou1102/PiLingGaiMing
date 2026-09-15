/**
 * 图标资源（切图资源/icons 的 13 个 SVG，其中 10 个在此处引用）。
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
import fileIcon from './icons/icon-文件.svg?raw'
import folder from './icons/icon-文件夹.svg?raw'
import rowDelete from './icons/icon-行内删除.svg?raw'
import warn from './icons/icon-警告.svg?raw'
// P1（F-10/F-11）：「进阶设置」折叠条的齿轮。用 currentColor 填充，
// 这样常态/启用两态只靠 CSS 的 color 切换（#8A8178 ↔ #E08B33），无需两张切图。
import gear from './icons/icon-进阶设置.svg?raw'
// P2-A：设置入口按钮的「滑杆」。刻意不用齿轮 —— P1 的规则区折叠条已经用了齿轮，
// 同屏两个齿轮会让人以为是同一个东西（设计确认 §2）。
import settings from './icons/icon-设置.svg?raw'

// icon-最小化 / 最大化 / 关闭 三个切图已不再在此处引用：
// 标题栏按钮改用猫咪切图 resources/cats/ui-btn-*.svg（设计规范 §R-01 定稿）。
// 切图文件本身保留在 assets/icons/ 与 切图资源/icons/，需要时随时可切回来。

export const ICONS = {
  arrowLeft,
  arrowRight,
  caretDown,
  check,
  file: fileIcon,
  folder,
  rowDelete,
  warn,
  gear,
  settings,
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]
