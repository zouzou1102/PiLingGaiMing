/**
 * 枚举 → 中文标签。界面与规则摘要共用，避免同一枚举在两处出现不同措辞。
 */

import type { CaseTransform, ConflictKind, DateFormat, ItemStatus, SeqPosition } from './types'

export function seqPositionLabel(v: SeqPosition): string {
  return v === 'prefix' ? '排在最前' : '排在最后'
}

export function dateFormatLabel(v: DateFormat): string {
  return v
}

/** F-11 大小写下拉的选项（顺序即界面顺序）*/
export const CASE_TRANSFORM_OPTIONS: Array<{ value: CaseTransform; label: string }> = [
  { value: 'none', label: '保持原样' },
  { value: 'lower', label: '全部小写' },
  { value: 'upper', label: '全部大写' },
  { value: 'capitalize', label: '首字母大写' },
]

/** 规则摘要里的大小写后缀；'none' → 空串（摘要不追加）*/
export function caseTransformLabel(v: CaseTransform): string {
  if (v === 'none') return ''
  return CASE_TRANSFORM_OPTIONS.find((o) => o.value === v)?.label ?? ''
}

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  pending: '待处理',
  unchanged: '无变化',
  changed: '将变化',
  conflict: '重名',
  invalid: '非法',
}

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  none: '',
  batch: '同批撞名',
  disk: '磁盘同名',
  self: '',
  'case-only': '大小写',
}
