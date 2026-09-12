import { describe, expect, it } from 'vitest'
import { computeDiffRange, sliceByRange } from '@shared/diff-range'

/** U-14：差异区间 —— 覆盖技术方案 §4.1.3 表格里的全部边界情形 */
describe('diff-range · 差异高亮区间（U-14）', () => {
  it('完全相同 → null（界面显示灰色「—」，不计入「将变化」）', () => {
    expect(computeDiffRange('abc.txt', 'abc.txt')).toBeNull()
    expect(computeDiffRange('报告.docx', '报告.docx')).toBeNull()
    expect(computeDiffRange('', '')).toBeNull()
  })

  it('a → b：p=0, s=0，两侧区间都是整串', () => {
    expect(computeDiffRange('a', 'b')).toEqual({ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 })
  })

  it('aa → aaa：s 受「p+s 不重叠」约束，old 区间为空、new 区间是最后那个 a', () => {
    expect(computeDiffRange('aa', 'aaa')).toEqual({ oldStart: 2, oldEnd: 2, newStart: 2, newEnd: 3 })
  })

  it('ab → ba：不做更聪明的匹配（「移动」在这种算法下就是「全变」）', () => {
    expect(computeDiffRange('ab', 'ba')).toEqual({ oldStart: 0, oldEnd: 2, newStart: 0, newEnd: 2 })
  })

  it('删除片段：abc广告.txt → abc.txt', () => {
    // 公共前缀 'abc' =3；公共后缀 '.txt' =4
    expect(computeDiffRange('abc广告.txt', 'abc.txt')).toEqual({
      oldStart: 3,
      oldEnd: 5,
      newStart: 3,
      newEnd: 3,
    })
  })

  it('加前缀：abc.txt → 2026-abc.txt', () => {
    expect(computeDiffRange('abc.txt', '2026-abc.txt')).toEqual({
      oldStart: 0,
      oldEnd: 0,
      newStart: 0,
      newEnd: 5,
    })
  })

  it('比的是完整名字（含扩展名），因为用户看到的是完整名', () => {
    // '报告.docx' 与 '报告.docs' 的公共前缀是 '报告.doc'（6 个字符）
    const r = computeDiffRange('报告.docx', '报告.docs')
    expect(r).toEqual({ oldStart: 6, oldEnd: 7, newStart: 6, newEnd: 7 })
  })

  it('中文与 emoji 按 UTF-16 code unit 逐个比较即可', () => {
    expect(computeDiffRange('😀a', '😀b')).toEqual({ oldStart: 2, oldEnd: 3, newStart: 2, newEnd: 3 })
    // emoji 是代理对，占 2 个 code unit：切出来的区间不应把 emoji 劈开
    expect(computeDiffRange('a😀', 'b😀')).toEqual({ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 })
  })

  it('一侧为空串', () => {
    expect(computeDiffRange('', 'a')).toEqual({ oldStart: 0, oldEnd: 0, newStart: 0, newEnd: 1 })
    expect(computeDiffRange('a', '')).toEqual({ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 0 })
  })
})

describe('diff-range · 区间切片（半开区间，与 slice 语义一致）', () => {
  it('按区间切三段，拼回原串', () => {
    const name = 'abc广告.txt'
    const r = computeDiffRange(name, 'abc.txt')!
    const seg = sliceByRange(name, r.oldStart, r.oldEnd)
    expect(seg).toEqual({ before: 'abc', changed: '广告', after: '.txt' })
    expect(seg.before + seg.changed + seg.after).toBe(name)
  })

  it('空区间 → changed 为空串', () => {
    expect(sliceByRange('abc', 0, 0)).toEqual({ before: '', changed: '', after: 'abc' })
  })

  it('越界索引被钳制，不抛错', () => {
    expect(sliceByRange('abc', -5, 99)).toEqual({ before: '', changed: 'abc', after: '' })
  })
})
