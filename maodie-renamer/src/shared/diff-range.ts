/**
 * 差异高亮区间（F-08 / 技术方案 §4.1.3）。
 *
 * 算法：取最长公共前缀 p 与最长公共后缀 s（两者不重叠），中间部分即变化片段。
 *
 * 区间是**半开**的 `[start, end)`，与 JS 的 slice 语义一致 ——
 * 这是最容易差一位的地方（接口文档 §5.5 明确提醒）。
 */

import type { DiffRange } from './types'

/**
 * 计算差异区间。返回 `null` 表示两串完全相同（无变化）。
 *
 * 注意：比较的是**完整名字（含扩展名）**，因为用户看到的是完整名。
 */
export function computeDiffRange(oldName: string, newName: string): DiffRange | null {
  const lenOld = oldName.length
  const lenNew = newName.length

  let p = 0
  while (p < lenOld && p < lenNew && oldName[p] === newName[p]) p++

  // 完全相同
  if (p === lenOld && p === lenNew) return null

  // 后缀长度受「p + s 不重叠」约束
  const maxS = Math.min(lenOld, lenNew) - p
  let s = 0
  while (
    s < maxS &&
    oldName[lenOld - 1 - s] === newName[lenNew - 1 - s]
  ) {
    s++
  }

  return {
    oldStart: p,
    oldEnd: lenOld - s,
    newStart: p,
    newEnd: lenNew - s,
  }
}

/** 把名字按差异区间切成三段，供渲染层直接使用（避免组件里再算一次索引）*/
export interface DiffSegments {
  before: string
  changed: string
  after: string
}

/** 按区间切分字符串；区间为 null 或空区间时 changed 为空串 */
export function sliceByRange(text: string, start: number, end: number): DiffSegments {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  return { before: text.slice(0, s), changed: text.slice(s, e), after: text.slice(e) }
}
