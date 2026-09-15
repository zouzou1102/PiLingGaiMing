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
//   做： click / clickPoint / dblclick / hover / drag / type / key / scroll / wait / waitUntil
//   看： see / notSee / seeText / seeCount / seeStyle / seeAttr
//   c.see* 读的都是**渲染后的真实结果**，不是"某个 class 加没加上"。
// ─────────────────────────────────────────────────────────────────────

/**
 * 弹窗「真的画出来了」的判据。
 *
 * 为什么不能直接 `see` 完事：`.md-mask` / `.md-modal` 有 220ms 入场动画，
 * 起始帧 opacity 恰好是 0（`@keyframes md-modalin`），那一帧 checkVisibility 为假。
 * 快跑模式（SMOKE_FAST=1）下点击后没有停顿，会读到这个起始帧 → 假红。
 * 所以先等它「不透明且可见」，再断言 —— 等出现不是放宽标准，而是等它本来就会到。
 */
const MODAL_VISIBLE = "(() => { const m = document.querySelector('.md-modal');"
  + ' return !!m && m.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); })()';

/** 主列表卡片的底色 —— 深浅两主题差得最明显的一块，用它当"真的换主题了"的探针 */
const CARD_BG = "(() => { const el = document.querySelector('.md-filelist');"
  + " return el ? getComputedStyle(el).backgroundColor : ''; })()";

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

  // ══ P1 说明小白化：照抄表（EL-104）+ 当场演示（EL-105）════════════════
  // 说明：这三条沿用上面的状态（正则已开启）。第一条就断言「两个框都切等宽」——
  // 那是正则开着的可见证据；万一将来有人调整用例顺序，这里会当场红，
  // 而不是静默地在错误前提下"通过"。

  feature('P1 小白化：「?」小抄卡按模式给不同例子', (c) =>
    c.click('.md-tabs .md-tab:nth-child(2)')
     .seeText('.md-tabs .md-tab:nth-child(2)', '替换字符', '切到「替换字符」页签')
     .seeCount('.md-input--mono', 2, '正则开启态：查找 / 替换两个框都切等宽')
     // 折叠条此刻是展开的（前面的用例点开过），点两下 = 关 → 开，把状态摆正
     .click('.md-adv__bar')
     .notSee('.md-adv__body', '第一下：折叠条收起')
     .click('.md-adv__bar')
     .see('.md-adv__body', '第二下：重新展开（不依赖上一步的残留状态）')
     .see('.md-adv__helpbtn', '「? 看不懂？」按钮可见')
     .notSee('.md-adv__cheat', '小抄卡默认不出现（要点开才有）')
     .click('.md-adv__helpbtn')
     .seeAttr('.md-adv__helpbtn', 'aria-expanded', 'true', '点开后 aria-expanded=true')
     .see('.md-adv__cheat', '小抄卡出现')
     .seeCount('.md-adv__cheatrow', 4, '替换模式给 4 个例子')
     .click('.md-tabs .md-tab:nth-child(1)')
     .seeCount('.md-adv__cheatrow', 3, '删除模式只剩 3 个（按模式过滤，不带 $1 那种只属于替换的写法）')
     .click('.md-tabs .md-tab:nth-child(2)')
     .seeCount('.md-adv__cheatrow', 4, '切回替换模式又是 4 个')
     // 收尾滚到卡片上，让报告里这张「操作后」的图能看见照抄表本身
     .scroll('.md-adv__cheat')
     .see('.md-adv__cheat', '照抄表可见（4 个例子，含「替换填」列）')
  ),

  feature('P1 小白化：当场演示跟着填的内容真变', (c) =>
    c.click('input[placeholder="例如：最终版"]')
     .type('(\\d{4})-(\\d{2})-(\\d{2})')
     .click('input[placeholder="留空 = 删除"]')
     .type('$1年$2月$3日')
     .waitUntil("(() => { const n = document.querySelector('.md-adv__demonew'); return !!n && n.textContent.includes('2026年08月01日'); })()", 8000)
     .scroll('.md-adv__demo')
     .see('.md-adv__demo', '演示区可见（有尺寸、在视口内）')
     .seeContains('.md-adv__demoline', '发票 2026-08-01.pdf', '左边是示例原名')
     .seeText('.md-adv__demonew', '发票 2026年08月01日.pdf', '右边 = 示例名字按当前填写内容真算出来的结果（扩展名仍原样保留）')
  ),

  feature('P1 小白化：写法对不上时，不假装"变了"', (c) =>
    // 先把光标按到末尾再追加（点击落在输入框正中会插到文字中间，那样就测歪了）
    c.click('input[placeholder="例如：最终版"]')
     .key('End')
     .type('ZZ')
     .waitUntil("(() => { const n = document.querySelector('.md-adv__demonew'); return !!n && n.textContent.trim() === '发票 2026-08-01.pdf'; })()", 8000)
     .scroll('.md-adv__demo')
     .seeText('.md-adv__demonew', '发票 2026-08-01.pdf', '示例名字里没有 ZZ，匹配不上 → 如实显示"没变"')
     .seeContains('.md-adv__demo', '没找到能匹配的内容', '并明确提示「没找到能匹配的内容」')
     .seeStyle('.md-adv__demonew', 'color', 'rgb(185, 172, 158)', '未变化时用灰字 #B9AC9E，而不是"变了"的橘色（不骗人）')
  ),

  // ══ P2-A 第三版：设置面（SCR-07）+ 深色模式（F-14）════════════════════
  // 设计来源：《P2-A轻量设计确认.md》v1.1（画板 20:1 设置面 / 20:129 深色对照）
  // 这一段有三条"最容易假通过"的地方，所以断言都往"渲染后的真值"上打：
  //   · 主题切换：不只看 class / data-*，而是看**卡片算出来的背景色**变了没有；
  //   · 减少动画：不只看属性，而是看**过渡时长算出来是不是 0**；
  //   · 设置入口：不只看按钮在不在，而是看**里面的 SVG 真的渲染出来了**（切图接线断过就靠这条抓）。

  feature('P2-A TC-28 设置入口：点标题栏滑杆按钮弹出设置弹窗', (c) =>
    c.seeCount('.md-winbtn--settings', 1, '标题栏出现设置入口按钮（EL-106，在窗口三键左侧）')
     .seeCount('.md-winbtn--settings .md-icon svg', 1, '入口按钮里的图标真的渲染出来了（切图 resources→assets 这条线是通的）')
     .notSee('.md-modal', '弹窗默认不在页面上')
     .click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .see('.md-modal', '点滑杆按钮后设置弹窗出现')
     .seeText('.md-modal__title', '设置', '弹窗标题是「设置」')
     .seeCount('.md-settings__seg .md-tab', 3, '主题是「三选一」（EL-108）')
     .seeAttr('.md-settings__seg .md-tab:nth-child(2)', 'aria-pressed', 'true', '默认选中「始终浅色」（负责人答复第 4 条：任何机器上首屏一致）')
     .seeAttr('.md-settings__seg .md-tab:nth-child(1)', 'aria-pressed', 'false', '「跟随系统」未被选中')
     .seeCount('.md-settings__switch--sound', 1, '有「音效」开关（EL-109）')
     .seeCount('.md-settings__switch--motion', 1, '有「减少动画」开关（EL-110 —— 补上 P0 就要求、此前却没有入口的那条无障碍）')
     .seeText('.md-modal__foot--spread .md-hint', '设置立即生效，不需要重启。', '底部说明走 spread 布局（左说明 / 右按钮）')
     .see('.md-modal__foot--spread .md-btn--primary', '底部「完成」按钮可见')
  ),

  feature('P2-A TC-28 关闭方式一：点遮罩空白处关闭', (c) =>
    c.see('.md-modal', '关闭前弹窗还在')
     // 遮罩铺满整窗，但正中被弹窗本体压着 —— 点中心只会点到弹窗身上。
     // 所以点左下角空白：那里只可能是遮罩（弹窗宽 480，横向居中，左侧留白 ≥210px）。
     .clickPoint(28, 300, '点遮罩左下角空白处（不是弹窗本体）')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
     .notSee('.md-modal', '点遮罩后弹窗关闭')
  ),

  feature('P2-A TC-28 关闭方式二：按 Esc 关闭', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .see('.md-modal', '再次打开设置弹窗')
     .key('Escape')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
     .notSee('.md-modal', '按 Esc 后弹窗关闭')
  ),

  feature('P2-A TC-28 关闭方式三：点「完成」关闭（与另两种等价）', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .click('.md-modal__foot--spread .md-btn--primary')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
     .notSee('.md-modal', '点「完成」后弹窗关闭，不刷新、不跳转、不二次确认')
  ),

  feature('P2-A TC-29 主题「跟随系统」：解析结果就是系统信号（不猜、不写死）', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     // 先强制成「始终深色」再选「跟随系统」——这一步是有意的：
     // 机器是深色就会保持、机器是浅色就必须**翻回浅色**。
     // 于是「它真的在跟系统走」在两台不同设置的机器上都看得出来，
     // 而不是在浅色机器上"本来就对"地假通过。
     .click('.md-settings__seg .md-tab:nth-child(3)')
     .waitUntil(`${CARD_BG} === 'rgb(46, 33, 25)'`, 8000)
     .seeAttr('html', 'data-theme', 'dark', '先强制到「始终深色」')
     .click('.md-settings__seg .md-tab:nth-child(1)')
     // 先等这一下真的落稳（等 aria-pressed 变了再往下读）——
     // 否则系统信号恰好等于当前主题时，后面的断言会在 IPC 回程之前抢先跑。
     .waitUntil("document.querySelector('.md-settings__seg .md-tab:nth-child(1)')"
       + ".getAttribute('aria-pressed') === 'true'", 8000)
     // 色彩翻转比属性翻得慢半拍（媒体查询要等一次样式重算），所以先等它落定再断言
     .waitUntil(`(() => { const m = matchMedia('(prefers-color-scheme: dark)').matches;`
       + ` return ${CARD_BG} === (m ? 'rgb(46, 33, 25)' : 'rgb(255, 255, 255)'); })()`, 8000)
     .seeAttr('.md-settings__seg .md-tab:nth-child(1)', 'aria-pressed', 'true', '「跟随系统」变为选中')
     .seeThat("(() => { const t = document.documentElement.dataset.theme;"
       + " return t === (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); })()", true,
       'data-theme 严格等于系统信号解析出来的值（期望值取决于本机 Windows 设置，所以用表达式而不是写死）')
     .seeThat(`${CARD_BG} === (matchMedia('(prefers-color-scheme: dark)').matches`
       + " ? 'rgb(46, 33, 25)' : 'rgb(255, 255, 255)')", true,
       '卡片底色也跟着系统信号走（深色系统→深底 #2E2119 / 浅色系统→白底）')
     .seeCount('html[data-theme="light"], html[data-theme="dark"]', 1,
       'data-theme 落在 light / dark 两个已知值之一（没把 "system" 这个字面量写进属性）')
     .click('.md-settings__seg .md-tab:nth-child(2)')
     .waitUntil(`${CARD_BG} === 'rgb(255, 255, 255)'`, 8000)
     .seeAttr('html', 'data-theme', 'light', '恢复「始终浅色」，不把脏状态留给后面')
     .click('.md-modal__foot--spread .md-btn--primary')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
  ),

  feature('P2-A TC-29 深色模式：切「始终深色」界面真的变深', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .seeAttr('html', 'data-theme', 'light', '切换前是浅色')
     .seeStyle('.md-filelist', 'backgroundColor', 'rgb(255, 255, 255)', '切换前卡片是白底')
     .seeStyle('.md-settings__seg', 'backgroundColor', 'rgb(247, 239, 227)', '切换前页签槽是浅凹陷色 #F7EFE3')
     .seeStyle('.md-modal__foot--spread .md-btn--primary', 'color', 'rgb(42, 26, 16)',
       '主按钮文字是深棕 #2A1A10（浅色下也改了 —— P2-A 唯一改动浅色现有观感的地方）')
     .click('.md-settings__seg .md-tab:nth-child(3)')
     .waitUntil(`${CARD_BG} === 'rgb(46, 33, 25)'`, 8000)
     .seeAttr('html', 'data-theme', 'dark', '切换后 <html data-theme> = dark')
     .seeAttr('.md-settings__seg .md-tab:nth-child(3)', 'aria-pressed', 'true', '「始终深色」变为选中')
     .seeStyle('.md-filelist', 'backgroundColor', 'rgb(46, 33, 25)', '卡片底色真的变成深色 #2E2119')
     .seeStyle('.md-settings__seg', 'backgroundColor', 'rgb(26, 18, 16)',
       '页签槽变成 #1A1210 —— 仍比卡片暗（层级方向没弄反，否则选中态就看不见了）')
     .seeStyle('.md-modal__foot--spread .md-btn--primary', 'color', 'rgb(42, 26, 16)',
       '主按钮文字仍是深棕（品牌橘与橘底前景两主题同值）')
     // 开关轨道描边：这是 P2-A 唯一"破例新增"的第 15 个令牌。
     // box-shadow 的序列化格式各版本 Chrome 略有差异，所以判"含这个颜色"而不是全等字面量。
     .waitUntil("(() => { const el = document.querySelector('.md-settings__switch--motion .md-switch__track');"
       + " return !!el && getComputedStyle(el).boxShadow.includes('94, 74, 59'); })()", 8000)
     .click('.md-modal__foot--spread .md-btn--primary')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
     .seeStyle('.md-filelist', 'backgroundColor', 'rgb(46, 33, 25)',
       '关掉弹窗后主界面仍然是深色（说明是全应用生效，不是只有弹窗里好看）')
  ),

  feature('P2-A TC-29 深色切回浅色：真的回来了', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .seeAttr('html', 'data-theme', 'dark', '打开设置时仍是深色（上一步的结果还在）')
     .click('.md-settings__seg .md-tab:nth-child(2)')
     .waitUntil(`${CARD_BG} === 'rgb(255, 255, 255)'`, 8000)
     .seeAttr('html', 'data-theme', 'light', '切回浅色后 <html data-theme> = light')
     .seeStyle('.md-filelist', 'backgroundColor', 'rgb(255, 255, 255)', '卡片底色回到白色')
     .click('.md-modal__foot--spread .md-btn--primary')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
  ),

  feature('P2-A TC-31 减少动画：开启后动效时长真的归零', (c) =>
    c.click('.md-winbtn--settings')
     .waitUntil(MODAL_VISIBLE, 8000)
     .seeAttr('html', 'data-reduce-motion', 'false', '默认关闭')
     .seeStyle('.md-tab', 'transitionDuration', '0.18s', '开启前页签有 180ms 过渡（= 设计规范 §7 的 --md-dur-hover）')
     .click('.md-settings__switch--motion')
     .waitUntil("document.documentElement.dataset.reduceMotion === 'true'", 8000)
     .seeAttr('html', 'data-reduce-motion', 'true', '开启后 <html data-reduce-motion> = true')
     .seeStyle('.md-tab', 'transitionDuration', '0s', '过渡时长算出来是 0 —— 开关真的生效，不只是翻了个属性')
     .click('.md-settings__switch--motion')
     .waitUntil("document.documentElement.dataset.reduceMotion === 'false'", 8000)
     .seeAttr('html', 'data-reduce-motion', 'false', '再点一下能关回去（不留脏状态）')
     .click('.md-modal__foot--spread .md-btn--primary')
     .waitUntil("!document.querySelector('.md-modal')", 8000)
     .seeStyle('.md-tab', 'transitionDuration', '0.18s', '关掉「减少动画」后过渡恢复 180ms')
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
      // ── P2-A ─────────────────────────────────────────────────────────
      '首帧不闪烁（TC-30）：它说的是「窗口出现之前那一帧」，冒烟只能截到渲染完的画面 —— '
        + '本轮未自动验证。做法见 tokens.css 文件头（深色挂 @media 不挂 [data-theme]，'
        + '主进程建窗前设 themeSource + backgroundColor），常量另由单测钉住',
      '真实 Windows 深色模式下的原生控件外观（滚动条 / 右键菜单）：交给 nativeTheme → 系统去画，断言不了',
      '主题切换后 BrowserWindow.backgroundColor 不跟着改（只在建窗时设一次）—— '
        + '深色下拖拽改变窗口尺寸时理论上可能瞬间露出建窗时的浅色底，本轮未观察到，也没处理',
      '深色下的人眼观感（暖褐色深底好不好看、猫咪是否仍然可爱）：需要人看截图判断，断言判不了',
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
