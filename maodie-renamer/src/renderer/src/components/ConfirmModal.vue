<script setup lang="ts">
/**
 * SCR-05 二次确认弹窗（交互说明 §6）。
 *
 * 同一个弹窗，四类场景切换文案（设计规范 §5.4）：
 *   待改项 ≥ 阈值 / 撤销单条 / 全部撤销 / 清空列表
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'
import { useTaskStore } from '../stores/task'

const task = useTaskStore()
const ctx = computed(() => task.confirmContext)

const confirmLabel = computed(() => {
  switch (ctx.value?.kind) {
    case 'undoOne':
    case 'undoAll':
      return '确认撤销'
    case 'clear':
      return '确认清空'
    default:
      return '确认改名'
  }
})
</script>

<template>
  <AppModal
    v-if="task.modal === 'confirm' && ctx"
    :title="ctx.title"
    :width="460"
    @close="task.confirmNo()"
  >
    <p class="md-confirm__body">{{ ctx.body }}</p>

    <template #foot>
      <button class="md-btn md-btn--secondary" @click="task.confirmNo()">
        {{ ctx.kind === 'rename' ? '再改改' : '取消' }}
      </button>
      <button class="md-btn md-btn--primary" @click="task.confirmYes()">{{ confirmLabel }}</button>
    </template>
  </AppModal>
</template>

<style scoped>
.md-confirm__body {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--md-ink-2);
}
</style>
