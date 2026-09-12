/**
 * 偏好设置（数据库设计 §6 / 交互说明 §11.3）。
 *
 * 这是对技术方案 §4.3.2「五个 store」的一处**小幅增补**：设置项（音效、减少动画、
 * 二次确认阈值）不属于 files / rule / task / history / cat 任何一个的语义范围，
 * 塞进 task 会让「任务状态」与「用户偏好」混在一起。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_PREFS, type Prefs } from '@shared/types'

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS })
  const loaded = ref(false)

  async function load(): Promise<void> {
    prefs.value = await window.maodie.app.getPrefs()
    loaded.value = true
    applyReduceMotion()
  }

  async function patch(p: Partial<Prefs>): Promise<void> {
    prefs.value = await window.maodie.app.setPrefs(p)
    applyReduceMotion()
  }

  /** 无障碍开关：把状态挂到 <html data-reduce-motion>，由 tokens.css 统一归零动效 */
  function applyReduceMotion(): void {
    document.documentElement.dataset.reduceMotion = String(prefs.value.reduceMotion)
  }

  return { prefs, loaded, load, patch }
})
