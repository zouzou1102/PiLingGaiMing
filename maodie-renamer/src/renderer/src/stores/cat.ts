/**
 * 耄耋状态机（PRD §4.6.1 / 交互说明 §7）。
 *
 * 三条容易写错的规则，都在这里一次写对：
 *  1. **优先级不可被抢占**：ST-03 > ST-05 > ST-04 > ST-02 > ST-01。
 *     执行中（ST-03）不接受 ST-02 抢占 —— 拖拽入列仍可用，只更新列表。
 *  2. **回落定时器必须可取消**：切状态前 `clearTimeout`，否则会出现
 *     「ST-04 的 3 秒计时到点，把 ST-03 拽回待机」这类幽灵 bug。
 *  3. **用户取消 ≠ 失败**：走 `backToIdle()` 而不是 `trigger('ST-05')`。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { catHoldMs, catText, catSvg, type CatState } from '../assets/cats'

/** 数值越大优先级越高 */
const PRIORITY: Record<CatState, number> = {
  'ST-01': 0,
  'ST-02': 1,
  'ST-04': 2,
  'ST-05': 3,
  'ST-03': 4,
}

export interface CatVars {
  n?: number
  m?: number
}

function render(template: string, vars?: CatVars): string {
  if (!vars) return template
  return template
    .replace('{n}', String(vars.n ?? ''))
    .replace('{m}', String(vars.m ?? ''))
}

export const useCatStore = defineStore('cat', () => {
  const state = ref<CatState>('ST-01')
  const vars = ref<CatVars>({})

  let fallbackTimer: ReturnType<typeof setTimeout> | undefined

  const message = computed(() => {
    // ST-03 的文案带实时进度（N/M），不能用静态模板
    if (state.value === 'ST-03') {
      return render(catText('ST-03'), { n: vars.value.n ?? 0, m: vars.value.m ?? 0 })
    }
    return render(catText(state.value), vars.value)
  })

  const svg = computed(() => catSvg(state.value))

  function clearTimer(): void {
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer)
      fallbackTimer = undefined
    }
  }

  /** 触发一个状态。低优先级不得抢占高优先级 */
  function trigger(next: CatState, nextVars?: CatVars): void {
    if (PRIORITY[next] < PRIORITY[state.value]) return
    clearTimer()
    state.value = next
    vars.value = nextVars ?? {}
    const hold = catHoldMs(next)
    if (hold > 0) {
      fallbackTimer = setTimeout(() => backToIdle(), hold)
    }
  }

  /** 回待机（取消、回落都走这里）*/
  function backToIdle(): void {
    clearTimer()
    state.value = 'ST-01'
    vars.value = {}
  }

  /** ST-03 的进度文案更新（不改状态、不重置定时器）*/
  function setProgress(done: number, total: number): void {
    if (state.value !== 'ST-03') return
    vars.value = { n: done, m: total }
  }

  return { state, message, svg, trigger, backToIdle, setProgress }
})
