/**
 * 键盘快捷键（交互说明 §9）。
 *
 * 为什么这些按键在渲染层实现，而不是主进程的菜单加速键：
 * 它们的结果全部是**界面动作**（打开系统文件框、切到历史页、删行、关弹窗、
 * 触发主操作）。要在主进程注册就得新增事件通道，而事件通道在接口文档里
 * 固定为 3 个 —— 不为了省几行代码去破坏一份已经定稿的契约。
 *
 * 一处必要的小让步：`Ctrl+Z` 的产品语义是「进入撤销页」，但当焦点在输入框里时，
 * 用户期待的显然是「撤销我刚才的输入」。两者冲突时让位于用户的即时预期 ——
 * 在输入框内不拦截 Ctrl+Z。
 */

import { onMounted, onUnmounted } from 'vue'

export interface KeyboardHandlers {
  onAddFiles: () => void
  onOpenHistory: () => void
  onDeleteSelected: () => void
  onEscape: () => void
  onEnterPrimary: () => void
}

function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useKeyboard(handlers: KeyboardHandlers): void {
  function onKeyDown(e: KeyboardEvent): void {
    const inInput = isTextInput(e.target)

    // Esc：关弹窗 / 从历史页返回（弹窗由各自的组件处理，这里兜底历史页）
    if (e.key === 'Escape') {
      handlers.onEscape()
      return
    }

    // Ctrl+O：添加文件
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      handlers.onAddFiles()
      return
    }

    // Ctrl+Z：进入撤销页（仅在非输入框中）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inInput) {
      e.preventDefault()
      handlers.onOpenHistory()
      return
    }

    // Delete / Backspace：移除列表行（仅在非输入框中，避免误删正在编辑的文字）
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      e.preventDefault()
      handlers.onDeleteSelected()
      return
    }

    // Enter：焦点在主按钮时触发主操作
    if (e.key === 'Enter' && !inInput) {
      handlers.onEnterPrimary()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
