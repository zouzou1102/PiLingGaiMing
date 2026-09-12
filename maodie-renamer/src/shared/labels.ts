/**
 * 枚举 → 中文标签。界面与规则摘要共用，避免同一枚举在两处出现不同措辞。
 */

import type { ConflictKind, DateFormat, ItemStatus, SeqPosition } from './types'

export function seqPositionLabel(v: SeqPosition): string {
  return v === 'prefix' ? '排在最前' : '排在最后'
}

export function dateFormatLabel(v: DateFormat): string {
  return v
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
