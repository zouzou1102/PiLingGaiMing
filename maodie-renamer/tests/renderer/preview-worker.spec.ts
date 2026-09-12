/**
 * 回归测试：预览必须真的走完一次 Worker 往返。
 *
 * 背景（真实 bug）：`runPreview` 把 Vue 响应式对象（`snapshot.value`）直接交给
 * `postMessage`，结构化克隆无法克隆 Proxy → `DataCloneError` 同步抛出 →
 * Promise 直接失败 → `previewPending` 永久停在 true → 主按钮永远置灰、
 * 列表拿不到新名字、状态栏永远「计算中…」。
 *
 * 为什么之前的用例没抓到：node 环境没有 `Worker`，代码自动回退到主线程计算，
 * 压根没经过 `postMessage`。这里用一个「和真实 Worker 行为一致的假 Worker」
 * （postMessage 里真的做一次结构化克隆）把这条路补上。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildPreview } from '@shared/preview'
import type { PreviewRequest } from '@shared/types'

const DIR = 'C:\\d'
const DELETE_TEXT = '【某某公众号】'

interface SentRequest extends PreviewRequest {
  __cloneError?: Error
}

/** 记录最近一次被发送的请求，供断言使用 */
let lastSent: SentRequest | null = null

/** 行为对齐真实 Worker：postMessage 会对入参做结构化克隆，克隆不了就同步抛错 */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor() {
    lastSent = null
  }

  postMessage(data: PreviewRequest): void {
    let cloned: PreviewRequest
    try {
      // ★ 这一行就是真机上的那道坎：Vue 响应式代理在这里会抛 DataCloneError
      cloned = structuredClone(data)
    } catch (err) {
      lastSent = { ...data, __cloneError: err as Error }
      throw err
    }
    lastSent = cloned
    setTimeout(() => {
      const r = buildPreview(cloned.items, cloned.rule, cloned.date, cloned.snapshot, cloned.autoResolveConflict)
      this.onmessage?.({
        data: { reqId: cloned.reqId, items: r.items, stats: r.stats, elapsedMs: r.elapsedMs },
      } as unknown as MessageEvent)
    }, 0)
  }

  terminate(): void {
    /* noop */
  }
}

;(globalThis as unknown as { Worker: unknown }).Worker = FakeWorker

function mkItems(): unknown[] {
  const out: unknown[] = []
  for (let i = 1; i <= 20; i++) {
    const name = `${DELETE_TEXT}报告${String(i).padStart(2, '0')}.docx`
    out.push({
      id: `id${i}`,
      fullPath: `${DIR}\\${name}`,
      dirPath: DIR,
      name,
      stem: name.slice(0, name.lastIndexOf('.')),
      ext: '.docx',
      isDir: false,
      isSymlink: false,
      newStem: '',
      newName: '',
      status: 'pending',
    })
  }
  return out
}

function mkBatch() {
  const items = mkItems()
  return {
    items,
    snapshot: { 'c:\\d': items.map((i) => (i as { name: string }).name) },
    stats: { accepted: 20, ignoredDuplicates: 0, overflow: 0, rejected: 0, vanished: 0 },
  }
}

let batch = mkBatch()

;(globalThis as unknown as { window: unknown }).window = {
  maodie: {
    fs: { resolvePaths: async () => ({ ok: true, data: batch }) },
    rename: { onProgress: () => () => {} },
    app: {
      getPrefs: async () => ({
        version: 1,
        soundEnabled: false,
        reduceMotion: true,
        confirmThreshold: 10,
        theme: 'light',
      }),
    },
  },
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('预览 Worker 往返', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    batch = mkBatch()
    lastSent = null
  })

  it('发给 Worker 的预览请求必须可结构化克隆（否则按钮永久置灰）', async () => {
    const { useFilesStore } = await import('../../src/renderer/src/stores/files')
    const { useRuleStore } = await import('../../src/renderer/src/stores/rule')
    const files = useFilesStore()
    const rule = useRuleStore()

    await files.addPaths([DIR])
    await wait(300)

    expect(lastSent, '预览请求应该已经发给 Worker').not.toBeNull()
    expect(lastSent?.__cloneError, `请求不可克隆：${lastSent?.__cloneError?.message ?? ''}`).toBeUndefined()

    expect(files.previewPending, '预览完成后不应还停在「计算中」').toBe(false)
    expect(lastSent?.snapshot).toEqual({ 'c:\\d': expect.any(Array) })

    await wait(250)
    rule.patch({ delete: { text: DELETE_TEXT } })
    await wait(300)

    expect(files.items.map((i) => i.status).every((s) => s === 'changed')).toBe(true)
    expect(files.canExecute, '填了待删字符串后主按钮必须可用').toBe(true)
    expect(files.executableCount).toBe(20)
    expect(lastSent?.__cloneError).toBeUndefined()
    expect(files.previewPending).toBe(false)
  })
})
