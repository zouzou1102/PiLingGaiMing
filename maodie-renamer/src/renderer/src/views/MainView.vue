<script setup lang="ts">
/**
 * SCR-01 主窗口（PRD §5.2 的横版宽屏左右分栏）。
 *
 * 布局纪律：
 *  · 左栏固定 300px（窗口 < 960px 收窄到 260px），右栏自适应
 *  · 列表区优先保留高度，规则区撑满剩余
 *  · 窗口宽高变化只影响右栏，左栏不变
 */
import { computed, onMounted, ref } from 'vue'
import ActionBar from '../components/ActionBar.vue'
import ActionPanel from '../components/ActionPanel.vue'
import CatStage from '../components/CatStage.vue'
import FileList from '../components/FileList.vue'
import RulePanel from '../components/RulePanel.vue'
import { useDragDrop } from '../composables/useDragDrop'
import { useFilesStore } from '../stores/files'

const emit = defineEmits<{ (e: 'open-history'): void }>()

const files = useFilesStore()
const root = ref<HTMLElement | null>(null)
const narrow = ref(false)

const { visible, rejected, onDragEnter, onDragOver, onDragLeave, onDrop } = useDragDrop({
  onPaths: (paths) => {
    if (paths.length === 0) {
      // EX-08：拖入网页链接 / 纯文本 → 状态栏提示，不入列
      files.showTransient('只能拖入文件或文件夹哦')
      return
    }
    void files.addPaths(paths)
  },
})

/**
 * 拖拽监听挂在**整个窗口**上（EL-010 全窗口可落），
 * 但蒙层只覆盖右栏与形象区 —— 这样「往里拖」的视觉反馈更聚焦。
 */
const leftWidth = computed(() => (narrow.value ? '260px' : '300px'))

onMounted(() => {
  const update = (): void => {
    narrow.value = window.innerWidth < 960
  }
  update()
  window.addEventListener('resize', update)
})
</script>

<template>
  <div
    ref="root"
    class="md-main"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- 左栏：R-02 形象区 + R-03 操作区 -->
    <aside class="md-main__left" :style="{ width: leftWidth }">
      <CatStage />
      <ActionPanel />
    </aside>

    <!-- 右栏：R-04 列表 + R-05 规则 + R-06 动作 -->
    <section class="md-main__right">
      <FileList />
      <RulePanel />
      <ActionBar @open-history="emit('open-history')" />
    </section>

    <!-- EL-012 拖拽蒙层（拖拽时显示，非文件对象时显示拒绝态）-->
    <div v-if="visible" class="md-dropzone" :class="{ 'md-dropzone--reject': rejected }">
      <template v-if="rejected">只能拖入文件或文件夹哦</template>
      <template v-else>松手就行，交给耄耋～</template>
    </div>
  </div>
</template>

<style scoped>
.md-main {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  gap: var(--md-space-3);
  padding: var(--md-space-3);
}

.md-main__left {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--md-space-3);
  background: var(--md-bg-warm);
  border-radius: var(--md-radius-card);
  padding: 14px;
  overflow-y: auto;
}

.md-main__right {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--md-space-3);
  /* ★ 规则区再高也只在自己内部滚动：不挤压列表、也不溢出窗口。
     之前用 grid 的 auto 行 + 列表 minmax(0,1fr)，规则化模式内容一多就把列表压成 0 高。 */
  overflow: hidden;
}
</style>
