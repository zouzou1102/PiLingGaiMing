<script setup lang="ts">
/**
 * R-01 标题栏（EL-001 ~ EL-004）。
 *
 * `frame: false` + 自绘三按钮，所以窗口控制走 window.maodie.window.*。
 * EL-004 关闭按钮**不做「确认退出」**（交互说明 §2.3）—— 改名已完成、
 * 列表不持久化，弹确认只会让人烦。
 *
 * 三个按钮的图标是**猫咪切图**（设计规范 §R-01 定稿：功能符号 + 猫耳），
 * 走 `resources/cats/ui-btn-*.svg` 的「同名文件替换」约定，换图不用改代码。
 * EL-003 最大化后换成 `restore`（还原态），不再一直显示最大化图标。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { windowButtonSvg } from '../assets/cats'

const BTN_ICON = {
  minimize: windowButtonSvg('minimize'),
  maximize: windowButtonSvg('maximize'),
  restore: windowButtonSvg('restore'),
  close: windowButtonSvg('close'),
} as const

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
        <span class="md-icon md-icon--16" aria-hidden="true" v-html="BTN_ICON.minimize" />
      </button>
      <button
        class="md-winbtn"
        :title="maximized ? '向下还原' : '最大化'"
        :aria-label="maximized ? '向下还原' : '最大化'"
        @click="toggle"
      >
        <span
          class="md-icon md-icon--16"
          aria-hidden="true"
          v-html="maximized ? BTN_ICON.restore : BTN_ICON.maximize"
        />
      </button>
      <button
        class="md-winbtn md-winbtn--close"
        title="关闭"
        aria-label="关闭"
        @click="close"
      >
        <span class="md-icon md-icon--16" aria-hidden="true" v-html="BTN_ICON.close" />
      </button>
    </div>
  </header>
</template>
