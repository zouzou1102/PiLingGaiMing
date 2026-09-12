import { describe, expect, it } from 'vitest'
import {
  appendResolveSuffix,
  buildAvailability,
  detectConflicts,
  toSnapshotMap,
  type ConflictInput,
} from '@shared/conflicts'
import { dirKey } from '@shared/path-utils'

const DIR = 'C:\\Users\\PC\\Desktop'
const KEY = dirKey(DIR)

function snap(names: string[]) {
  return { [KEY]: names }
}

function input(id: string, fromName: string, toName: string, isDir = false): ConflictInput {
  return { id, dirPath: DIR, fromName, toName, isDir }
}

describe('conflicts · 两类冲突的判定（F-16 / DEC-05）', () => {
  it('U-02 批次内两项撞名 → 两项都判 batch，都不执行', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', '报告.docx'), input('2', 'b.txt', '报告.docx')],
      toSnapshotMap(snap(['a.txt', 'b.txt'])),
      false,
    )
    expect(out.map((o) => o.result.kind)).toEqual(['none', 'batch'])
    // 关键：第一项即使判 none，也不代表第二项会被「覆盖」——
    // 执行侧会把它跳过，绝不覆盖
    expect(out[1].resolvedName).toBeUndefined()
  })

  it('U-11 磁盘已有 报告.docx 时，自动加序号依次得 _1、_2，且都与现存名不冲突', () => {
    const available = ['报告.docx', 'a.txt', 'b.txt']
    const out = detectConflicts(
      [input('1', 'a.txt', '报告.docx'), input('2', 'b.txt', '报告.docx')],
      toSnapshotMap(snap(available)),
      true,
    )
    expect(out[0].result.kind).toBe('none')
    expect(out[0].resolvedName).toBe('报告_1.docx')
    expect(out[1].result.kind).toBe('none')
    expect(out[1].resolvedName).toBe('报告_2.docx')

    // 断言「与现存名不冲突」
    for (const o of out) {
      const name = o.resolvedName!
      expect(available.map((n) => n.toLowerCase())).not.toContain(name.toLowerCase())
    }
  })

  it('自动加序号对无扩展名与文件夹同样正确（_1 落在扩展名之前）', () => {
    expect(appendResolveSuffix('报告.docx', 1, false)).toBe('报告_1.docx')
    expect(appendResolveSuffix('说明', 1, false)).toBe('说明_1')
    expect(appendResolveSuffix('我的文件夹.2026', 2, true)).toBe('我的文件夹.2026_2')
    expect(appendResolveSuffix('.gitignore', 3, false)).toBe('.gitignore_3')
  })

  it('自动加序号 99 次仍冲突 → 退回 skip 并给出错误码，不产生 resolvedName', () => {
    const taken = ['报告.docx', ...Array.from({ length: 99 }, (_, i) => `报告_${i + 1}.docx`)]
    const out = detectConflicts(
      [input('1', 'a.txt', '报告.docx')],
      toSnapshotMap(snap(taken)),
      true,
    )
    expect(out[0].resolvedName).toBeUndefined()
    expect(out[0].result.kind).toBe('disk')
    expect(out[0].code).toBe('E_CONFLICT_DISK')
  })

  it('磁盘冲突默认跳过（autoResolve=false），且带出撞上的名字', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', '报告.docx')],
      toSnapshotMap(snap(['a.txt', '报告.docx'])),
      false,
    )
    expect(out[0].result).toEqual({ kind: 'disk', conflictWith: '报告.docx' })
  })

  it('名字完全相同 → self（无变化），不计为冲突', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', 'a.txt'), input('2', 'a.txt', 'A.TXT')],
      toSnapshotMap(snap(['a.txt'])),
      false,
    )
    expect(out[0].result.kind).toBe('self')
    expect(out[1].result.kind).toBe('case-only')
  })

  it('仅大小写不同 → case-only，不算冲突（强制走两阶段执行）', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', 'A.txt')],
      toSnapshotMap(snap(['a.txt'])),
      false,
    )
    expect(out[0].result.kind).toBe('case-only')
    expect(out[0].resolvedName).toBeUndefined()
  })

  it('case-only 的目标名也占用「已分配」名额，避免与后续项真实撞名', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', 'A.txt'), input('2', 'c.txt', 'a.TXT')],
      toSnapshotMap(snap(['a.txt', 'c.txt'])),
      false,
    )
    expect(out[0].result.kind).toBe('case-only')
    expect(out[1].result.kind).toBe('batch')
  })
})

