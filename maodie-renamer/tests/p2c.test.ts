/**
 * P2-C（历史完整版 + 命令行入口）—— 共享层与存储层的单测。
 *
 * 运行：`npm run test:core`
 *   = `node tests/run-unit.js tests/p1-rules.test.ts tests/p2a-theme.test.ts tests/p2c.test.ts`
 *
 * 规矩同 P1 / P2-A：不引入第三方框架，只用 `node:test` + `node:assert`。
 *
 * 本文件里最值钱的两条：
 *   1. **清空后淘汰检测不误报**（设计 §2.6）—— 这是本批最容易漏的一条，
 *      因为「用户主动清空」与「系统淘汰」在列表形状上完全一样。
 *   2. **命令行默认只读**（F-15 安全底线）—— 不传 --yes 绝不许碰文件。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  DETAIL_RENDER_LIMIT,
  detailRows,
  hiddenDetailText,
  visibleDetailRows,
  detectEviction,
} from '../src/shared/history-detail'
import { CLI_USAGE, isCliInvocation, parseCliArgs } from '../src/shared/cli-args'
import type { RenameEntry } from '../src/shared/types'

/* ── 定位工程根目录（与 p2a-theme.test.ts 同一约定）────────────────── */
const ROOT = process.cwd()
assert.ok(
  fs.existsSync(path.join(ROOT, 'package.json')),
  `单测必须在工程根目录下运行（当前 cwd = ${ROOT}）—— 用 npm run test:core`,
)

function entries(n: number): RenameEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    dirPath: 'D:/x',
    fromName: `广告 f${i}.txt`,
    toName: `f${i}.txt`,
  }))
}

/* ══ 明细（EL-112）══════════════════════════════════════════════════════ */

test('明细：序号从 1 开始，逐条是「原名 → 新名」', () => {
  const rows = detailRows(entries(3))
  assert.deepEqual(rows, [
    { index: 1, fromName: '广告 f0.txt', toName: 'f0.txt' },
    { index: 2, fromName: '广告 f1.txt', toName: 'f1.txt' },
    { index: 3, fromName: '广告 f2.txt', toName: 'f2.txt' },
  ])
})

test('明细：超过 100 条只渲染前 100，并给出「还有 N 项未显示」', () => {
  const v = visibleDetailRows(entries(5000))
  assert.equal(v.rows.length, DETAIL_RENDER_LIMIT)
  assert.equal(DETAIL_RENDER_LIMIT, 100)
  assert.equal(v.hidden, 4900)
  assert.equal(v.total, 5000)
  assert.equal(v.rows[0].index, 1)
  assert.equal(v.rows[99].index, 100)
  assert.equal(hiddenDetailText(v.hidden, v.total), '还有 4900 项未显示（共 5000 项）')
})

test('明细：正好 100 条时不出现「还有 N 项」', () => {
  const v = visibleDetailRows(entries(100))
  assert.equal(v.rows.length, 100)
  assert.equal(v.hidden, 0)
})

test('明细：空列表不炸', () => {
  const v = visibleDetailRows([])
  assert.deepEqual(v, { rows: [], hidden: 0, total: 0 })
})

/* ══ 淘汰检测（DEC-09，P2-C §2.6 的假警报）══════════════════════════════ */

test('淘汰检测：★ 用户主动清空不算淘汰（不许弹「较旧的记录已被清理」）', () => {
  const two = [{ id: 'a' }, { id: 'b' }]
  assert.equal(detectEviction(null, 0, two), 0, '首次加载不报')
  assert.equal(detectEviction('b', 2, two), 0, '正常刷新不报')
  assert.equal(detectEviction('b', 2, []), 0, '★ 清空：必须不报')
  assert.equal(detectEviction('b', 2, [{ id: 'a' }]), 1, '真淘汰：要报')
  assert.equal(
    detectEviction('b', 2, [{ id: 'a' }, { id: 'c' }, { id: 'd' }]),
    0,
    '总数变多 = 正常追加，不报（注意长度必须真的变大，否则「最旧变了 + 总数没变多」就是淘汰）',
  )
})

