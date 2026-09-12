<script setup lang="ts">
/**
 * R-04 文件列表区（EL-030 ~ EL-037）。
 *
 * 三件事必须做对：
 *  1. **虚拟滚动**（> 500 行启用，ADR-005 自实现）。行高固定 36px。
 *  2. **全选 / 行内删除基于 id，不基于 DOM 索引** —— 虚拟滚动会让「第 3 行」
 *     在滚动后变成别的文件，这是虚拟滚动最常见的陷阱。
 *  3. **预览刷新后立即重绘、无过渡动画**（设计规范 §7），避免列表闪动。
 */
import { ref } from 'vue'
import EmptyState from './EmptyState.vue'
import FileRow from './FileRow.vue'
import MdIcon from './MdIcon.vue'
import { useFilesStore } from '../stores/files'
import { useVirtualList } from '../composables/useVirtualList'
import { computed } from 'vue'

const files = useFilesStore()

const scroller = ref<HTMLElement | null>(null)
const count = computed(() => files.items.length)
const { enabled, totalHeight, startIndex, endIndex, offsetY, onScroll } = useVirtualList(scroller, count)

/** 非虚拟化时渲染全部；虚拟化时只渲染可视区（上下各 5 行缓冲）*/
const visibleRows = computed(() => {
  const list = files.items
  if (!enabled.value) return list.map((item, i) => ({ item, index: i }))
  const out: Array<{ item: (typeof list)[number]; index: number }> = []
  for (let i = startIndex.value; i < endIndex.value; i++) {
    if (list[i]) out.push({ item: list[i], index: i })
  }
  return out
})
</script>

<template>
  <section class="md-filelist">
    <!-- 表头：EL-030 计数 + EL-031 全选 -->
    <header class="md-filelist__head">
      <label class="md-check md-check--sm">
        <input
          type="checkbox"
          :checked="files.allSelected"
          :disabled="files.items.length === 0"
          @change="files.toggleSelectAll()"
        />
        <span class="md-check__box"><MdIcon name="check" :size="11" /></span>
        <span class="md-check__label">全选</span>
      </label>
      <span class="md-filelist__count">共 {{ files.total }} 项</span>
      <span v-if="files.previewPending" class="md-filelist__busy">计算中…</span>
      <span v-else-if="files.lastElapsedMs > 0" class="md-filelist__elapsed">
        预览 {{ files.lastElapsedMs }}ms
      </span>
    </header>

    <!-- EL-032 列表容器 -->
    <div ref="scroller" class="md-filelist__body md-scroll" @scroll="onScroll">
      <EmptyState v-if="files.items.length === 0" />

      <div v-else :style="enabled ? { height: `${totalHeight}px`, position: 'relative' } : undefined">
        <div :style="enabled ? { transform: `translateY(${offsetY}px)` } : undefined">
          <FileRow
            v-for="row in visibleRows"
            :key="row.item.id"
            :item="row.item"
            :selected="files.selectedIds.has(row.item.id)"
            @toggle="files.toggleSelect"
            @remove="files.removeItem"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.md-filelist {
  display: flex;
  flex-direction: column;
  /* ★ 高度基准档位（180px 下限 / 38% 窗口高 / 320px 上限）+ 有剩余空间时吸收：
     规则区再长也挤不掉它（flex-shrink = 0），规则区短时它填掉空档（flex-grow = 1），
     所以既不会出现「被压瘪」，也不会留一条空荡荡的带子。
     注意：列表内部仍是一个独立滚动区（虚拟滚动必需），滚动条不会消失。 */
  flex: 1 0 auto;
  height: clamp(180px, 38vh, 320px);
  background: var(--md-bg-card);
  border-radius: var(--md-radius-card);
  box-shadow: var(--md-shadow-card);
  overflow: hidden;
}

.md-filelist__head {
  height: var(--md-list-head-h);
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--md-space-3);
  padding: 0 var(--md-space-3);
  border-bottom: 1px solid var(--md-line);
}

.md-filelist__count {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--md-ink-2);
  font-family: var(--md-font-num);
}

.md-filelist__busy {
  font-size: 11.5px;
  color: var(--md-warn);
}

.md-filelist__elapsed {
  font-size: 11.5px;
  color: var(--md-ink-4);
  font-family: var(--md-font-num);
  margin-left: auto;
}

.md-filelist__body {
  flex: 1 1 auto;
  min-height: 0;
  /* 预览刷新立即重绘、无过渡动画（避免列表闪动）*/
  will-change: transform;
}
</style>
