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

    <!-- P2-C / EX-17：清空历史且仍有「可撤销」任务时的红色警告块。
         没有它，用户会在「改错了名 → 想撤销 → 发现历史被自己清了」时永久丢数据。 -->
    <p v-if="ctx.warning" class="md-modal__warn">{{ ctx.warning }}</p>

    <template #foot>
      <button class="md-btn md-btn--secondary" @click="task.confirmNo()">
        {{ ctx.kind === 'rename' ? '再改改' : '取消' }}
      </button>
      <button
        class="md-btn"
        :class="ctx.danger ? 'md-btn--danger' : 'md-btn--primary'"
        @click="task.confirmYes()"
      >
        {{ ctx.confirmLabel ?? confirmLabel }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.md-confirm__body {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--md-ink-2);
  /* 正文里带 \n（清空历史的两句话分段），要按换行渲染 */
  white-space: pre-line;
}
</style>
