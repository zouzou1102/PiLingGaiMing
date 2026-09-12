/// <reference types="vite/client" />

import type { MaoDieAPI } from '@shared/types'

declare global {
  interface Window {
    /** 预加载桥 —— 界面触达主进程的**唯一**入口（接口文档 §2）*/
    maodie: MaoDieAPI
  }
}

/** SVG 原始文本导入（`?raw`），用于内联渲染并让 CSS 控制尺寸 */
declare module '*.svg?raw' {
  const content: string
  export default content
}

export {}