/* ══ 命令行参数解析（F-15）══════════════════════════════════════════════ */

test('CLI：只有出现已知开关才算命令行模式（不吞 Electron 自己的参数）', () => {
  assert.equal(isCliInvocation(['--rename', '--dir', 'D:/x']), true)
  assert.equal(isCliInvocation(['--dir', 'D:/x']), true, '缺 --rename 也要进 CLI 才能报错')
  assert.equal(isCliInvocation(['--inspect=5858']), false)
  assert.equal(isCliInvocation(['--remote-debugging-port=9222']), false)
  assert.equal(isCliInvocation([]), false)
})

test('CLI：--delete 落到 delete 模式与 rule.delete.text', () => {
  const r = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', '广告'])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.options.rule.mode, 'delete')
    assert.equal(r.options.rule.delete.text, '广告')
    assert.equal(r.options.dir, 'D:/x')
    assert.equal(r.options.yes, false, '默认必须是只读')
  }
})

test('CLI：--replace 取两个值，落到 replace.find / replace.to', () => {
  const r = parseCliArgs(['--rename', '--dir', 'D:/x', '--replace', '广告', '推广'])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.options.rule.mode, 'replace')
    assert.equal(r.options.rule.replace.find, '广告')
    assert.equal(r.options.rule.replace.to, '推广')
  }
})

test('CLI：--regex / 大小写 / --auto-seq / --case-sensitive 都落到 RuleConfig', () => {
  const r = parseCliArgs([
    '--rename', '--dir', 'D:/x', '--delete', 'a',
    '--regex', '--upper', '--auto-seq', '--case-sensitive',
  ])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.options.rule.regexEnabled, true)
    assert.equal(r.options.rule.caseTransform, 'upper')
    assert.equal(r.options.autoSeq, true)
    assert.equal(r.options.caseSensitive, true)
    assert.equal(r.options.rule.caseSensitive, true)
  }
})

test('CLI：三种规则互斥', () => {
  const a = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--replace', 'a', 'b'])
  assert.equal(a.ok, false)
  const b = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--prefix', 'x'])
  assert.equal(b.ok, false)
})

test('CLI：--yes 与 --dry-run 不能同时给（避免脚本里静默什么都没做）', () => {
  const r = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--yes', '--dry-run'])
  assert.equal(r.ok, false)
  if (r.ok === false) assert.match(r.error, /dry-run/)
})

test('CLI：缺 --dir / 缺规则 / 未知参数 / 缺值 都要报错', () => {
  const a = parseCliArgs(['--rename', '--delete', 'a'])
  assert.equal(a.ok, false)
  if (a.ok === false) assert.match(a.error, /--dir/)

  const b = parseCliArgs(['--rename', '--dir', 'D:/x'])
  assert.equal(b.ok, false)
  if (b.ok === false) assert.match(b.error, /规则/)

  const c = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--nonsense'])
  assert.equal(c.ok, false)

  const d = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete'])
  assert.equal(d.ok, false, '--delete 后面没值必须报错，不能当成空串')
})

test('CLI：--date-format 只收三个合法值', () => {
  const ok = parseCliArgs(['--rename', '--dir', 'D:/x', '--date', '--date-format', 'YYYYMMDD'])
  assert.equal(ok.ok, true)
  const bad = parseCliArgs(['--rename', '--dir', 'D:/x', '--date', '--date-format', 'yyyy/mm/dd'])
  assert.equal(bad.ok, false)
})

test('CLI：用法文本里必须写明「不传 --yes 只打印」与「默认不覆盖」两条底线', () => {
  assert.match(CLI_USAGE, /--yes/)
  assert.match(CLI_USAGE, /dry-run/)
  assert.match(CLI_USAGE, /不覆盖/)
})
