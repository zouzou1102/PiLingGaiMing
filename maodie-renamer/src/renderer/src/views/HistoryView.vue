<script setup lang="ts">
/**
 * SCR-02 撤销 / 历史页（PRD §4.5.2）。
 *
 * 关于 DEC-09 的「淘汰不静默」：接口文档的通道与返回形状固定，
 * 无法携带「这次淘汰了几条」，所以这里用**常驻说明**兑现「用户知情」——
 * 保留规则一直摆在页脚，不是等淘汰了才说。
 * 另外 history store 会在刷新时对比上一份列表，检测到淘汰就置 evictedNotice，
 * 由状态栏显式提示。
 */
import { onMounted } from 'vue'
import HistoryCard from '../components/HistoryCard.vue'
import MdIcon from '../components/MdIcon.vue'
import { useHistoryStore } from '../stores/history'
import { useTaskStore } from '../stores/task'

const emit = defineEmits<{ (e: 'back'): void }>()

const history = useHistoryStore()
const task = useTaskStore()

onMounted(() => void history.load())
</script>

<template>
  <div class="md-history">
    <header class="md-history__head">
      <button class="md-btn md-btn--ghost" @click="emit('back')">
        <MdIcon name="arrowLeft" :size="14" />
        返回主界面
      </button>
      <h1 class="md-history__title">撤销 / 历史记录</h1>
      <button
        class="md-btn md-btn--secondary"
        :disabled="history.undoableSummary.taskCount === 0"
        @click="task.askUndoAll()"
      >
        全部撤销
      </button>
    </header>

    <div class="md-history__body md-scroll">
      <div v-if="history.loading" class="md-history__empty">正在读取…</div>

      <div v-else-if="history.tasks.length === 0" class="md-history__empty">
        <p class="md-history__empty-title">还没有改过名呢</p>
        <p class="md-hint">改完一批名字之后，这里就可以一键改回去</p>
      </div>

      <template v-else>
        <HistoryCard
          v-for="t in history.tasks"
          :key="t.id"
          :task="t"
          @undo="(id) => task.askUndoTask(id)"
        />
      </template>
    </div>

    <footer class="md-history__foot">
      <p class="md-hint">
        为保证性能，最多保留最近 20 次改名记录（明细总量上限 5 万条）；
        超出时从最旧的一次整条清理，最新一次永不清理。撤销只改名字，不碰文件内容。
      </p>
    </footer>
  </div>
</template>

<style scoped>
.md-history {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--md-space-3) var(--md-space-4) 0;
  gap: var(--md-space-3);
}

.md-history__head {
  display: flex;
  align-items: center;
  gap: var(--md-space-3);
}

.md-history__title {
  font-size: 17px;
  font-weight: 700;
  line-height: 24px;
  margin: 0;
  flex: 1 1 auto;
}

.md-history__body {
  flex: 1 1 auto;
  min-height: 0;
}

.md-history__empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--md-space-1);
  color: var(--md-ink-3);
}

.md-history__empty-title {
  margin: 0;
  font-family: var(--md-font-brand);
  font-size: 16px;
}

.md-history__foot {
  flex: 0 0 auto;
  padding-bottom: var(--md-space-3);
}

.md-history__foot .md-hint {
  margin: 0;
}
</style>
