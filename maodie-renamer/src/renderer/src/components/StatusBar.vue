<script setup lang="ts">
/**
 * R-07 状态栏（EL-070 ~ EL-072）。
 *
 * 文案规则完全照 交互说明 §11.2 的表，一条不多一条不少：
 *   初始「就绪」/ 有变化「共 N 项 · 预览 M 项将发生变化」/
 *   无变化「共 N 项 · 当前规则不会改变任何名字」/ 冲突追加 / 非法追加 /
 *   执行中「已处理 N / M」/ 撤销完成「已撤销 N 项，名字都改回去啦」/
 *   重复项等临时提示（3s 后回到常态文案）
 *
 * 状态点颜色：绿=就绪、橘=执行中、红=有冲突或非法（设计规范 §4.4）。
 */
import { computed } from 'vue'
import { useFilesStore } from '../stores/files'
import { useHistoryStore } from '../stores/history'
import { useRuleStore } from '../stores/rule'
import { useTaskStore } from '../stores/task'

const files = useFilesStore()
const task = useTaskStore()
const history = useHistoryStore()
const rule = useRuleStore()

const text = computed(() => {
  if (task.statusText) return task.statusText
  if (files.transient) return files.transient.text

  const n = files.total
  if (n === 0) return rule.regexError ? '正则表达式有误' : '就绪'

  const parts: string[] = [`共 ${n} 项`]
  if (files.stats.changed > 0) parts.push(`预览 ${files.stats.changed} 项将发生变化`)
  else parts.push('当前规则不会改变任何名字')

  if (files.stats.conflict > 0) parts.push(`${files.stats.conflict} 项重名冲突（默认跳过，不会覆盖）`)
  if (files.stats.invalid > 0) parts.push(`${files.stats.invalid} 项名称非法`)
  if (rule.regexError) parts.push('正则表达式有误')
  return parts.join(' · ')
})

/** 淘汰提示（DEC-09：淘汰发生时必须显式告知，不静默）*/
const evictedNotice = computed(() =>
  history.evictedNotice > 0 ? '为保证性能，较旧的记录已被清理' : '',
)

const dotClass = computed(() => {
  if (task.running) return 'md-dot--run'
  if (rule.regexError || files.stats.conflict > 0 || files.stats.invalid > 0) return 'md-dot--bad'
  return 'md-dot--ok'
})

const showProgress = computed(() => task.running || files.previewPending)
</script>

<template>
  <footer class="md-statusbar">
    <span class="md-dot md-dot--sm" :class="dotClass" aria-hidden="true" />
    <span class="md-statusbar__text">{{ text }}</span>
    <span v-if="evictedNotice" class="md-statusbar__notice">{{ evictedNotice }}</span>

    <div v-if="showProgress" class="md-statusbar__progress">
      <div class="md-progress" :class="{ 'md-progress--cancel': task.progress.phase === 'rolling_back' }">
        <div class="md-progress__fill" :style="{ width: `${task.running ? task.overallPercent : 100}%` }" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.md-statusbar {
  height: var(--md-statusbar-h);
  flex: 0 0 auto;
  background: var(--md-bg-titlebar);
  display: flex;
  align-items: center;
  gap: var(--md-space-2);
  padding: 0 var(--md-space-4);
  font-size: 11.5px;
  line-height: 16px;
  color: var(--md-ink-3);
}

.md-statusbar__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-statusbar__notice {
  color: var(--md-warn);
  flex: 0 0 auto;
}

.md-statusbar__progress {
  margin-left: auto;
  width: 180px;
  flex: 0 0 auto;
}
</style>
