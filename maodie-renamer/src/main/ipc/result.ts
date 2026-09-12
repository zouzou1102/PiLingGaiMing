/**
 * 业务通道的返回包装（接口文档 §1.3.1）。
 *
 * 业务失败**不 reject**，而是 `{ ok: false, code, detail }`：
 * 批量改名里「部分失败」是正常业务流程，用 reject 表达会让调用方到处 try/catch，
 * 漏掉一处就是未捕获的 Promise rejection，最坏情况界面卡在「执行中」出不来。
 */

import { MD_ERROR, isMdError, type MdErrorCode } from '@shared/errors'
import type { MdResult } from '@shared/types'

export async function business<T>(job: () => Promise<T>): Promise<MdResult<T>> {
  try {
    return { ok: true, data: await job() }
  } catch (err) {
    const code: MdErrorCode = isMdError(err) ? err.code : MD_ERROR.E_UNKNOWN
    const detail = err instanceof Error ? err.message : undefined
    if (code === MD_ERROR.E_UNKNOWN) {
      console.warn('[md] 业务通道未归类错误：', err)
    }
    return { ok: false, code, detail }
  }
}
