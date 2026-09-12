<script setup lang="ts">
/**
 * R-01 标题栏（EL-001 ~ EL-004）。
 *
 * `frame: false` + 自绘三按钮，所以窗口控制走 window.maodie.window.*。
 * EL-004 关闭按钮**不做「确认退出」**（交互说明 §2.3）—— 改名已完成、
 * 列表不持久化，弹确认只会让人烦。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import MdIcon from './MdIcon.vue'

const maximized = ref(false)
let off: (() => void) | null = null

onMounted(async () => {
  const state = await window.maodie.window.getState()
  maximized.value = state.maximized
  off = window.maodie.window.onMaximizeChanged((p) => {
    maximized.value = p.maximized
  })
})

onUnmounted(() => off?.())

async function toggle(): Promise<void> {
  maximized.value = await window.maodie.window.toggleMaximize()
}

// 模板里访问不到全局 window，必须包成方法（Vue 模板的作用域是组件实例）
function minimize(): void {
  window.maodie.window.minimize()
}

function close(): void {
  window.maodie.window.close()
}
</script>

<template>
  <header class="md-titlebar">
    <span class="md-titlebar__brand">耄耋改名</span>
    <div class="md-titlebar__btns">
      <button class="md-winbtn" title="最小化" aria-label="最小化" @click="minimize">
        <MdIcon name="minimize" :size="12" />
      </button>
      <button
        class="md-winbtn"
        :title="maximized ? '向下还原' : '最大化'"
        :aria-label="maximized ? '向下还原' : '最大化'"
        @click="toggle"
      >
        <MdIcon name="maximize" :size="12" />
      </button>
      <button
        class="md-winbtn md-winbtn--close"
        title="关闭"
        aria-label="关闭"
        @click="close"
      >
        <MdIcon name="close" :size="12" />
      </button>
    </div>
  </header>
</template>
