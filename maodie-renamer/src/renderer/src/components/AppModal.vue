<script setup lang="ts">
/**
 * 弹窗外壳（设计规范 §5.4）。
 *
 * ★ **必须 Teleport 到 body**：设计规范要求「遮罩覆盖整个窗口（含标题栏）」。
 * 若弹窗嵌在视图容器里，会被父级的 overflow 裁掉标题栏区域。
 *
 * 关闭方式：点遮罩 / 按 Esc，语义由调用方决定（SCR-03 = 知道了、SCR-05 = 取消）。
 */
import { onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** SCR-03 / SCR-04 → 560px；SCR-05 → 460px */
    width?: number
  }>(),
  { width: 560 },
)

const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="md-mask" @click.self="emit('close')">
      <div class="md-modal" :style="{ width: `${props.width}px` }" role="dialog" aria-modal="true">
        <h2 class="md-modal__title">{{ title }}</h2>
        <div class="md-modal__body">
          <slot />
        </div>
        <div class="md-modal__foot">
          <slot name="foot" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
