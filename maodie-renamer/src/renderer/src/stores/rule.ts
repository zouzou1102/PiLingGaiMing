/**
 * 规则配置 store。
 *
 * 这一层不 import files store —— 规则的变更由 files store 里的 `watch` 捕获并
 * 触发预览重算。这样依赖方向只有 files → rule 一条，不会成环
 * （技术方案 §4.3.2 的「跨 store 依赖方向」）。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_RULE, type RuleConfig, type RuleMode } from '@shared/types'
import { buildRuleSummary } from '@shared/rule-summary'
import { compileRegex } from '@shared/rule-engine'

function cloneDefault(): RuleConfig {
  return { ...DEFAULT_RULE, delete: { ...DEFAULT_RULE.delete }, replace: { ...DEFAULT_RULE.replace }, rule: { ...DEFAULT_RULE.rule } }
}

/**
 * patch 的入参形状：顶层字段可选，三个子对象也**只给要改的字段**即可。
 * 若直接要求 `Partial<RuleConfig>`，调用方就得写
 * `patch({ delete: { text } })` 之外还得补全 find/to —— 明明是可选补丁却要写全，
 * 很容易漏字段（编译期就会报「Property 'to' is missing」）。
 */
export type RulePatch = Partial<Omit<RuleConfig, 'delete' | 'replace' | 'rule'>> & {
  delete?: Partial<RuleConfig['delete']>
  replace?: Partial<RuleConfig['replace']>
  rule?: Partial<RuleConfig['rule']>
}

export const useRuleStore = defineStore('rule', () => {
  const rule = ref<RuleConfig>(cloneDefault())

  const summary = computed(() => buildRuleSummary(rule.value))

  const activeMode = computed(() => rule.value.mode)

  /**
   * F-10 正则非法时的中文原因（合法 / 未开启 / 空 pattern 时为 null）。
   *
   * 由「输入框红框」「状态栏提示」「开始改名置灰」三处共用 —— 单一来源，
   * 避免三处各判一次导致文案或口径不一致。
   */
  const regexError = computed<string | null>(() => {
    const r = rule.value
    if (!r.regexEnabled) return null
    // 规则化模式不涉及匹配，正则开关根本不出现，也就不校验
    if (r.mode === 'rule') return null
    const pattern = r.mode === 'delete' ? r.delete.text : r.replace.find
    return compileRegex(pattern, r.caseSensitive).error
  })

  function setMode(mode: RuleMode): void {
    if (rule.value.mode === mode) return
    rule.value.mode = mode
  }

  /** 深合并式补丁：只覆盖传进来的字段 */
  function patch(p: RulePatch): void {
    const { delete: del, replace: rep, rule: inner, ...rest } = p
    Object.assign(rule.value, rest)
    if (del) Object.assign(rule.value.delete, del)
    if (rep) Object.assign(rule.value.replace, rep)
    if (inner) Object.assign(rule.value.rule, inner)
    clamp()
  }

  function patchInner(p: Partial<RuleConfig['rule']>): void {
    Object.assign(rule.value.rule, p)
    clamp()
  }

  /** 越界钳制（IX-044）：起始 ≥ 0、步长 ≥ 1、补零 0–6 */
  function clamp(): void {
    const r = rule.value.rule
    r.seqStart = Math.max(0, Math.trunc(r.seqStart) || 0)
    r.seqStep = Math.max(1, Math.trunc(r.seqStep) || 1)
    r.seqPad = Math.min(6, Math.max(0, Math.trunc(r.seqPad) || 0))
  }

  function reset(): void {
    rule.value = cloneDefault()
  }

  return { rule, summary, activeMode, regexError, setMode, patch, patchInner, reset }
})
