/**
 * 规则引擎 —— 「算新名」。
 *
 * 三个约束必须刻在实现里：
 * 1. **只算「新主体」**：不管扩展名、不判冲突、不碰文件。
 * 2. **三个模式互斥**（DEC-02）：用 switch 而非「顺序执行三条规则」，
 *    从实现上排除「删了又替换还加序号」这种复合结果。
 * 3. **不取当前时间**：日期由调用方以参数传入（ADR-001 代价 2 / DEC-03），
 *    这样同一个函数在测试里能给出确定结果。
 */

import type { DateFormat, RuleConfig } from './types'
import type { NameParts } from './name-split'

export interface RuleContext {
  /** 该项在列表中的序号（从 0 开始） */
  index: number
  /** 列表总数 */
  total: number
  /** 目标日期，格式 YYYY-MM-DD，由调用方传入（DEC-03） */
  date: string
}

/* ── 序号与日期的文本化 ─────────────────────────────────────────────── */

/**
 * 序号文本：`seqStart + index * seqStep`，左侧补 0 到 seqPad 位。
 * 参数已在 UI 层钳制（起始 ≥ 0、步长 ≥ 1、补零 0–6），这里再做一次防御。
 */
export function seqText(rule: RuleConfig['rule'], index: number): string {
  const start = Math.max(0, Math.trunc(rule.seqStart) || 0)
  const step = Math.max(1, Math.trunc(rule.seqStep) || 1)
  const pad = Math.min(6, Math.max(0, Math.trunc(rule.seqPad) || 0))
  const n = start + index * step
  return pad > 0 ? String(n).padStart(pad, '0') : String(n)
}

/** 按 dateFormat 格式化日期串（输入形如 `2026-09-11`） */
export function dateText(date: string, format: DateFormat): string {
  const [y = '', m = '', d = ''] = date.split('-')
  switch (format) {
    case 'YYYYMMDD':
      return `${y}${m}${d}`
    case 'YYYY年MM月DD日':
      return `${y}年${m}月${d}日`
    case 'YYYY-MM-DD':
    default:
      return date
  }
}

/* ── 删除 / 替换的匹配定位 ──────────────────────────────────────────── */

/**
 * 按「全部出现位置」扫描并拼接。
 *
 * **不能**用 `stem.replaceAll(needle, '')` —— 那在大小写不敏感时完全失效
 * （大小写不一致的出现位置匹配不到）。正确做法是把两边归一化后定位，
 * 再**按原串的索引**切片。
 */
function spliceAll(
  stem: string,
  needle: string,
  replacement: string | null,
  caseSensitive: boolean,
): string {
  if (needle === '') return stem

  const hay = caseSensitive ? stem : stem.toLowerCase()
  const pin = caseSensitive ? needle : needle.toLowerCase()

  let out = ''
  let i = 0
  while (i <= hay.length) {
    const at = hay.indexOf(pin, i)
    if (at === -1) {
      out += stem.slice(i)
      break
    }
    out += stem.slice(i, at)
    if (replacement !== null) out += replacement
    // ★ 游标跳过命中片段，**不回头二次匹配** —— 避免 `a → aa` 无限膨胀
    i = at + pin.length
  }
  return out
}

/** 删除模式的算法（F-03）。`text` 为空时规则不生效 */
export function applyDelete(stem: string, text: string, caseSensitive: boolean): string {
  return spliceAll(stem, text, null, caseSensitive)
}

/** 替换模式的算法（F-04）。`to` 为空等价于删除 */
export function applyReplace(
  stem: string,
  find: string,
  to: string,
  caseSensitive: boolean,
): string {
  return spliceAll(stem, find, to, caseSensitive)
}

/* ── 规则化模式的组合公式（★ 唯一权威：技术方案 §4.1.2 / PRD §4.2.5）── */

/**
 * ```
 * 序号文本 n = 补零后的序号；日期文本 d = 按 dateFormat 格式化
 *
 * [A] keepOriginal = true,  seqPosition = 'suffix'（默认）
 *       prefix + d + stem + suffix + n
 * [B] keepOriginal = true,  seqPosition = 'prefix'
 *       prefix + n + d + stem + suffix
 * [C] keepOriginal = false, seqPosition = 'suffix'
 *       prefix + d + suffix + n
 * [D] keepOriginal = false, seqPosition = 'prefix'
 *       prefix + n + d + suffix
 * ```
 *
 * 变量去重：`{n}` / `{d}` 出现在前缀或后缀里时，对应的自动片段不再追加。
 * 实现要点：**先扫一遍收集 consumed 标记，再做组合** —— 不能边替换边判断，
 * 否则 `{n}` 只出现在后缀里时会被漏掉（因为前缀的替换已经先跑完了）。
 *
 * `seqEnabled === false` → `{n}` 展开为空串（保持位置，不报错）；`{d}` 同理。
 */
export function applyRuleMode(
  stem: string,
  rule: RuleConfig['rule'],
  ctx: RuleContext,
): string {
  const n = rule.seqEnabled ? seqText(rule, ctx.index) : ''
  const d = rule.dateEnabled ? dateText(ctx.date, rule.dateFormat) : ''

  const rawPrefix = rule.prefix ?? ''
  const rawSuffix = rule.suffix ?? ''

  // 第一步：扫一遍，判定变量是否已被用户显式使用
  const usesN = rule.seqEnabled && (rawPrefix.includes('{n}') || rawSuffix.includes('{n}'))
  const usesD = rule.dateEnabled && (rawPrefix.includes('{d}') || rawSuffix.includes('{d}'))

  // 第二步：展开变量（未启用的变量展开为空串）
  const prefix = expand(rawPrefix, n, d)
  const suffix = expand(rawSuffix, n, d)

  // 第三步：按 seqPosition 组合
  const autoD = usesD ? '' : d
  const autoN = usesN ? '' : n

  const seqBefore = rule.seqPosition === 'prefix'
  const body = rule.keepOriginal ? stem : ''

  return seqBefore
    ? prefix + autoN + autoD + body + suffix
    : prefix + autoD + body + suffix + autoN
}

function expand(text: string, n: string, d: string): string {
  return text.split('{n}').join(n).split('{d}').join(d)
}

/* ── 对外主函数 ─────────────────────────────────────────────────────── */

/** 只算「新主体」：不管扩展名、不判冲突、不碰文件 */
export function computeNewStem(
  parts: NameParts,
  rule: RuleConfig,
  ctx: RuleContext,
): string {
  switch (rule.mode) {
    case 'delete':
      return applyDelete(parts.stem, rule.delete.text ?? '', rule.caseSensitive)
    case 'replace':
      return applyReplace(
        parts.stem,
        rule.replace.find ?? '',
        rule.replace.to ?? '',
        rule.caseSensitive,
      )
    case 'rule':
      return applyRuleMode(parts.stem, rule.rule, ctx)
    default:
      return parts.stem
  }
}
