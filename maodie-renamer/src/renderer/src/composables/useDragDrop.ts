/**
 * 拖拽入列（IX-022 / IX-023 / IX-024）。
 *
 * ★ 实现要点（交互文档 §IX-022 明确写在文档里的那一条）：
 * `dragenter` 会因**嵌套元素**而重复触发，所以必须**计数**；
 * 只有 `dragleave` 把计数减到 0 才隐藏蒙层；`drop` 后**必须把计数重置为 0**。
 * 不这么做就会出现「蒙层闪一下就消失」或「蒙层永远不消失」。
 */

import { computed, onUnmounted, ref } from 'vue'

export interface DragDropOptions {
  onPaths: (paths: string[]) => void
}

/** 从 DataTransfer 里挑出真正的文件系统路径 */
function extractPaths(dt: DataTransfer | null): string[] {
  if (!dt) return []
  const out: string[] = []
  // 目录在 Windows 上也走 'Files'
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    // Electron 会给拖入的文件对象注入真实路径
    const p = (file as (File & { path?: string }) | null)?.path
    if (typeof p === 'string' && p !== '') out.push(p)
  }
  if (out.length > 0) return out
  // 兜底：某些环境只有 files
  for (const file of Array.from(dt.files ?? [])) {
    const p = (file as File & { path?: string }).path
    if (typeof p === 'string' && p !== '') out.push(p)
  }
  return out
}

/** 拖入的内容里有没有「文件系统对象」——没有就是网页链接 / 纯文本（EX-08）*/
function hasFileSystemObject(dt: DataTransfer | null): boolean {
  const types = Array.from(dt?.types ?? [])
  return types.includes('Files')
}

export function useDragDrop(options: DragDropOptions) {
  const depth = ref(0)
  const dragging = ref(false)
  const rejected = ref(false)
  const lastCount = ref(0)

  const visible = computed(() => dragging.value)

  function onDragEnter(e: DragEvent): void {
    e.preventDefault()
    depth.value++
    rejected.value = !hasFileSystemObject(e.dataTransfer)
    dragging.value = true
  }

  function onDragOver(e: DragEvent): void {
    // 必须 preventDefault，否则浏览器不会触发 drop
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = hasFileSystemObject(e.dataTransfer) ? 'copy' : 'none'
    rejected.value = !hasFileSystemObject(e.dataTransfer)
  }

  function onDragLeave(e: DragEvent): void {
    e.preventDefault()
    depth.value = Math.max(0, depth.value - 1)
    if (depth.value === 0) {
      dragging.value = false
      rejected.value = false
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault()
    // ★ 必须重置计数，否则嵌套元素留下的计数会让蒙层再也关不掉
    depth.value = 0
    dragging.value = false
    const wasRejected = !hasFileSystemObject(e.dataTransfer)
    rejected.value = false

    const paths = extractPaths(e.dataTransfer)
    if (wasRejected || paths.length === 0) {
      // EX-08：拖入网页链接 / 纯文本 → 不接收
      options.onPaths([])
      return
    }
    lastCount.value = paths.length
    options.onPaths(paths)
  }

  onUnmounted(() => {
    depth.value = 0
    dragging.value = false
  })

  return { dragging, visible, rejected, lastCount, onDragEnter, onDragOver, onDragLeave, onDrop }
}
