/**
 * 规则摘要文案（供历史页展示，`RenameTask.ruleSummary`）。
 *
 * 单独成模块的理由：同一段文案在「历史页卡片」「撤销确认弹窗」两处出现，
 * 且它要参与持久化 —— 硬编码在组件里会让历史记录与代码版本耦合。
 */

import { dateFormatLabel, seqPositionLabel } from './labels'
import type { RuleConfig } from './types'

export function buildRuleSummary(rule: RuleConfig): string {
  switch (rule.mode) {
    case 'delete': {
      const text = rule.delete.text
      if (!text) return '未设置删除内容'
      return `删除「${text}」${rule.caseSensitive ? '（区分大小写）' : ''}`
    }

    case 'replace': {
      const { find, to } = rule.replace
      if (!find) return '未设置查找内容'
      const right = to === '' ? '（删除）' : `「${to}」`
      return `替换「${find}」→${right}${rule.caseSensitive ? '（区分大小写）' : ''}`
    }

    case 'rule': {
      const r = rule.rule
      const parts: string[] = []

      if (r.prefix) parts.push(`前缀「${r.prefix}」`)
      if (r.suffix) parts.push(`后缀「${r.suffix}」`)

      if (r.seqEnabled) {
        const bits = [`起始 ${r.seqStart}`]
        if (r.seqStep !== 1) bits.push(`步长 ${r.seqStep}`)
        bits.push(r.seqPad === 0 ? '不补零' : `补零 ${r.seqPad}`)
        bits.push(seqPositionLabel(r.seqPosition))
        parts.push(`序号(${bits.join(' / ')})`)
      }

      if (r.dateEnabled) {
        parts.push(`日期(${dateFormatLabel(r.dateFormat)})`)
      }

      if (parts.length === 0) return '未设置任何规则要素'

      parts.push(r.keepOriginal ? '保留原名' : '不保留原名')
      return parts.join(' + ')
    }

    default:
      return '未知规则'
  }
}
