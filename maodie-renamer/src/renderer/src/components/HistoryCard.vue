<script setup lang="ts">
/**
 * EL-084 历史卡片（设计规范 §5.3）。
 *
 * 「已撤销」的卡片：底 `#F7F3EC`、文字变浅、徽标「已撤销」、**不显示撤销按钮**。
 */
import { computed } from 'vue'
import type { RenameTask } from '@shared/types'

const props = defineProps<{ task: RenameTask }>()
const emit = defineEmits<{ (e: 'undo', id: string): void }>()

const undone = computed(() => props.task.status === 'undone')

const timeText = computed(() => {
  const d = new Date(props.task.createdAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})

const countsText = computed(() => {
  const c = props.task.counts
  const parts = [`共 ${c.total} 项`, `成功 ${c.success}`]
  if (c.skipped > 0) parts.push(`跳过 ${c.skipped}`)
  if (c.invalid > 0) parts.push(`未处理 ${c.invalid}`)
  if (c.failed > 0) parts.push(`失败 ${c.failed}`)
  return parts.join(' · ')
})

const firstExample = computed(() => props.task.entries[0] ?? null)
</script>

<template>
  <article class="md-history-card" :class="{ 'md-history-card--undone': undone }">
    <div class="md-spread">
      <span class="md-history-card__time">{{ timeText }}</span>
      <span class="md-badge" :class="undone ? 'md-badge--muted' : 'md-badge--ok'">
        {{ undone ? '已撤销' : '可撤销' }}
      </span>
    </div>

    <h3 class="md-history-card__summary">{{ task.ruleSummary }}</h3>
    <p class="md-history-card__counts">{{ countsText }}</p>

    <p v-if="firstExample" class="md-history-card__example">
      {{ firstExample.fromName }} → {{ firstExample.toName }}
      <span v-if="task.entries.length > 1" class="md-history-card__more">
        （等 {{ task.entries.length }} 项）
      </span>
    </p>

    <div v-if="!undone" class="md-history-card__actions">
      <button class="md-btn md-btn--card" @click="emit('undo', task.id)">撤销这一条</button>
    </div>
  </article>
</template>

<style scoped>
.md-history-card__time {
  font-family: var(--md-font-num);
  font-size: 11.5px;
  color: var(--md-ink-3);
}

.md-history-card__summary {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 20px;
  margin: var(--md-space-2) 0 var(--md-space-1);
  color: var(--md-ink-1);
}

.md-history-card__counts {
  font-size: 12px;
  color: var(--md-ink-3);
  margin: 0;
}

.md-history-card__example {
  font-size: 12.5px;
  color: var(--md-ink-2);
  margin: var(--md-space-2) 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-history-card__more {
  color: var(--md-ink-4);
}

.md-history-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--md-space-3);
}
</style>
