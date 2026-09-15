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
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DETAIL_RENDER_LIMIT,
  detailRows,
  hiddenDetailText,
  visibleDetailRows,
  detectEviction,
} from '../src/shared/history-detail'
import { CLI_USAGE, isCliInvocation, parseCliArgs } from '../src/shared/cli-args'
import type { ExecuteResult, RenameEntry } from '../src/shared/types'
import { runCli } from '../src/main/cli/run'
import { initStorage } from '../src/main/services/storage'
import {
  appendTask,
  buildTask,
  clearAllTasks,
  listTasks,
  loadHistory,
} from '../src/main/services/history-store'

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

/* ══ 清空历史（IX-101 · TC-35~37）══════════════════════════════════════ */

/** 造一个最小可用的 ExecuteResult（buildTask 只读 summary，但类型要完整）*/
function fakeResult(): ExecuteResult {
  return {
    taskId: 't',
    canceled: false,
    summary: { total: 1, success: 1, skipped: 0, invalid: 0, failed: 0 },
    successExamples: [],
    problems: [],
    problemsTotal: 0,
    problemsTruncated: false,
    recordSaved: true,
    elapsedMs: 0,
  }
}

test('清空历史：记录清空、落盘为空、★ 文件本身一根汗毛都没动', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-p2c-'))
  const victim = path.join(dir, '发票 广告.txt')
  await fsp.writeFile(victim, 'x')
  const before = await fsp.stat(victim)

  initStorage(dir)
  await loadHistory()
  await appendTask(
    buildTask('t1', '2026-09-15', '删除「广告」', fakeResult(), [
      { dirPath: dir, fromName: '发票 广告.txt', toName: '发票.txt' },
    ]),
  )
  assert.equal(listTasks().length, 1, '前置：应先有一条记录')

  const cleared = await clearAllTasks()
  assert.equal(cleared, 1, '应回报清掉了 1 条')
  assert.deepEqual(listTasks(), [], '内存里应已清空')

  // 落盘也必须是空的（重新读一遍，不采信内存）
  await loadHistory()
  assert.deepEqual(listTasks(), [], '重新从磁盘读出来也应为空')

  // ★ 红线：只删记录，绝不碰文件
  const after = await fsp.stat(victim)
  assert.equal(after.mtimeMs, before.mtimeMs, '文件时间戳不许变')
  assert.deepEqual(await fsp.readdir(dir).then((l) => l.filter((x) => x.endsWith('.txt'))), ['发票 广告.txt'])

  await fsp.rm(dir, { recursive: true, force: true })
})

test('清空历史：本来就是空的时候返回 0，不炸', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-p2c-'))
  initStorage(dir)
  await loadHistory()
  assert.equal(await clearAllTasks(), 0)
  await fsp.rm(dir, { recursive: true, force: true })
})

/* ══ 命令行模式（F-15 的安全底线）══════════════════════════════════════ */

test('CLI：★ 不传 --yes 只打印不改名；带 --yes 才真改，且改名写入历史', async () => {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-cli-work-'))
  const data = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-cli-data-'))
  // 用「发票广告.txt」而不是「发票 广告.txt」：删除模式只删匹配到的文字、不会顺手 trim
  // 空格（那是引擎既定语义），夹具带空格会让断言在「发票 .txt」上失败，与本次无关。
  await fsp.writeFile(path.join(work, '发票广告.txt'), 'x')

  const logs: string[] = []
  const deps = {
    out: (s: string) => logs.push(s),
    err: (s: string) => logs.push('ERR:' + s),
    userDataDir: data,
  }

  // ① dry-run（默认）：文件一个字节都不许动
  assert.equal(await runCli(['--rename', '--dir', work, '--delete', '广告'], deps), 0)
  assert.ok(logs.join('\n').includes('dry-run'), '必须明确告诉用户「不会改动任何文件」')
  assert.deepEqual(await fsp.readdir(work), ['发票广告.txt'], 'dry-run 不许改文件')
  assert.deepEqual(listTasks(), [], 'dry-run 不许写历史')

  // ② --yes：真改
  logs.length = 0
  assert.equal(await runCli(['--rename', '--dir', work, '--delete', '广告', '--yes'], deps), 0)
  const names = await fsp.readdir(work)
  assert.ok(names.includes('发票.txt'), `应已改名，实际：${names.join(',')}`)
  assert.ok(!names.includes('发票广告.txt'))
  assert.equal(listTasks().length, 1, '★ CLI 改名必须写入历史，否则界面里撤不回来')
  assert.equal(listTasks()[0].entries[0].toName, '发票.txt')

  await fsp.rm(work, { recursive: true, force: true })
  await fsp.rm(data, { recursive: true, force: true })
})

test('CLI：参数错时退出码 2，且不碰任何文件', async () => {
  const errs: string[] = []
  const code = await runCli(['--rename', '--delete', 'x'], {
    out: () => {},
    err: (s: string) => errs.push(s),
    userDataDir: '',
  })
  assert.equal(code, 2)
  assert.ok(errs.join('\n').includes('--dir'), '要把中文原因说清楚')
})

test('CLI：目录不存在时退出码 2，并说明读不到哪个目录', async () => {
  const errs: string[] = []
  const code = await runCli(['--rename', '--dir', path.join(os.tmpdir(), 'md-not-exist-xyz'), '--delete', 'a'], {
    out: () => {},
    err: (s: string) => errs.push(s),
    userDataDir: '',
  })
  assert.equal(code, 2)
  assert.ok(errs.join('\n').includes('读不到目录'))
})
