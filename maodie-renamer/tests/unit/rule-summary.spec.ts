import { describe, expect, it } from 'vitest'
import { buildRuleSummary } from '@shared/rule-summary'
import { DEFAULT_RULE, type RuleConfig } from '@shared/types'

function rule(patch: Partial<RuleConfig> = {}, rulePatch: Partial<RuleConfig['rule']> = {}): RuleConfig {
  return { ...DEFAULT_RULE, ...patch, rule: { ...DEFAULT_RULE.rule, ...rulePatch } }
}

describe('rule-summary · 历史页规则摘要', () => {
  it('删除模式（数据库设计 §4.1 的示例文案）', () => {
    expect(buildRuleSummary(rule({ mode: 'delete', delete: { text: '【某某公众号】' } }))).toBe(
      '删除「【某某公众号】」',
    )
  })

  it('删除模式 + 区分大小写', () => {
    expect(
      buildRuleSummary(rule({ mode: 'delete', caseSensitive: true, delete: { text: 'ABC' } })),
    ).toBe('删除「ABC」（区分大小写）')
  })

  it('删除内容为空 → 明确说明未设置，而不是显示空引号', () => {
    expect(buildRuleSummary(rule({ mode: 'delete', delete: { text: '' } }))).toBe('未设置删除内容')
  })

  it('替换模式', () => {
    expect(
      buildRuleSummary(rule({ mode: 'replace', replace: { find: '最终版', to: '定稿' } })),
    ).toBe('替换「最终版」→「定稿」')
  })

  it('替换为空 → 标注（删除）', () => {
    expect(buildRuleSummary(rule({ mode: 'replace', replace: { find: '广告', to: '' } }))).toBe(
      '替换「广告」→（删除）',
    )
  })

  it('规则化模式（数据库设计 §4.1 的示例文案口径）', () => {
    const s = buildRuleSummary(
      rule(
        { mode: 'rule' },
        { prefix: '{d}-发票-', dateEnabled: true, seqEnabled: true, seqStart: 1, seqPad: 3, keepOriginal: false },
      ),
    )
    expect(s).toContain('前缀「{d}-发票-」')
    expect(s).toContain('序号(起始 1 / 补零 3 / 排在最后)')
    expect(s).toContain('日期(YYYY-MM-DD)')
    expect(s).toContain('不保留原名')
  })

  it('规则化模式步长非 1 时才显示步长', () => {
    const s = buildRuleSummary(rule({ mode: 'rule' }, { seqEnabled: true, seqStep: 5, seqPad: 0 }))
    expect(s).toContain('步长 5')
    expect(s).toContain('不补零')
  })

  it('规则化模式一个要素都没启用 → 明确说明，而不是空字符串', () => {
    expect(buildRuleSummary(rule({ mode: 'rule' }))).toBe('未设置任何规则要素')
  })

  it('规则化模式的序号/日期位置标签', () => {
    expect(buildRuleSummary(rule({ mode: 'rule' }, { seqEnabled: true, seqPosition: 'prefix' }))).toContain(
      '排在最前',
    )
  })
})
