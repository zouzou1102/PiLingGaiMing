<script setup lang="ts">
/**
 * R-03 操作区（EL-020 / EL-021 / EL-022）。
 *
 * IX-020：打开系统文件多选框 → 选中后**攒起来统一调一次** resolvePaths。
 * 为什么不在拿到路径后逐个入列：resolvePaths 会做去重、去除非文件对象、
 * 取目录快照，这些**都是批量操作**；逐个调用会对同一个目录重复 readdir。
 */
import { ref } from 'vue'
import MdIcon from './MdIcon.vue'
import { useFilesStore } from '../stores/files'
import { useTaskStore } from '../stores/task'

const files = useFilesStore()
const task = useTaskStore()
const busy = ref(false)

async function pickFiles(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const res = await window.maodie.fs.pickFiles()
    if (res.ok && !res.data.canceled) await files.addPaths(res.data.paths)
  } finally {
    busy.value = false
  }
}

async function pickDirectory(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const res = await window.maodie.fs.pickDirectory()
    // DEC-01：只加入该文件夹本身，不递归内部文件 —— 接口形状上就只有这一个路径
    if (res.ok && !res.data.canceled && res.data.path) await files.addPaths([res.data.path])
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="md-actionpanel">
    <button class="md-btn md-btn--secondary md-actionpanel__wide" @click="pickFiles">
      <MdIcon name="file" :size="15" />
      添加文件
    </button>
    <button class="md-btn md-btn--secondary md-actionpanel__wide" @click="pickDirectory">
      <MdIcon name="folder" :size="15" />
      添加文件夹
    </button>
    <button
      class="md-btn md-btn--ghost md-actionpanel__wide"
      :disabled="files.items.length === 0"
      @click="task.askClear()"
    >
      清空列表
    </button>

    <p class="md-actionpanel__tip">拖到窗口里也行哦～</p>
  </section>
</template>

<style scoped>
.md-actionpanel {
  display: flex;
  flex-direction: column;
  gap: var(--md-space-2);
}

.md-actionpanel__wide {
  width: 100%;
}

.md-actionpanel__tip {
  margin: var(--md-space-1) 0 0;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--md-ink-3);
  text-align: center;
}
</style>
