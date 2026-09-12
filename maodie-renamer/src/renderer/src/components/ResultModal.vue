<script setup lang="ts">
/**
 * SCR-03 结果弹窗（交互说明 §4）。
 *
 * EL-090 三张卡：成功 / 跳过+失败 / 未处理（非法）
 * EL-091 明细：成功示例取前 3 条；失败项逐条列出「原名 → 尝试的新名 → 原因」
 * EL-092 知道了 / EL-093 撤销本次
 *
 * ⚠ 两个必须处理的边界：
 *  · `problemsTruncated` → 明说「共 N 项，显示前 200 项」，不能让用户以为只有 200 项
 *  · `recordSaved === false` → **必须明确警告本次改名无法撤销**，
 *    而不是让用户以为还能撤（数据库设计 §4.8）
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'
import { useTaskStore } from '../stores/task'

const task = useTaskStore()

const result = computed(() => task.lastResult)

const title = computed(() => {
  const r = result.value
  if (!r) return '改名结果'
  if (r.canceled) return '已取消'
  const bad = r.summary.skipped + r.summary.failed
  return bad > 0 ? '改好啦，但有几项没成功' : '全部改好啦！'
})

const problems = computed(() => result.value?.problems ?? [])
const canUndo = computed(() => (result.value?.recordSaved ?? false) && (result.value?.summary.success ?? 0) > 0)
</script>

<template>
  <AppModal v-if="task.modal === 'result' && result" :title="title" :width="560" @close="task.closeModal()">
    <!-- EL-090 结果摘要 -->
    <div class="md-result__cards">
      <div class="md-result__card md-result__card--ok">
        <span class="md-result__num">{{ result!.summary.success }}</span>
        <span class="md-result__label">成功</span>
      </div>
      <div class="md-result__card md-result__card--bad">
        <span class="md-result__num">{{ result!.summary.skipped + result!.summary.failed }}</span>
        <span class="md-result__label">跳过 / 失败</span>
      </div>
      <div class="md-result__card">
        <span class="md-result__num">{{ result!.summary.invalid }}</span>
        <span class="md-result__label">未处理</span>
      </div>
    </div>

    <!-- 无法撤销的明确警告（不能静默）-->
    <p v-if="!result!.recordSaved && result!.summary.success > 0" class="md-result__warn">
      改名记录未能保存到本机，<strong>本次改名无法撤销</strong>。
    </p>

    <!-- EL-091 成功举例（前 3 条）-->
    <section v-if="result!.successExamples.length > 0" class="md-result__sec">
      <h3 class="md-section-title">成功举例</h3>
      <ul class="md-result__list">
        <li v-for="(e, i) in result!.successExamples" :key="i" class="md-result__item">
          <span class="md-result__name">{{ e.fromName }}</span>
          <span class="md-result__arrow">→</span>
          <span class="md-result__name md-result__name--ok">{{ e.toName }}</span>
        </li>
      </ul>
    </section>

    <!-- 失败 / 跳过清单 -->
    <section v-if="problems.length > 0" class="md-result__sec">
      <h3 class="md-section-title">
        没改成的（{{ problems.length }} 条<span v-if="result!.problemsTruncated">
          ，共 {{ result!.problemsTotal }} 项，显示前 200 项</span
        >）
      </h3>
      <ul class="md-result__list md-result__list--scroll">
        <li v-for="p in problems" :key="p.id + p.attemptedName" class="md-result__item">
          <span class="md-result__name">{{ p.fromName }}</span>
          <span class="md-result__arrow">→</span>
          <span class="md-result__name md-result__name--bad">{{ p.attemptedName || '—' }}</span>
          <span class="md-result__reason">{{ p.reason }}</span>
        </li>
      </ul>
    </section>

    <p v-if="result!.elapsedMs > 0" class="md-hint">耗时 {{ result!.elapsedMs }} ms</p>

    <template #foot>
      <button
        class="md-btn md-btn--secondary"
        :disabled="!canUndo"
        :title="canUndo ? '把本次改的名字改回去' : '本次改名没有可撤销的记录'"
        @click="task.undoLast()"
      >
        撤销本次
      </button>
      <button class="md-btn md-btn--primary" @click="task.closeModal()">知道了</button>
    </template>
  </AppModal>
</template>

<style scoped>
.md-result__cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--md-space-3);
  margin-bottom: var(--md-space-4);
}

.md-result__card {
  border-radius: var(--md-radius-input);
  background: var(--md-bg-warm);
  padding: var(--md-space-3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-1);
}

.md-result__card--ok {
  background: var(--md-ok-bg);
}
.md-result__card--bad {
  background: var(--md-bad-bg);
}

.md-result__num {
  font-family: var(--md-font-num);
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  color: var(--md-ink-1);
}

.md-result__label {
  font-size: 11.5px;
  color: var(--md-ink-3);
}

.md-result__warn {
  margin: 0 0 var(--md-space-3);
  padding: var(--md-space-2) var(--md-space-3);
  border-radius: var(--md-radius-input);
  background: var(--md-bad-bg);
  color: var(--md-bad);
  font-size: 12.5px;
}

.md-result__sec {
  margin-bottom: var(--md-space-3);
}

.md-result__list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12.5px;
}

.md-result__list--scroll {
  max-height: 220px;
  overflow-y: auto;
}

.md-result__item {
  display: flex;
  align-items: center;
  gap: var(--md-space-2);
  padding: 5px 0;
  border-bottom: 1px solid var(--md-line);
}

.md-result__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}

.md-result__name--ok {
  color: var(--md-ok);
}
.md-result__name--bad {
  color: var(--md-bad);
}
.md-result__arrow {
  color: var(--md-ink-4);
  flex: 0 0 auto;
}
.md-result__reason {
  margin-left: auto;
  color: var(--md-ink-3);
  font-size: 11.5px;
  flex: 0 0 auto;
}
</style>
