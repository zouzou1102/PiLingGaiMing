/**
 * 预览 Worker（ADR-003）。
 *
 * 放在 Worker 里而不是「每次问主进程」的理由：主进程可能正在跑一场 1000 项的
 * 改名，预览请求会和它抢主进程；而 Worker 内计算只发生一次结构化克隆，
 * 主进程完全不受影响。
 *
 * ★ 它调用的是 `@shared/preview` —— 与主进程阶段 0 完全同一份源码。
 * 因此「预览」与「执行」在结构上不可能算出不同结果。
 */

import { buildPreview } from '@shared/preview'
import type { PreviewRequest, PreviewResponse } from '@shared/types'

self.onmessage = (e: MessageEvent<PreviewRequest>): void => {
  const req = e.data
  const r = buildPreview(req.items, req.rule, req.date, req.snapshot, req.autoResolveConflict)
  const res: PreviewResponse = {
    reqId: req.reqId,
    items: r.items,
    stats: r.stats,
    elapsedMs: r.elapsedMs,
  }
  ;(self as unknown as Worker).postMessage(res)
}
