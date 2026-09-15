'use strict';
/**
 * 耄耋改名 · 冒烟驱动器（技能「看得见的测试」）
 *
 * 运行：electron tools/smoke.js      （先 npm run build，测的是 out/ 产物）
 * 你会看到：窗口自己弹出来、自己点、一步一步走给你看。
 * 跑完：窗口停留一下 → 关闭 → tests/artifacts/<时间戳>/report.html
 *
 * 顺序不能换：
 *   ① 隔离：把 userData / appData / 样本副本 指到临时目录（必须在加载被测主进程之前）
 *   ② 加载真实主进程入口，钩住它创建的窗口，并把窗口显示出来
 *   ③ 按"功能清单"逐个跑，然后出报告
 *
 * 它**不修改生产代码**：测试光标、横幅、资源监听、对话框 stub 全部运行时注入。
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;

// ── 你只改这三行 ──────────────────────────────────────────────────────
const APP_ENTRY = process.env.SMOKE_APP_ENTRY || path.resolve(__dirname, '..', 'out', 'main', 'index.js'); // 被测主进程入口（相对项目根）
const READY_SELECTOR = '#app';      // 界面"就绪"的可见元素
const WINDOW_TITLE = null;          // 期望的窗口标题；null = 不检查
// ─────────────────────────────────────────────────────────────────────

const S = require(path.join(__dirname, '..', 'tests', 'smoke', 'helpers.js'));
const { writeReport } = require(path.join(__dirname, '..', 'tests', 'smoke', 'report.js'));
const { feature } = S; // 骨架 runner.js 里 feature 是裸调用，这里补上

// ── ① 隔离：一定要在 require 被测主进程之前 ───────────────────────────
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(__dirname, '..', 'tests', 'artifacts', runId);
fs.mkdirSync(outDir, { recursive: true });

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
app.setPath('userData', path.join(tmpRoot, 'userData'));
app.setPath('sessionData', path.join(tmpRoot, 'userData'));
// ★★ 本项目关键适配 ★★ 应用自身在 src/main/index.ts 主动执行：
//   app.setPath('userData', join(app.getPath('appData'), 'MaoDieRenamer'))
// 它会**覆盖**上面那行临时 userData。所以必须把 appData 也指到临时目录。
app.setPath('appData', tmpRoot);
process.env.APP_DATA_DIR = path.join(tmpRoot, 'data');
fs.mkdirSync(process.env.APP_DATA_DIR, { recursive: true });
if (process.env.CI) app.commandLine.appendSwitch('disable-gpu');

// 真实数据目录（用于"没碰真实数据"核验）
const REAL_DATA_DIR = process.env.REAL_DATA_DIR
  || path.join(process.env.APPDATA || '', 'MaoDieRenamer');
const realBefore = S.fingerprint(REAL_DATA_DIR);

// ── 样本：把桌面测试文件**复制**到临时目录，改名只会动副本，绝不碰原件 ──
const SAMPLE_SRC = process.env.SMOKE_SAMPLE_DIR || 'C:\\Users\\PC\\Desktop\\测试文件';
const sampleDir = path.join(tmpRoot, 'samples');
try {
  fs.cpSync(SAMPLE_SRC, sampleDir, { recursive: true });
} catch (err) {
  console.warn('⚠️ 复制样本失败（将影响"入列"相关功能）：', err.message);
}
const sampleFiles = [];
const sampleDirs = [];
(function walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { sampleDirs.push(p); walk(p); } else { sampleFiles.push(p); }
  }
})(sampleDir);
console.log(`样本副本：${sampleFiles.length} 个文件 / ${sampleDirs.length} 个文件夹（源：${SAMPLE_SRC}）`);

// ── 原生对话框 stub（仅运行时替换；不动生产代码）──────────────────────
// 说明：系统原生对话框是 OS 组件，sendInputEvent 驱动不了。这里让「添加文件/文件夹」
// 返回临时副本路径，从而真实走通"点击 → 入列 → 预览"的链路。报告里会标注这一代价。
// 注：此处不保留原生 showOpenDialog 引用——冒烟进程用完即退，无需还原，留引用反而是死代码。
dialog.showOpenDialog = async (_win, opts) => {
  const isDir = Array.isArray(opts && opts.properties) && opts.properties.includes('openDirectory');
  return { canceled: false, filePaths: isDir ? sampleDirs.slice(0, 3) : sampleFiles.slice(0, 5) };
};

// ── ② 先装窗口钩子，再加载被测应用 ───────────────────────────────────
const created = [];
app.on('browser-window-created', (_e, win) => created.push(win));

let mainErr = null;
try {
  require(APP_ENTRY);
} catch (err) {
  mainErr = err;
}

const result = {
  runId,
  command: 'electron tools/smoke.js',
  startedAt: new Date().toISOString(),
  appEntry: APP_ENTRY,
  gitHead: gitHead(),
  tmpRoot,
  realDataDir: REAL_DATA_DIR,
  sample: { src: SAMPLE_SRC, files: sampleFiles.length, dirs: sampleDirs.length },
  steps: [],
  notVerified: [],
};

// ─────────────────────────────────────────────────────────────────────
// ③ 功能清单 —— 要验哪些功能，一个功能一行
//   做： click / dblclick / hover / drag / type / key / scroll / wait / waitUntil
//   看： see / notSee / seeText / seeCount / seeStyle / seeAttr
//   c.see* 读的都是**渲染后的真实结果**，不是"某个 class 加没加上"。
// ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  feature('窗口出现、界面就绪', (c) =>
    c.see(READY_SELECTOR, `界面就绪元素可见（${READY_SELECTOR}）`)
  ),

  feature('空列表：空态引导可见', (c) =>
    c.see('.md-empty', '空态引导卡可见（且有尺寸、在视口内）')
     .seeText('.md-empty__title', '把文件拖进来，或者点左边的按钮', '空态文案正确')
  ),

  feature('空列表：计数为 0 且"开始改名"置灰', (c) =>
    c.seeText('.md-filelist__count', '共 0 项', '列表计数显示 0')
     .seeCount('.md-actionbar .md-btn--primary:disabled', 1, '"开始改名"按钮处于禁用态')
  ),

  feature('空列表："清空列表"置灰', (c) =>
    c.seeCount('.md-actionpanel .md-btn--ghost:disabled', 1, '"清空列表"按钮处于禁用态')
  ),

  feature('切到"规则化"页签生效', (c) =>
    c.click('.md-tabs .md-tab:nth-child(3)')
     .seeAttr('.md-tabs .md-tab:nth-child(3)', 'aria-selected', 'true', '页签 aria-selected=true')
     .see('.md-rulepanel__form', '规则表单可见')
  ),

  feature('规则化：勾"启用序号"后数字输入框解禁', (c) =>
    c.seeCount('.md-input--num:disabled', 3, '未勾选时三个数字框都禁用')
     .click('.md-rulepanel__group:nth-of-type(1) .md-check')
     .seeCount('.md-input--num:disabled', 0, '勾选后数字框解禁')
  ),

  feature('添加文件 → 入列（对话框返回临时副本）', (c) =>
    c.click('.md-actionpanel button:nth-of-type(1)')
     .waitUntil("document.querySelectorAll('.md-filelist__row').length > 0", 8000)
     .scroll('.md-filelist__row')
     .see('.md-filelist__row', '出现文件行（可见且有尺寸、在视口内）')
     .notSee('.md-empty', '空态引导已消失')
  ),

  feature('设置前缀后 → 预览新名渲染', (c) =>
    c.click('input[placeholder="如 {d}-发票-"]')
     .type('test_')
     .waitUntil("(() => { const n = document.querySelector('.md-filelist__newname'); return n && n.textContent.trim().length > 0; })()", 8000)
     .scroll('.md-filelist__row')
     .see('.md-filelist__newname', '预览新名已渲染')
  ),

  feature('有可改项后"开始改名"解禁', (c) =>
    c.seeCount('.md-actionbar .md-btn--primary:disabled', 0, '"开始改名"按钮已可点')
  ),

  feature('变量提示：前缀用了 {d} 但未勾日期', (c) =>
    c.click('input[placeholder="如 {d}-发票-"]')
     .type('{d}-')
     .see('.md-rulepanel__warn', '出现"日期会展开成空"的提示')
  ),

  // ══ P1 第二版：F-10 正则匹配 / F-11 大小写转换（设计稿《P1轻量设计确认》§2–§7）══

  feature('P1 进阶设置：默认折起，点开展开', (c) =>
    c.scroll('.md-adv__bar')
     .see('.md-adv__bar', '「⚙ 进阶设置」折叠条可见')
     .notSee('.md-adv__body', '默认折起：折叠内容不在页面上')
     .seeAttr('.md-adv__bar', 'aria-expanded', 'false', '折起态 aria-expanded=false')
     .seeStyle('.md-adv__bar', 'color', 'rgb(138, 129, 120)', '折起态文字色 #8A8178（与 P0 一致）')
     .click('.md-adv__bar')
     .see('.md-adv__body', '点开后折叠内容出现')
     .seeAttr('.md-adv__bar', 'aria-expanded', 'true', '展开态 aria-expanded=true')
     .seeText('.md-adv__title', '进阶设置', '标题文案为「进阶设置」')
     .seeStyle('.md-adv__body', 'backgroundColor', 'rgb(255, 246, 233)', '展开块底色 #FFF6E9（复用参数组，不新增色）')
  ),

  feature('P1 正则开关：仅删除 / 替换模式出现', (c) =>
    c.click('.md-tabs .md-tab:nth-child(1)')
     .seeText('.md-tabs .md-tab:nth-child(1)', '删除字符', '已切到「删除字符」页签')
     .seeText('.md-adv__body .md-check__label', '用正则匹配', '删除模式：折叠区出现「用正则匹配」')
     .click('.md-tabs .md-tab:nth-child(3)')
     .seeText('.md-adv__body .md-check__label', null, '规则化模式：折叠区**不**出现正则开关（小白隔离，红线 5）')
  ),

  feature('P1 大小写下拉：三种模式都出现，共 4 项', (c) =>
    c.seeCount('.md-adv__case .md-select', 1, '规则化模式已有大小写下拉')
     .seeCount('.md-adv__case .md-select option', 4, '下拉共 4 项（保持原样 + 3 种转换）')
     .seeText('.md-adv__case .md-select option:nth-child(4)', '首字母大写', '第 4 项是「首字母大写」')
     .click('.md-tabs .md-tab:nth-child(2)')
     .seeCount('.md-adv__case .md-select', 1, '替换模式同样有大小写下拉')
     .click('.md-tabs .md-tab:nth-child(1)')
     .seeCount('.md-adv__case .md-select', 1, '删除模式同样有大小写下拉')
  ),

  feature('P1 正则非法：红描边 + 红字 + 状态栏提示 + 按钮置灰', (c) =>
    c.click('.md-adv__body .md-check')
     .seeCount('.md-input--mono', 1, '开启正则后删除输入框切等宽（技术信息字体）')
     .click('input[placeholder="例如：【某某公众号】"]')
     .type('(')
     .waitUntil("!!document.querySelector('.md-input--error')", 5000)
     .seeCount('.md-input--error', 1, '输入 `(` 后删除输入框进入非法态')
     .seeStyleSettled('.md-input--error', 'borderTopColor', 'rgb(229, 84, 75)', '红描边用色 #E5544B（等 180ms 过渡结束再读，避免读到插值色）')
     .seeStyle('.md-input--error', 'borderTopWidth', '2px', '红描边宽度 = 2px（设计 §3.3）')
     .scroll('.md-rulepanel__regerr')
     .see('.md-rulepanel__regerr', '输入框下方出现错误提示')
     .seeStyle('.md-rulepanel__regerr', 'color', 'rgb(229, 84, 75)', '错误文字为红色 #E5544B')
     .seeContains('.md-statusbar__text', '正则表达式有误', '状态栏追加「· 正则表达式有误」')
     .seeCount('.md-actionbar .md-btn--primary:disabled', 1, '「开始改名」被置灰（复用 P0 机制）')
  ),

  feature('P1 正则修正后恢复：红描边消失、红字消失', (c) =>
    c.click('input[placeholder="例如：【某某公众号】"]')
     .type(')')
     .waitUntil("!document.querySelector('.md-input--error')", 5000)
     .seeCount('.md-input--error', 0, '补全右括号成 `()` 后红描边消失')
     .seeCount('.md-rulepanel__regerr', 0, '红字原因消失')
     .notSee('.md-input--error', '输入框已回到正常态')
  ),

  feature('P1 大小写转换：切「全部大写」预览真实变化', (c) =>
    c.click('.md-tabs .md-tab:nth-child(3)')
     .click('input[placeholder="加在扩展名之前"]')
     .type('abc')
     .waitUntil("(() => { const n = document.querySelector('.md-filelist__newname'); return !!n && n.textContent.includes('abc'); })()", 8000)
     .seeContains('.md-filelist__newname', 'abc', '后缀 abc 已进入预览')
     .seeCount('.md-actionbar .md-btn--primary:disabled', 0, '有可改项后「开始改名」解禁（说明置灰只是正则非法带来的）')
     .focus('.md-adv__case .md-select')
     .key('Down').key('Down')
     .waitUntil("(() => { const n = document.querySelector('.md-filelist__newname'); return !!n && n.textContent.includes('ABC'); })()", 8000)
     .seeContains('.md-filelist__newname', 'ABC', '切到「全部大写」后预览里的 abc 变 ABC')
     .seeText('.md-adv__badge', '已启用 1 项', '折叠条出现「已启用 1 项」徽标')
     .seeStyle('.md-adv__bar', 'color', 'rgb(224, 139, 51)', '有启用项时折叠条文字变 #E08B33')
  ),

  feature('P1 大小写「保持原样」：预览回退（红线 3）', (c) =>
    c.focus('.md-adv__case .md-select')
     .key('Up').key('Up')
     .waitUntil("(() => { const n = document.querySelector('.md-filelist__newname'); return !!n && n.textContent.includes('abc') && !n.textContent.includes('ABC'); })()", 8000)
     .seeContains('.md-filelist__newname', 'abc', '回到「保持原样」：预览恢复小写 abc')
     .seeCount('.md-adv__badge', 0, '无启用项时徽标消失')
  ),
];

// ── 主流程 ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  let win = null;
  try {
    if (mainErr) throw new Error(`加载被测主进程入口失败（${APP_ENTRY}）：\n${mainErr.stack || mainErr}`);

    win = await S.waitFor(() => created[0] || BrowserWindow.getAllWindows()[0], {
      timeout: 15000,
      label: '主窗口被创建',
    });

    S.attachSafetyNet(win, result);

    // ★ 让窗口在你眼前动：显示出来 + 置顶（不抢焦点）
    S.showWindow(win);

    await S.waitFor(() => !win.webContents.isLoading(), { timeout: 20000, label: '页面加载完成' });
    await S.injectResourceGuards(win);
    await S.installOverlay(win);   // 测试光标 + 底部操作横幅（运行时注入）

    if (WINDOW_TITLE) {
      const title = win.getTitle();
      result.steps.push({
        index: 0, name: '窗口标题', pass: title === WINDOW_TITLE, ops: [],
        asserts: [{ label: '窗口标题', actual: title, expected: WINDOW_TITLE, pass: title === WINDOW_TITLE }],
      });
    }

    // 等界面就绪（轮询可见元素，不 sleep）
    await S.waitFor(
      async () => {
        const v = await S.evalIn(win, S.visibilityExpr(READY_SELECTOR));
        return v.visible === true;
      },
      { timeout: 20000, label: `界面就绪（${READY_SELECTOR} 可见）` }
    );

    result.unit = readUnit();

    if (!S.config.fast) {
      console.log(`看得见模式：慢速 ${S.config.slow}ms/步，窗口${S.config.top ? '置顶' : '不置顶'}`
        + `${S.config.hud ? '，已注入测试光标与横幅' : ''}。想快跑：SMOKE_FAST=1`);
    }

    await S.runSteps(win, outDir, result, FEATURES);

    // ── 「本次没验到的」：必须显式写，不许留空 ────────────────────────
    result.notVerified = [
      '打包后的 exe（本次测的是 out/ 产物，不是 release/ 里的安装包）',
      '真机 / 其它系统版本 / 其它分辨率',
      '视觉观感与动画是否"被想歪"（需要人眼看）',
      '真实磁盘异常（文件被占用、只读目录、磁盘满）',
      '系统原生对话框的真实交互（本次用运行时 stub 返回临时副本，未验真实对话框）',
      'OS 级文件拖拽入列（sendInputEvent 无法模拟从资源管理器拖入）',
      '真实执行改名 + 撤销（涉及确认弹窗与磁盘写入，本轮未自动化覆盖）',
      '原生 <select> 下拉弹窗的真实点选（下拉弹窗是 OS 级窗口，注入事件点不开；'
        + '本次「切换大小写」是 程序化聚焦 + 真实方向键 驱动的，change 事件由 Chromium 自己发）',
      '正则 ReDoS 主动中止（EX-16 的 Worker 计时中止本轮未实现，仅落地了 pattern 长度 ≤ 200 兜底）',
    ];

    // 隔离核验：真实数据目录指纹跑前跑后应相同
    if (realBefore) {
      const after = S.fingerprint(REAL_DATA_DIR);
      const same = JSON.stringify(after) === JSON.stringify(realBefore);
      result.steps.push({
        index: result.steps.length + 1,
        name: '隔离核验：真实数据目录未被改动',
        pass: same, ops: [],
        asserts: [{ label: `真实数据目录 ${REAL_DATA_DIR} 指纹不变`, expected: realBefore, actual: after, pass: same }],
      });
    }
  } catch (err) {
    result.fatal = String((err && err.stack) || err);
    console.error('致命错误：\n' + result.fatal);
    try {
      if (win && !win.isDestroyed()) result.failShot = await S.shot(win, outDir, 99, 'FATAL');
    } catch { /* 截图失败不掩盖原来的错误 */ }
  } finally {
    result.finishedAt = new Date().toISOString();
    console.log('');
    await S.finish({ app, win, outDir, result, writeReport });
  }
});

// ── 小工具 ────────────────────────────────────────────────────────────
function readUnit() {
  try {
    const p = path.join(__dirname, '..', 'tests', 'artifacts', 'last-unit.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null; // 没跑单测就当"未跑"，不假装 0/0 通过
  }
}

function gitHead() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
  } catch {
    return '';
  }
}

// 兜底：应用可能有托盘常驻逻辑让退出路径卡住
process.on('uncaughtException', (err) => {
  console.error('主进程未捕获异常：\n' + (err.stack || err));
  result.fatal = result.fatal || String(err.stack || err);
  result.finishedAt = new Date().toISOString();
  try { writeReport(outDir, result); } catch { /* 报告写不出来也要退出 */ }
  app.exit(1);
});
