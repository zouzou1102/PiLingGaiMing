<script setup lang="ts">
/**
 * R-06 动作区（EL-060 / EL-061）。
 *
 * EL-060 的状态矩阵（交互说明 §2.4 明确列出）：
 *   列表为空 → 置灰；有项但全部无变化 → 置灰；有可改项 → 可用；
 *   执行中 → 可用且文案变「取消」。
 */
import { computed } from 'vue'
import { useFilesStore } from '../stores/files'
import { useTaskStore } from '../stores/task'

const emit = defineEmits<{ (e: 'open-history'): void }>()

const files = useFilesStore()
const task = useTaskStore()

const primaryLabel = computed(() => (task.running ? '取消' : '开始改名'))
const primaryClass = computed(() => (task.running ? 'md-btn md-btn--danger' : 'md-btn md-btn--primary'))
const disabled = computed(() => (task.running ? false : !files.canExecute))

const hintTitle = computed(() => {
  if (task.running) return '点击可中止，已改动的项会自动改回去'
  if (files.items.length === 0) return '列表里还没有文件'
  if (!files.canExecute) return '当前规则不会改变任何名字'
  return `即将修改 ${files.executableCount} 项`
})
</script>

<template>
  <section class="md-actionbar">
    <button class="md-btn md-btn--secondary" @click="emit('open-history')">撤销</button>
    <button :class="primaryClass" :disabled="disabled" :title="hintTitle" @click="task.start()">
      {{ primaryLabel }}
    </button>
  </section>
</template>

<style scoped>
.md-actionbar {
  height: var(--md-actionbar-h);
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--md-space-3);
}
</style>
