<script setup lang="ts">
/**
 * 图标组件 —— 内联 SVG，尺寸由 CSS 控制。
 *
 * 切图 SVG 自带 `width/height` 属性，base.css 里的
 * `.md-icon > svg { width:100%; height:100% }` 会覆盖它，
 * 从而让同一个图标能在 12/14/15/16px 各处复用。
 */
import { computed } from 'vue'
import { ICONS, type IconName } from '../assets/icons'

const props = withDefaults(defineProps<{ name: IconName; size?: 11 | 12 | 14 | 15 | 16 }>(), {
  size: 14,
})

const svg = computed(() => ICONS[props.name])
</script>

<template>
  <span class="md-icon" :class="`md-icon--${props.size}`" aria-hidden="true" v-html="svg" />
</template>