describe('conflicts · U-15 目录快照必须剔除「会腾空」的源名称', () => {
  it('U-15 A→C、B→A 不误判为磁盘冲突', () => {
    // 目录 D 下现有 A.txt, B.txt；本批 A.txt → C.txt, B.txt → A.txt
    const out = detectConflicts(
      [input('1', 'A.txt', 'C.txt'), input('2', 'B.txt', 'A.txt')],
      toSnapshotMap(snap(['A.txt', 'B.txt'])),
      false,
    )
    expect(out.map((o) => o.result.kind)).toEqual(['none', 'none'])
  })

  it('不剔除源名称时会误判 —— 用「不剔除」的可用集合反证上一条', () => {
    // 手工构造「未剔除」的可用集合：A.txt 仍在
    const availability = buildAvailability(toSnapshotMap(snap(['A.txt', 'B.txt'])), [])
    expect(availability.names.get(KEY)!.has('a.txt')).toBe(true)

    // 被剔除后（两个源名都会腾空）
    const after = buildAvailability(toSnapshotMap(snap(['A.txt', 'B.txt'])), [
      { dirPath: DIR, fromName: 'A.txt', toName: 'C.txt' },
      { dirPath: DIR, fromName: 'B.txt', toName: 'A.txt' },
    ])
    expect(after.names.get(KEY)!.size).toBe(0)
  })

  it('★ 名字没变的项不算「腾空」——否则会漏判真实冲突', () => {
    // 批次：a.txt → a.txt（无变化，位置仍被占用） 与  b.txt → a.txt
    const out = detectConflicts(
      [input('1', 'a.txt', 'a.txt'), input('2', 'b.txt', 'a.txt')],
      toSnapshotMap(snap(['a.txt', 'b.txt'])),
      false,
    )
    // a.txt 不会腾空 → b.txt 改成 a.txt 就是真的撞上磁盘已有文件
    expect(out[1].result.kind).toBe('disk')
  })

  it('跨目录互不影响：同名目标在不同目录不算冲突', () => {
    const other = 'D:\\另一个目录'
    const snapshot = { [KEY]: ['a.txt'], [dirKey(other)]: ['b.txt'] }
    const out = detectConflicts(
      [
        input('1', 'a.txt', '同名.txt'),
        { id: '2', dirPath: other, fromName: 'b.txt', toName: '同名.txt', isDir: false },
      ],
      toSnapshotMap(snapshot),
      false,
    )
    expect(out.map((o) => o.result.kind)).toEqual(['none', 'none'])
  })

  it('被跳过项不占用「已分配」名额，不污染后续判定', () => {
    // 1 与 2 都想改成 报告.docx，但 报告.docx 已在磁盘上
    // → 两项都跳过；此时第三项改成 报告.docx 也应判为 disk（而不是继承 batch）
    const out = detectConflicts(
      [
        input('1', 'a.txt', '报告.docx'),
        input('2', 'b.txt', '报告.docx'),
        input('3', 'c.txt', '报告.docx'),
      ],
      toSnapshotMap(snap(['a.txt', 'b.txt', 'c.txt', '报告.docx'])),
      false,
    )
    expect(out.map((o) => o.result.kind)).toEqual(['disk', 'disk', 'disk'])
  })

  it('目录不存在于快照中时不报错（按「无现存文件」处理）', () => {
    const out = detectConflicts(
      [input('1', 'a.txt', 'b.txt')],
      toSnapshotMap({}),
      false,
    )
    expect(out[0].result.kind).toBe('none')
  })
})
