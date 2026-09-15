/**
 * 历史记录 store（SCR-02）。
 *
 * 关于 DEC-09 的「淘汰不静默」：
 * 接口文档把通道固定为 15 个请求响应 + 3 个事件，`md:history:list` 的返回形状
 * 也无法携带「本轮淘汰了几条」。因此这里用两个**不改变契约**的办法兑现「显式告知」：
 *   1. 历史页常驻一行说明（保留规则一清二楚，不是等淘汰了才说）
 *   2. 每次刷新列表时与上一份对比：**上一份里最旧的那条不见了、且总数没变多**，
 *      就说明发生了淘汰 → 状态栏提示「为保证性能，较旧的记录已被清理」
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { detectEviction } from '@shared/history-detail'
import type { RenameTask } from '@shared/types'

export const useHistoryStore = defineStore('history', () => {
  const tasks = ref<RenameTask[]>([])
  const loading = ref(false)
  /** 最近一次刷新检测到的「被清理掉的任务数」（0 = 没发生淘汰）*/
  const evictedNotice = ref(0)

  let lastOldestId: string | null = null
  let lastCount = 0

  const undoableSummary = computed(() => {
    const active = tasks.value.filter((t) => t.status === 'active')
    return {
      taskCount: active.length,
      fileCount: active.reduce((n, t) => n + t.entries.length, 0),
    }
  })

  async function load(): Promise<void> {
    loading.value = true
    const res = await window.maodie.history.list()
    loading.value = false
    if (!res.ok) return

    const next = res.data
    // 检测淘汰：判定逻辑抽到 shared/history-detail（纯函数，被单测钉住）。
    // ★ 它内部显式排除「本次为空」—— 用户主动清空不许被当成系统淘汰。
    evictedNotice.value = detectEviction(lastOldestId, lastCount, next)

    lastOldestId = next.length > 0 ? next[next.length - 1].id : null
    lastCount = next.length
    tasks.value = next
  }

  /**
   * 清空历史之后调用（P2-C §2.6）。
   *
   * 把基准置回「空」+ 清掉已攒下的淘汰提示 —— 与 `detectEviction` 里的
   * 「空列表不判淘汰」两侧一起兜住，任一侧漏了都会假报「较旧的记录已被清理」。
   */
  function resetEvictionBaseline(): void {
    lastOldestId = null
    lastCount = 0
    evictedNotice.value = 0
    tasks.value = []
  }

  function clearEvictedNotice(): void {
    evictedNotice.value = 0
  }

  return {
    tasks,
    loading,
    evictedNotice,
    undoableSummary,
    load,
    clearEvictedNotice,
    resetEvictionBaseline,
  }
})
