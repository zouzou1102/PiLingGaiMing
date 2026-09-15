'use strict';
/**
 * 看得见的测试 · 报告生成器
 *
 * result.json（内存对象）→ 自包含 report.html
 * 只依赖 node 内置模块。不联网、不引第三方库、不需要图形库（缩略图由 helpers.shot 用
 * Electron 的 nativeImage 生成，这里只负责内嵌成 base64）。
 *
 * 报告的用途是"让人一眼看懂这次到底跑通了什么"：
 *   ① 一句话结论 + 汇总条
 *   ② 一步一张卡片：操作 → 截图 → 断言明细 → 原始报错
 *   ③ 兜底监听抓到的原始信息
 *   ④ 修复循环轮次时间线（若存在 round-N.json）
 *   ⑤ 「本次没验到的」—— 这一栏不允许空着
 */

const fs = require('node:fs');
const path = require('node:path');

const esc = (s) =>
  String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const show = (v) => {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

function dataUrl(file) {
  try {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 优先内嵌缩略图（小，自包含）；没有缩略图时退回全尺寸 PNG。 */
function shotOf(s, outDir) {
  if (!s) return null;
  const candidates = [s.thumb, s.full, path.join(outDir, s.name || '')].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const url = dataUrl(c);
      if (url) return { url, file: path.basename(c) };
    }
  }
  return null;
}

/** 顶部"功能清单"：这次一共验了哪些功能，一眼看全。 */
function featureTable(result) {
  const steps = result.steps || [];
  if (!steps.length) return '';
  return (
    `<section class="panel"><h2>这次验了哪些功能</h2><table class="feats"><tbody>` +
    steps
      .map(
        (s) => `<tr class="${s.pass ? '' : 'bad'}">
          <td class="mk">${s.pass ? '✅' : '❌'}</td>
          <td class="fn">${esc(s.name)}</td>
          <td class="fc">${esc((s.asserts || []).length)} 条断言</td>
          <td class="fe">${esc(
            s.pass
              ? ''
              : (s.asserts || []).filter((a) => !a.pass).map((a) => a.label).join('；') || '执行中断'
          )}</td>
        </tr>`
      )
      .join('') +
    `</tbody></table></section>`
  );
}

function readRounds(outDir) {
  try {
    return fs
      .readdirSync(outDir)
      .filter((f) => /^round-\d+\.json$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── 各区块 ─────────────────────────────────────────────────────────────

function chips(result) {
  const u = result.unit;
  const s = result.summary || {};
  const safety = result.safety || {};
  const dur =
    result.startedAt && result.finishedAt
      ? `${((new Date(result.finishedAt) - new Date(result.startedAt)) / 1000).toFixed(1)}s`
      : '—';
  const items = [
    u
      ? { label: '单测', value: `${u.passed}/${u.total}`, ok: u.passed === u.total }
      : { label: '单测', value: '未跑', ok: null },
    {
      label: '冒烟',
      value: `${s.smokePassed ?? 0}/${s.smokeTotal ?? 0}`,
      ok: (s.smokePassed ?? 0) === (s.smokeTotal ?? 0) && (s.smokeTotal ?? 0) > 0,
    },
    { label: '耗时', value: dur, ok: null },
    {
      label: 'console 报错',
      value: String((safety.consoleErrors || []).length),
      ok: (safety.consoleErrors || []).length === 0,
    },
    {
      label: '资源加载失败',
      value: String((safety.resourceErrors || []).length),
      ok: (safety.resourceErrors || []).length === 0,
    },
    {
      label: '硬错误',
      value: String((safety.hardErrors || []).length),
      ok: (safety.hardErrors || []).length === 0,
    },
  ];
  return items
    .map(
      (i) =>
        `<div class="chip ${i.ok === true ? 'ok' : i.ok === false ? 'bad' : ''}">
           <span class="chip__k">${esc(i.label)}</span>
           <span class="chip__v">${esc(i.value)}</span>
         </div>`
    )
    .join('');
}

function stepCard(step, outDir) {
  const before = shotOf(step.shotBefore, outDir);
  const after = shotOf(step.shotAfter, outDir);
  const asserts = (step.asserts || [])
    .map(
      (a) => `
      <tr class="${a.pass ? '' : 'bad'}">
        <td class="mk">${a.pass ? '✅' : '❌'}</td>
        <td>${esc(a.label)}</td>
        <td><code>${esc(show(a.expected))}</code></td>
        <td><code>${esc(show(a.actual))}</code></td>
      </tr>
      ${a.detail ? `<tr class="det"><td></td><td colspan="3" class="detv">${esc(a.detail)}</td></tr>` : ''}
      ${a.raw ? `<tr class="raw"><td></td><td colspan="3"><pre>${esc(a.raw)}</pre></td></tr>` : ''}`
    )
    .join('');

  const ops = step.ops && step.ops.length
    ? `<ol class="ops">${step.ops
        .map((o) => `<li><span class="opk">${o.kind.startsWith('see') || o.kind === 'notSee' ? '看' : '做'}</span>${esc(o.label)}</li>`)
        .join('')}</ol>`
    : '';

  return `
  <section class="step ${step.pass ? 'pass' : 'fail'}">
    <header>
      <span class="idx">${esc(step.index)}</span>
      <h3>${esc(step.name)}</h3>
      <span class="badge ${step.pass ? 'ok' : 'bad'}">${step.pass ? '通过' : '失败'}</span>
    </header>
    ${ops}
    ${before || after ? `<div class="pair">${[
      { s: before, cap: '操作前' },
      { s: after, cap: '操作后' },
    ]
      .filter((x) => x.s)
      .map(
        (x) => `<figure><img src="${x.s.url}" alt="${esc(step.name)} ${x.cap}"><figcaption>${x.cap} · ${esc(x.s.file)}</figcaption></figure>`
      )
      .join('')}</div>` : ''}
    ${step.shotError ? `<p class="note">⚠️ ${esc(step.shotError)}（这一步的判定不受影响，但缺少视觉证据）</p>` : ''}
    ${asserts ? `<table class="asserts"><thead><tr><th></th><th>断言</th><th>期望</th><th>实际</th></tr></thead><tbody>${asserts}</tbody></table>` : ''}
    ${step.note ? `<p class="note">${esc(step.note)}</p>` : ''}
    ${step.raw ? `<div class="rawbox"><div class="rawbox__t">原始报错</div><pre>${esc(step.raw)}</pre></div>` : ''}
  </section>`;
}

function safetyBlock(result) {
  // ★ "没采集到" 不等于 "没有报错"。少了这一段就会把「漏采集」显示成绿色 ✅ —— 那是假绿。
  if (!result.safety) {
    return `<section class="panel warn-panel"><h2>兜底监听</h2>
      <p class="warn">⚠️ 这份报告里没有兜底监听数据（console 报错 / 资源加载失败 / 预加载报错 /
      进程崩溃都没被采集）。<b>这不等于"没有报错"</b> —— 请确认冒烟是用 helpers 的
      <code>finish()</code> 正常收尾的，而不是中途被杀掉或直接调了 writeReport。</p></section>`;
  }
  const s = result.safety;
  const rows = [];
  const add = (title, arr, fmt) => {
    if (!arr || !arr.length) return;
    rows.push(
      `<div class="safety__group"><h4>${esc(title)} <span class="cnt">${arr.length}</span></h4><ul>` +
        arr.map((x) => `<li><pre>${esc(fmt(x))}</pre></li>`).join('') +
        `</ul></div>`
    );
  };
  add('硬错误（预加载 / 进程崩溃 / 无响应 / 加载失败）', s.hardErrors, (x) => `[${x.kind}] ${x.raw}`);
  add('console 报错', s.consoleErrors, (x) => x.raw);
  add('未捕获异常 / unhandledrejection', s.unhandled, (x) => x);
  add('资源加载失败', s.resourceErrors, (x) => `${x.tag} ${x.url}`);
  add('console 警告', s.consoleWarnings, (x) => x.raw);
  if (!rows.length) return `<section class="panel"><h2>兜底监听</h2><p class="empty-ok">没有捕获到任何报错。✅</p></section>`;
  return `<section class="panel bad-panel"><h2>兜底监听（原始信息）</h2>${rows.join('')}</section>`;
}

function roundsBlock(outDir) {
  const rounds = readRounds(outDir);
  if (!rounds.length) return '';
  return (
    `<section class="panel"><h2>修复循环</h2><div class="rounds">` +
    rounds
      .map(
        (r) => `
      <div class="round">
        <div class="round__h">第 ${esc(r.round)} 轮 · ${esc((r.at || '').replace('T', ' ').slice(0, 19))}
          <span class="badge ${r.failures && r.failures.length ? 'bad' : 'ok'}">
            ${r.failures && r.failures.length ? `剩 ${r.failures.length} 项失败` : '全绿'}
          </span>
        </div>
        ${r.hypothesis ? `<p><b>判断：</b>${esc(r.hypothesis)}</p>` : ''}
        ${r.changed && r.changed.length ? `<p><b>改了什么：</b></p><ul>${r.changed.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>` : ''}
        ${r.verifiedHow ? `<p><b>怎么验的：</b>${esc(r.verifiedHow)}</p>` : ''}
        ${(r.failures || [])
          .map((f) => `<div class="rawbox"><div class="rawbox__t">${esc(f.step)}</div><pre>${esc(f.rawError || f.signature)}</pre></div>`)
          .join('')}
      </div>`
      )
      .join('') +
    `</div></section>`
  );
}

function notVerifiedBlock(result) {
  const list = result.notVerified || [];
  if (!list.length) {
    return `<section class="panel warn-panel">
      <h2>本次没验到的</h2>
      <p class="warn">⚠️ 这一栏是空的。按交付纪律，必须显式写出没验到的部分
      （打包后的产物 / 真机 / 视觉观感 / 磁盘异常 / 时序竞态…），不许留空。</p>
    </section>`;
  }
  return `<section class="panel"><h2>本次没验到的</h2><ul class="nv">${list
    .map((x) => `<li>${esc(x)}</li>`)
    .join('')}</ul></section>`;
}

// ── 模板 ──────────────────────────────────────────────────────────────

const CSS = `
:root{
  --bg:#0f1115; --panel:#171a21; --panel2:#1d2129; --bd:#282e3a; --bd2:#333b49;
  --fg:#e6e9ef; --mut:#98a1b3; --pass:#3ecf8e; --fail:#ff5c5c; --warn:#f5a623; --acc:#6aa8ff;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:14px/1.65 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1020px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:22px;margin:0 0 6px}
h2{font-size:15px;margin:0 0 14px;color:var(--mut);font-weight:600;letter-spacing:.04em}
h3{font-size:15px;margin:0;flex:1}
.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.verdict{font-size:19px;font-weight:700}
.verdict.ok{color:var(--pass)} .verdict.bad{color:var(--fail)}
.meta{color:var(--mut);font-size:12px;margin-top:4px;word-break:break-all}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 26px}
.chip{background:var(--panel);border:1px solid var(--bd);border-radius:10px;
  padding:8px 12px;display:flex;gap:8px;align-items:baseline;min-width:104px}
.chip.ok{border-color:rgba(62,207,142,.45)} .chip.bad{border-color:rgba(255,92,92,.5)}
.chip__k{color:var(--mut);font-size:12px}
.chip__v{font-weight:700;font-size:15px}
.chip.ok .chip__v{color:var(--pass)} .chip.bad .chip__v{color:var(--fail)}
.panel{background:var(--panel);border:1px solid var(--bd);border-radius:14px;
  padding:18px;margin:0 0 18px}
.bad-panel{border-color:rgba(255,92,92,.4)} .warn-panel{border-color:rgba(245,166,35,.45)}
.step{background:var(--panel);border:1px solid var(--bd);border-left-width:3px;
  border-radius:14px;padding:16px 18px;margin:0 0 14px}
.step.pass{border-left-color:var(--pass)} .step.fail{border-left-color:var(--fail)}
.step header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.idx{width:24px;height:24px;border-radius:50%;background:var(--panel2);border:1px solid var(--bd2);
  display:grid;place-items:center;font-size:12px;color:var(--mut);flex:none}
.badge{font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid var(--bd2);color:var(--mut);flex:none}
.badge.ok{color:var(--pass);border-color:rgba(62,207,142,.5);background:rgba(62,207,142,.08)}
.badge.bad{color:var(--fail);border-color:rgba(255,92,92,.5);background:rgba(255,92,92,.08)}
figure{margin:0 0 12px}
img{max-width:100%;border-radius:10px;border:1px solid var(--bd2);display:block}
figcaption{color:var(--mut);font-size:11px;margin-top:5px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 12px}
.pair figure{margin:0}
@media (max-width:640px){.pair{grid-template-columns:1fr}}
.ops{margin:0 0 14px;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.ops li{font-size:13px;color:var(--mut)}
.opk{display:inline-block;min-width:22px;margin-right:8px;font-size:11px;color:var(--acc);
  border:1px solid var(--bd2);border-radius:5px;text-align:center;padding:0 4px}
table.feats{width:100%;border-collapse:collapse;font-size:13px}
table.feats td{padding:6px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
table.feats tr.bad{background:rgba(255,92,92,.07)}
table.feats td.fn{font-weight:600}
table.feats td.fc,table.feats td.fe{color:var(--mut);font-size:12px}
table.feats td.mk{width:26px}
table.asserts{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}
table.asserts th{text-align:left;color:var(--mut);font-weight:500;font-size:12px;
  border-bottom:1px solid var(--bd);padding:6px 8px}
table.asserts td{padding:6px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
table.asserts tr.bad td{background:rgba(255,92,92,.07)}
table.asserts tr.raw td{border-bottom:1px solid var(--bd);padding-top:0}
table.asserts tr.det td{border-bottom:1px solid var(--bd);padding-top:0;padding-bottom:6px}
.detv{color:var(--mut);font-size:12px}
td.mk{width:26px}
code{background:var(--panel2);border:1px solid var(--bd);border-radius:6px;
  padding:1px 6px;font:12px/1.5 ui-monospace,Consolas,monospace;word-break:break-all}
pre{margin:0;background:#0b0d11;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;
  overflow-x:auto;font:12px/1.6 ui-monospace,Consolas,monospace;color:#ffd7d7;white-space:pre-wrap;word-break:break-word}
.rawbox{margin-top:12px}
.rawbox__t{color:var(--fail);font-size:12px;margin-bottom:6px}
.note{color:var(--warn);font-size:13px}
.empty-ok{color:var(--pass)}
.warn{color:var(--warn)}
.nv{margin:0;padding-left:20px} .nv li{margin:4px 0}
.safety__group{margin-bottom:14px}
.safety__group h4{margin:0 0 8px;font-size:13px;color:var(--fail)}
.safety__group .cnt{color:var(--mut);font-weight:400}
.safety__group ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rounds{display:flex;flex-direction:column;gap:14px}
.round{background:var(--panel2);border:1px solid var(--bd);border-radius:12px;padding:14px}
.round__h{display:flex;align-items:center;gap:10px;font-weight:600;margin-bottom:8px}
.round p{margin:6px 0}
footer{color:var(--mut);font-size:12px;text-align:center;margin-top:28px}
`;

function render(result, outDir) {
  const s = result.summary || {};
  const allPass =
    (s.failed ?? 1) === 0 &&
    (!result.unit || result.unit.passed === result.unit.total) &&
    (result.safety ? (result.safety.hardErrors || []).length === 0 : true);

  const unitLine = result.unit
    ? `单测 ${result.unit.passed}/${result.unit.total}${result.unit.total - result.unit.passed ? `（${result.unit.total - result.unit.passed} 条失败）` : ''}`
    : '单测 未跑';
  const speed = result.summary && result.summary.fast
    ? '全速'
    : result.summary && result.summary.slow
      ? `慢速 ${result.summary.slow}ms/步`
      : '—';

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>测试报告 ${esc(result.runId || '')}</title>
<style>${CSS}</style></head>
<body><div class="wrap">

  <div class="top">
    <h1>看得见的测试 · 报告</h1>
    <span class="verdict ${allPass ? 'ok' : 'bad'}">
      ${allPass ? '全部通过' : '有未通过项'}
    </span>
  </div>
  <div class="meta">
    运行编号 ${esc(result.runId || '—')} ·
    命令 <code>${esc(result.command || '—')}</code> ·
    提交 <code>${esc(result.gitHead || '—')}</code> ·
    速度 ${esc(speed)}<br>
    开始 ${esc((result.startedAt || '').replace('T', ' ').slice(0, 19))} ·
    结束 ${esc((result.finishedAt || '').replace('T', ' ').slice(0, 19))} ·
    ${esc(unitLine)}
  </div>

  <div class="chips">${chips(result)}</div>

  ${result.fatal ? `<section class="panel bad-panel"><h2>致命错误（流程中断）</h2><div class="rawbox"><pre>${esc(result.fatal)}</pre></div></section>` : ''}

  ${featureTable(result)}

  <h2 style="margin-top:8px">逐功能明细（${esc((result.steps || []).length)} 个）</h2>
  ${(result.steps || []).map((st) => stepCard(st, outDir)).join('') || '<p class="warn">没有执行任何功能检查。</p>'}

  ${safetyBlock(result)}
  ${roundsBlock(outDir)}
  ${notVerifiedBlock(result)}

  <footer>由「看得见的测试」生成 · 全尺寸截图见本目录下的 .png 文件</footer>
</div></body></html>`;
}

/**
 * 写报告。返回 report.html 的绝对路径。
 * @param {string} outDir  产物目录（tests/artifacts/<runId>）
 * @param {object} result  结果对象
 */
function writeReport(outDir, result) {
  fs.mkdirSync(outDir, { recursive: true });
  // 顺手存档原始 JSON：报告是给人的，JSON 是给后续 diff / 轮次对比用的
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
  const html = render(result, outDir);
  const file = path.join(outDir, 'report.html');
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

module.exports = { writeReport, render };
