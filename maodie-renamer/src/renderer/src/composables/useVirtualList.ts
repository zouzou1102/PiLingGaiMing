/**
 * 虚拟滚动（ADR-005：自实现，不引库）。
 *
 * 为什么自己写只有 40 行：**行高固定 36px**（设计规范 §5.1 写死），
 * 于是窗口化就是纯算术，不需要通用库里最复杂、最容易出 bug 的
 * 「动态高度测量」那部分。
 *
 * 两个常见陷阱，这里都避开了：
 *  1. 滚动回调里**不做** `getBoundingClientRect` —— 行高固定，不需要测量，
 *     测量会强制同步重排（layout thrashing）。
 *  2. 行内**不用** box-shadow / filter —— 每帧重绘上万个阴影，GPU 扛不住。
 */

import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { ROW_HEIGHT, VIRTUAL_LIST_THRESHOLD } from '@shared/constants'

/** 上下各多渲染的行数（滚动时的缓冲）*/
const BUFFER = 5

export function useVirtualList(container: Ref<HTMLElement | null>, count: Ref<number>) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)

  const enabled = computed(() => count.value > VIRTUAL_LIST_THRESHOLD)
  const totalHeight = computed(() => count.value * ROW_HEIGHT)

  const startIndex = computed(() => {
    if (!enabled.value) return 0
    return Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER)
  })

  const endIndex = computed(() => {
    if (!enabled.value) return count.value
    const visible = Math.ceil(viewportHeight.value / ROW_HEIGHT) + BUFFER * 2
    return Math.min(count.value, startIndex.value + visible)
  })

  const offsetY = computed(() => startIndex.value * ROW_HEIGHT)

  function onScroll(e: Event): void {
    scrollTop.value = (e.target as HTMLElement).scrollTop
  }

  let observer: ResizeObserver | null = null

  watch(
    container,
    (el, _old, onCleanup) => {
      observer?.disconnect()
      if (!el) return
      viewportHeight.value = el.clientHeight
      observer = new ResizeObserver(() => {
        viewportHeight.value = el.clientHeight
      })
      observer.observe(el)
      onCleanup(() => observer?.disconnect())
    },
    { immediate: true },
  )

  onUnmounted(() => observer?.disconnect())

  return { enabled, totalHeight, startIndex, endIndex, offsetY, onScroll }
}
