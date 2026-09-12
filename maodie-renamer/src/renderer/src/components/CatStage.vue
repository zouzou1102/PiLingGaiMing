<script setup lang="ts">
/**
 * R-02 形象区（EL-010 ~ EL-017）—— 状态机载体，同时是拖拽落区。
 *
 * 状态与文案全部来自 `resources/cats/manifest.json`（一键替换形象的关键），
 * 本组件不硬编码任何一句猫咪文案。
 */
import { computed } from 'vue'
import CatBiteLane from './CatBiteLane.vue'
import { useCatStore } from '../stores/cat'
import { useFilesStore } from '../stores/files'
import { usePrefsStore } from '../stores/prefs'
import { useTaskStore } from '../stores/task'

const cat = useCatStore()
const files = useFilesStore()
const prefs = usePrefsStore()
const task = useTaskStore()

/** ST-03 的卡片队列：与列表同源，只取会变化的项 */
const biteEntries = computed(() =>
  files.items
    .filter((i) => i.status === 'changed' || i.status === 'conflict')
    .map((i) => ({ fromName: i.name, toName: i.newName || i.name, isDir: i.isDir })),
)

const isExecuting = computed(() => cat.state === 'ST-03')
</script>

<template>
  <section class="md-catstage md-card">
    <div class="md-catstage__art">
      <div class="md-cat" :class="`md-cat--${cat.state}`" v-html="cat.svg" />

      <!-- ST-04 撒花 / ST-05 怒气符号（叠加元素，不参与形象本身的动画）-->
      <div v-if="cat.state === 'ST-04'" class="md-sparkles" aria-hidden="true">
        <span class="md-sparkle" style="left: 18%; top: 22%" />
        <span class="md-sparkle" style="left: 76%; top: 18%" />
        <span class="md-sparkle" style="left: 62%; top: 42%" />
      </div>
      <div v-else-if="cat.state === 'ST-05'" class="md-anger" aria-hidden="true">
        <span>怒</span>
        <span>怒</span>
      </div>

      <!-- EL-013：仅 ST-03 挂载 -->
      <CatBiteLane
        :active="isExecuting"
        :entries="biteEntries"
        :reduce-motion="prefs.prefs.reduceMotion"
      />
    </div>

    <!-- EL-011 状态文字 -->
    <p class="md-catstage__text" :class="{ 'md-catstage__text--run': isExecuting }">
      {{ task.running && cat.state === 'ST-03' ? cat.message : cat.message || '待机中…' }}
    </p>
  </section>
</template>

<style scoped>
.md-catstage {
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-2);
}

.md-catstage__art {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.md-catstage__text {
  margin: 0;
  font-family: var(--md-font-brand);
  font-size: 14px;
  line-height: 20px;
  color: var(--md-ink-2);
  text-align: center;
}

.md-catstage__text--run {
  color: var(--md-orange-dark);
}
</style>
