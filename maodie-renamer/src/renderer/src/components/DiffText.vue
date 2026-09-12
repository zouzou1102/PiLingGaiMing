<script setup lang="ts">
/**
 * 差异高亮文本（F-08 / 设计规范 §5.2）。
 *
 * 区间是半开的 `[start, end)` —— 与 `slice` 语义一致。
 * **不要写成闭区间**，这是最容易差一位的地方（接口文档 §5.5 明确提醒）。
 *
 * 表现规则：
 *  · 原名中被移走的片段 → 灰 `#C8BBAE` + 删除线
 *  · 新名中新增 / 变化的片段 → 橘 `#E08B33` + 浅橘底圆角 4px
 *  · 无变化 → 灰色「—」
 */
import { computed } from 'vue'
import { sliceByRange } from '@shared/diff-range'
import type { DiffRange } from '@shared/types'

const props = withDefaults(
  defineProps<{
    /** 要标注的完整文本 */
    text: string
    diff: DiffRange | null | undefined
    /** 'old' 用删除线表现，'new' 用高亮表现 */
    side: 'old' | 'new'
    /** 是否无变化（显示灰色「—」）*/
    unchanged?: boolean
  }>(),
  { unchanged: false },
)

const parts = computed(() => {
  if (props.unchanged || !props.diff) return null
  const { oldStart, oldEnd, newStart, newEnd } = props.diff
  const [s, e] = props.side === 'old' ? [oldStart, oldEnd] : [newStart, newEnd]
  return sliceByRange(props.text, s, e)
})

const hasChange = computed(() => parts.value !== null && parts.value.changed !== '')
</script>

<template>
  <span class="md-diffline">
    <span v-if="unchanged" class="md-diff-none">—</span>
    <template v-else-if="hasChange">
      <span>{{ parts!.before }}</span>
      <span :class="side === 'old' ? 'md-diff-del' : 'md-diff-add'">{{ parts!.changed }}</span>
      <span>{{ parts!.after }}</span>
    </template>
    <span v-else>{{ text }}</span>
  </span>
</template>
