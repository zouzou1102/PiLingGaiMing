/**
 * 计划构建（技术方案 §4.2.1 阶段 0）。
 *
 * **执行器本身不做任何决策** —— 这个模块负责把「一次改名请求」翻译成
 * 三份清单：可执行 / 需跳过 / 非法。执行器只照单执行。
 * 这是「绝不覆盖」四层防护里的第 2 层（计划层）。
 *
 * ★ 本模块**不重复实现**算新名与判冲突的逻辑：它调用 preview.ts 的
 * `resolveItems`，而渲染进程的 Worker 调用的是同一个函数。因此
 * 「预览」与「执行」在结构上不可能算出不同结果（ADR-001）。
 *
 * 关于「只做同目录改名」（P-08）：本模块的产物永远只是一个**名称**，
 * 从不产出路径。`dirPath` 原样透传、`toName` 只可能是名称，
 * 因此「把文件移到别处」这件事在接口形状上就表达不出来。
 */

import { MD_ERROR, MdError } from './errors'
import { resolveItems, type ResolvedItem, type ResolveInput } from './preview'
import type { PlanEntry, RuleConfig } from './types'

export interface RenamePlan {
  /** 待执行清单（顺序即执行顺序，决定序号 `{n}` 的落位）*/
  ready: ResolvedItem[]
  /** 冲突被跳过（DEC-05）与「无变化」项 */
  skipped: ResolvedItem[]
  /** 校验未通过：非法字符 / 保留名 / 空名 / 路径过长 */
  invalid: ResolvedItem[]
}

export function buildRenamePlan(
  items: ResolveInput[],
  rule: RuleConfig,
  date: string,
  snapshot: Record<string, string[]>,
  autoResolve: boolean,
): RenamePlan {
  const resolved = resolveItems(items, rule, date, snapshot, autoResolve)

  const plan: RenamePlan = { ready: [], skipped: [], invalid: [] }
  for (const r of resolved) {
    switch (r.outcome) {
      case 'ready':
        plan.ready.push(r)
        break
      case 'invalid':
        plan.invalid.push(r)
        break
      default:
        plan.skipped.push(r)
        break
    }
  }
  return plan
}

/**
 * 计划自检：待执行清单里每一项的目标名都必须是**纯名称**，
 * 且与源名不同、且不与来源同名（大小写不计）。
 *
 * 这是「绝不覆盖」在计划层的最后一道断言。它不该在正常运行中触发 ——
 * 一旦触发说明上游判定出了问题，此时**宁可整单拒绝，也不能盲目执行**。
 */
export function assertPlanIsSafe(plan: RenamePlan): void {
  for (const entry of plan.ready) {
    if (entry.toName === '') {
      throw new MdError(MD_ERROR.E_EMPTY_NAME, entry.fromName)
    }
    if (entry.toName.includes('\\') || entry.toName.includes('/')) {
      throw new MdError(MD_ERROR.E_INVALID_CHAR, entry.toName)
    }
  }
}

/** 把 ResolvedItem 压成对外的 PlanEntry（供日志与测试断言）*/
export function toPlanEntry(r: ResolvedItem): PlanEntry {
  return {
    id: r.id,
    dirPath: r.dirPath,
    fromName: r.fromName,
    toName: r.toName,
    isDir: r.isDir,
    outcome: r.outcome,
    code: r.code,
  }
}
