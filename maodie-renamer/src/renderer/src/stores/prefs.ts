/**
 * 偏好设置（数据库设计 §6 / 交互说明 §11.3 / P2-A 设置面）。
 *
 * 这是对技术方案 §4.3.2「五个 store」的一处**小幅增补**：设置项（主题、音效、
 * 减少动画、二次确认阈值）不属于 files / rule / task / history / cat 任何一个的
 * 语义范围，塞进 task 会让「任务状态」与「用户偏好」混在一起。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_PREFS, type Prefs } from '@shared/types'

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS })
  const loaded = ref(false)
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  let listening = false

  async function load(): Promise<void> {
    prefs.value = await window.maodie.app.getPrefs()
    loaded.value = true
    applyReduceMotion()
    applyTheme()
    if (!listening) {
      listening = true
      // 系统深浅色变了（或主进程改了 themeSource）→ 重新解析一次
      darkQuery.addEventListener('change', applyTheme)
    }
  }

  async function patch(p: Partial<Prefs>): Promise<void> {
    prefs.value = await window.maodie.app.setPrefs(p)
    applyReduceMotion()
    applyTheme()
  }

  /** 无障碍开关：把状态挂到 <html data-reduce-motion>，由 tokens.css 统一归零动效 */
  function applyReduceMotion(): void {
    document.documentElement.dataset.reduceMotion = String(prefs.value.reduceMotion)
  }

  /**
   * 主题（P2-A）。注意 **样式本身不靠这个属性** ——
   * 深色令牌挂在 CSS 的 `@media (prefers-color-scheme: dark)` 上，而主进程在窗口
   * 出现**之前**就把深浅色信号设好了，所以首帧不可能闪（见 tokens.css 文件头）。
   * 这里挂 `<html data-theme>` 有两个用途：
   *  1. 冒烟报告能直接断言「现在真的是深色」，不必去猜像素；
   *  2. 排查时一眼看到当前生效的主题。
   * 取值是**解析后**的 'light' / 'dark'（选了「跟随系统」就把当时系统的结果落下来）。
   */
  function applyTheme(): void {
    const resolved =
      prefs.value.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : prefs.value.theme
    document.documentElement.dataset.theme = resolved
  }

  return { prefs, loaded, load, patch }
})
