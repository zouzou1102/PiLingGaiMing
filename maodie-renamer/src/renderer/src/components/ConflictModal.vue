<script setup lang="ts">
/**
 * SCR-04 冲突提示弹窗（交互说明 §5 / F-16 / DEC-05）。
 *
 * ★ 文案原则：**默认按钮是「先不改」，且标注「推荐」**。
 * 任何一键操作都不允许覆盖已有文件 —— 所以「先不改」是橘底主按钮，
 * 「自动加序号后继续」是次按钮。
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'
import { useFilesStore } from '../stores/files'
import { useTaskStore } from '../stores/task'

const files = useFilesStore()
const task = useTaskStore()

const conflicts = computed(() => files.items.filter((i) => i.status === 'conflict'))
</script>

<template>
  <AppModal
    v-if="task.modal === 'conflict'"
    title="有几项重名了，怎么办？"
    :width="560"
    @close="task.keepNoChange()"
  >
    <p class="md-hint md-conflict__lead">
      这些项改完之后会和已有的文件撞名。耄耋「绝不会覆盖」任何已有文件 ——
      你可以先改规则，或者让它自动给这些项加个序号。
    </p>

    <!-- EL-100 冲突清单 -->
    <ul class="md-conflict__list">
      <li v-for="c in conflicts" :key="c.id" class="md-conflict__item">
        <span class="md-conflict__name">{{ c.name }}</span>
        <span class="md-conflict__arrow">→</span>
        <span class="md-conflict__name md-conflict__name--bad">{{ c.newName || '—' }}</span>
        <span class="md-conflict__reason">{{ c.reason }}</span>
      </li>
    </ul>

    <template #foot>
      <button class="md-btn md-btn--secondary" @click="task.autoResolveAndContinue()">
        自动加序号后继续
      </button>
      <button class="md-btn md-btn--primary" @click="task.keepNoChange()">先不改（推荐）</button>
    </template>
  </AppModal>
</template>

<style scoped>
.md-conflict__lead {
  margin: 0 0 var(--md-space-3);
}

.md-conflict__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  font-size: 12.5px;
}

.md-conflict__item {
  display: flex;
  align-items: center;
  gap: var(--md-space-2);
  padding: 6px 0;
  border-bottom: 1px solid var(--md-line);
}

.md-conflict__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.md-conflict__name--bad {
  color: var(--md-bad);
}

.md-conflict__arrow {
  color: var(--md-ink-4);
  flex: 0 0 auto;
}

.md-conflict__reason {
  margin-left: auto;
  color: var(--md-ink-3);
  font-size: 11.5px;
  flex: 0 0 auto;
}
</style>
