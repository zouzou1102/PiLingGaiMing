<script setup lang="ts">
/**
 * EL-013 ~ EL-017 咬名字动画区（交互说明 §7.3）。
 *
 * ── 队列规则（照搬文档，不做二次创作）────────────────────────────────
 *  · 取谁：从列表里筛 `status ∈ {changed, conflict}` 的项，按列表顺序，
 *    **最多 12 个**循环
 *  · 文件还是文件夹：**不写死** —— 图标由该条目的真实 isDir 决定，
 *    因此文件批次就咬文件、文件夹批次就咬文件夹、混合批次按真实比例交替
 *  · 名字来源：读预览结果里的 fromName / toName，与列表**同源**
 *  · 与真实进度无关：卡片节奏 1.6s/张独立于真实进度，卡片只是「在干活」的视觉表达
 *  · 离开即停：切走状态时清掉全部定时器与卡片，**不留残影**
 *
 * ── 两条硬约束（PRD §4.6.3，代码里必须再写一遍）──────────────────────
 *  1. **动作不得有歧义**：严禁「双肢快速上下抽动 + 躯干抖动 + 张嘴」的组合。
 *  2. **撕咬要卡通化**：只做干脆的「咔嚓一口」，不做尖牙特写、不做破碎 / 流血效果。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { BITE_QUEUE_MAX } from '@shared/constants'
import MdIcon from './MdIcon.vue'

const props = defineProps<{
  /** 是否处于 ST-03（只有这时才挂载）*/
  active: boolean
  /** 卡片数据源（与列表同源）*/
  entries: Array<{ fromName: string; toName: string; isDir: boolean }>
  /** 「减少动画」开启时不播卡片队列 */
  reduceMotion: boolean
}>()

const CAROUSEL_MS = 1600

const index = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

/** 最多取 12 个循环；不足时按实际数量循环 */
const queue = computed(() => props.entries.slice(0, BITE_QUEUE_MAX))

/** EL-016：超过 14 字截断，**保留扩展名** */
function truncate(name: string): string {
  if ([...name].length <= 14) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  const head = [...stem].slice(0, 9).join('')
  return `${head}…${ext}`
}

const current = computed(() => {
  if (queue.value.length === 0) return null
  return queue.value[index.value % queue.value.length]
})

function stop(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function start(): void {
  stop()
  if (props.reduceMotion || queue.value.length === 0) return
  index.value = 0
  timer = setInterval(() => {
    index.value = (index.value + 1) % queue.value.length
  }, CAROUSEL_MS)
}

watch(
  () => [props.active, props.reduceMotion, props.entries.length] as const,
  () => {
    if (props.active) start()
    else stop()
  },
  { immediate: true },
)

// ★ 离开即停：组件卸载时清掉定时器，不留残影
onUnmounted(stop)
</script>

<template>
  <div v-if="active" class="md-bitelane">
    <!-- 「减少动画」模式下不播卡片队列，只保留状态栏的进度文字 -->
    <div v-if="!reduceMotion && current" :key="index" class="md-bitechip">
      <span class="md-bitechip__speed" aria-hidden="true" />
      <MdIcon :name="current.isDir ? 'folder' : 'file'" :size="14" />
      <span class="md-bitechip__old">{{ truncate(current.fromName) }}</span>
      <span class="md-bitechip__new">{{ truncate(current.toName) }}</span>
    </div>
  </div>
</template>
