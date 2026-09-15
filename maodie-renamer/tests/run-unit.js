#!/usr/bin/env node
'use strict';
/**
 * 看得见的测试 · 单测跑壳
 *
 * 为什么需要它：`node --test` 自己不会留下机器可读的结果，
 * 而报告需要「单测 x/x」这个数字。所以这里用内置测试器的 TAP 输出解析一遍，
 * 把结果写到 tests/artifacts/last-unit.json，冒烟再把它读进报告。
 *
 * 用法：
 *   node tests/run-unit.js                # 跑 tests/ 下全部 *.test.js
 *   node tests/run-unit.js tests/unit     # 只跑某个目录
 *   node tests/run-unit.js tests/a.test.js tests/b.test.js
 *
 * 不引入任何第三方框架。
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const targets = process.argv.slice(2);
const args = ['--test', '--test-reporter=tap'];
// 目标是 .ts 时自动挂 tsx（TypeScript 项目免配置；纯 JS 项目不受影响）
if (targets.some((t) => t.endsWith('.ts'))) args.push('--import', 'tsx');
if (targets.length) args.push(...targets);

console.log(`$ node ${args.join(' ')}`);
const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
const tap = `${r.stdout || ''}\n${r.stderr || ''}`;

// ── 解析 TAP ──────────────────────────────────────────────────────────
const failures = [];
let passed = 0;
const lines = tap.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const okM = line.match(/^ok\s+\d+\s+-\s+(.*)$/);
  const badM = line.match(/^not ok\s+\d+\s+-\s+(.*)$/);
  if (okM) passed++;
  if (badM) {
    // 收集这个失败块的原文（到下一个 ok / not ok 行为止）—— 原始报错要留全
    const block = [line];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^(ok|not ok)\s+\d+/.test(lines[j])) break;
      block.push(lines[j]);
    }
    failures.push({ name: badM[1].trim(), raw: block.join('\n').replace(/\s+$/, '') });
  }
}

const total = passed + failures.length;
const summary = {
  at: new Date().toISOString(),
  command: `node ${args.join(' ')}`,
  passed,
  failed: failures.length,
  total,
  failures,
  exitCode: r.status,
  rawTap: tap.length > 200000 ? `${tap.slice(0, 200000)}\n…(TAP 输出过长已截断)` : tap,
};

const outDir = path.join(root, 'tests', 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'last-unit.json'), JSON.stringify(summary, null, 2), 'utf8');

// ── 终端摘要：失败时把 TAP 原文打出来（不要包装成自己的话）──────────
if (failures.length) {
  console.log('单测失败，原始输出：');
  console.log(tap.trim());
} else {
  console.log(`单测 ${passed}/${total} 通过`);
}
console.log(`结果已写入 tests/artifacts/last-unit.json`);

if (r.error) {
  console.error('单测跑不起来（环境问题，不是"通过"）：', r.error.message);
  process.exit(1);
}
process.exit(failures.length > 0 || r.status !== 0 ? 1 : 0);
