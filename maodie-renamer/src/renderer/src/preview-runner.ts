/**
 * 预览计算入口：优先用 Web Worker，不可用时**回退到主线程同步计算**。
 *
 * 为什么要这个回退（不是过度设计）：
 * 生产环境渲染层是从 `file://` 加载的，而 ES 模块形式的 Worker 在 file:// 下
 * 可能受同源策略限制而加载失败。ADR-003 选 Worker 是为了「不抢主进程、不卡界面」，
 * 而不是为了「Worker 挂了功能就不可用」。因此：Worker 能用就用，加载失败就同步算
 * （1000 项实测 5–15ms，用户感知不到），**功能永不受影响**。
 *
 * 两条路径调用的是同一个 `@shared/preview`，所以结果不可能不一致。
 */

import { buildPreview } from '@shared/preview'
import type { PreviewRequest, PreviewResponse } from '@shared/types'

export interface PreviewRunner {
  run(req: PreviewRequest): Promise<PreviewResponse>
  /** 当前是否真的在用 Worker（仅用于开发排查）*/
  readonly usingWorker: boolean
  dispose(): void
}

function inlineRun(req: PreviewRequest): PreviewResponse {
  const r = buildPreview(req.items, req.rule, req.date, req.snapshot, req.autoResolveConflict)
  return { reqId: req.reqId, items: r.items, stats: r.stats, elapsedMs: r.elapsedMs }
}

export function createPreviewRunner(): PreviewRunner {
  /** reqId → 该次请求的输入与 resolve（回退时要靠输入就地重算）*/
  const pending = new Map<number, { req: PreviewRequest; resolve: (r: PreviewResponse) => void }>()

  let worker: Worker | null = null
  let broken = false

  /** 回退：把尚未回应的请求全部就地算完，保证调用方永远拿到结果 */
  function settleInline(): void {
    broken = true
    const queued = [...pending.values()]
    pending.clear()
    try {
      worker?.terminate()
    } catch {
      /* 已经没了 */
    }
    worker = null
    for (const { req, resolve } of queued) resolve(inlineRun(req))
  }

  try {
    worker = new Worker(new URL('./workers/preview.worker.ts', import.meta.url), {
      type: 'module',
      name: 'md-preview',
    })
    worker.onmessage = (e: MessageEvent<PreviewResponse>) => {
      const entry = pending.get(e.data.reqId)
      if (entry) {
        pending.delete(e.data.reqId)
        entry.resolve(e.data)
      }
    }
    worker.onerror = (e) => {
      console.warn('[md] 预览 Worker 出错，回退到主线程计算：', e.message)
      settleInline()
    }
  } catch (err) {
    console.warn('[md] 预览 Worker 创建失败，回退到主线程计算：', err)
    broken = true
    worker = null
  }

  return {
    get usingWorker() {
      return worker !== null && !broken
    },

    run(req: PreviewRequest): Promise<PreviewResponse> {
      if (broken || !worker) return Promise.resolve(inlineRun(req))

      return new Promise<PreviewResponse>((resolve) => {
        pending.set(req.reqId, { req, resolve })
        worker!.postMessage(req)
      })
    },

    dispose(): void {
      pending.clear()
      try {
        worker?.terminate()
      } catch {
        /* noop */
      }
      worker = null
      broken = true
    },
  }
}
