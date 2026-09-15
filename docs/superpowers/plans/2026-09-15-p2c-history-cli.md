# P2-C 落地实施计划（历史完整版 + 命令行入口）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让历史页能看完整明细、能清空历史（带数据安全阀），并让设置里的「命令行」入口背后真的有一个可用的命令行模式。

**Architecture:** 三块界面改动（明细展开 / 清空历史 / 设置里的命令行入口）都复用 P2-A 已定义的令牌与既有组件；新增 1 个 IPC 通道 `md:history:clear` 与 1 个 `AppInfo.execPath` 字段。命令行模式在**取单实例锁之前**判断 argv，走与界面**同一套**执行器（`rename-executor.execute`）与同一套安全底线，并写入历史以便在界面里撤销。

**Tech Stack:** Electron 33 + Vue 3 + TypeScript + Pinia + electron-vite；测试用 `node --test`（无第三方框架）与真实 Electron 冒烟。

**Spec:** `P2-C轻量设计确认.md` v1.2（§1 明细 / §2 清空 / §3 命令行 / §4 通道与字段 / §6 验收 TC-33~37）+ `交互说明文档.md` v1.5（§2.3 EL-114~116 / §2.4 IX-102~103 / §3.1 EL-111~113 / §3.2 IX-100~101 / §6 二次确认表 / §10 EX-17）+ `接口文档.md`（§3.5 通道定义，CLI 节由本批补写）

## Global Constraints

- 不引入任何第三方测试框架：单测 `node --test` + `node:assert`，界面用真实 Electron 冒烟。
- **绝不为让测试变绿而放宽 / 跳过 / 删断言。**
- `src/shared/` 必须纯净：不 import `electron` / `node:fs` / `node:path`。
- CSS 与组件里**禁止出现硬编码色值**，只能用 `var(--md-*)`（唯一白名单 `src/shared/theme.ts` 的 `WINDOW_BG`）；验收判据是 TC-32。
- 单测必须显式传文件：`node tests/run-unit.js tests/p1-rules.test.ts tests/p2a-theme.test.ts tests/p2c.test.ts`。
- 新增编号一律顺延：本轮用 `EL-111~116` / `IX-100~103` / `EX-17` / `TC-33~37` / `DEC-12`。
- 中文文案**逐字**取自设计文档，不要自己改写。

## 本批落地时确认的两处「文档与代码不符」（已与负责人核对，按此实现）

1. **明细的「（无变化）」分支不实现。** 设计 §1.3 写「无变化的行整行 `ink-4` 并追加（无变化）」，但 `RenameTask.entries` 的定义是「**只记录改名成功的明细**」（`src/shared/types.ts:276`），执行器也只 push 成功项（`rename-executor.ts:311`）。所以 `toName === fromName` 的项**不可能进入明细**，该分支是死代码 → 不写（Karpathy 准则 2：不为不可能的场景写分支）。同步在 Task 8 把设计文档这一行改掉。
2. **danger 主按钮已存在。** `base.css:197` 已有 `.md-btn--danger`（底 `bad` / 字 `on-danger` / 悬停 `bad-hover`），ConfirmModal 直接用它即可，**不新增样式**。

## File Structure

| 文件 | 责任 |
| --- | --- |
| `src/shared/history-detail.ts` **(新)** | 明细行的纯函数：序号、「原名 → 新名」、100 条上限与「还有 N 项」文案 |
| `src/shared/cli-args.ts` **(新)** | 命令行参数 → `CliOptions` 的纯解析 + 用法文本 + `CliOptions → RuleConfig` |
| `src/shared/channels.ts` | 新增 `HISTORY_CLEAR` |
| `src/shared/types.ts` | `AppInfo.execPath`、`ClearHistoryResult` |
| `src/main/services/history-store.ts` | 新增 `clearAllTasks()` |
| `src/main/ipc/history.ipc.ts` | 注册 `md:history:clear` |
| `src/main/ipc/app.ipc.ts` | `getAppInfo()` 补 `execPath` |
| `src/main/cli/run.ts` **(新)** | 命令行核心：**不 import electron**，可被单测直接跑（真临时目录） |
| `src/main/cli/index.ts` **(新)** | Electron 胶水：判断是否命令行模式、跑、`app.exit(code)` |
| `src/main/index.ts` | 在**取单实例锁之前**分流命令行 |
| `src/preload/api.ts` | 暴露 `history.clear()` |
| `src/renderer/src/components/HistoryCard.vue` | EL-111 展开条 + EL-112 明细列表 |
| `src/renderer/src/views/HistoryView.vue` | footer 改成 spread，右侧 EL-113 清空按钮 |
| `src/renderer/src/components/ConfirmModal.vue` | `clearHistory` 分支：警告块 + danger 主按钮 |
| `src/renderer/src/components/SettingsModal.vue` | EL-114 命令行行 + EL-115 代码块 + EL-116 按钮组 |
| `src/renderer/src/stores/task.ts` | `ConfirmKind` 加 `clearHistory`、`askClearHistory()`、`confirmYes` 分支、状态栏文案 |
| `src/renderer/src/stores/history.ts` | `resetEvictionBaseline()`（清空后不再误报淘汰） |
| `src/renderer/src/styles/base.css` | 新增 `.md-detail*` / `.md-cli*` / `.md-modal__warn` / `.md-history__foot--spread` / `.md-btn--ghost-danger` |
| `tests/p2c.test.ts` **(新)** | 纯逻辑 + 清空语义 + 淘汰不误报 + CLI 解析与真跑 |
| `tools/smoke.js` | TC-33~37 + 复制按钮的真实界面冒烟 |

---

### Task 1: 共享层契约与纯逻辑

**Files:**
- Create: `src/shared/history-detail.ts`, `src/shared/cli-args.ts`
- Modify: `src/shared/channels.ts:33-35`, `src/shared/types.ts`（`AppInfo` / 新增 `ClearHistoryResult`）
- Test: `tests/p2c.test.ts`

**Interfaces:**
- Consumes: `RenameEntry`、`RuleConfig`、`DEFAULT_RULE`（`@shared/types`）、`CaseTransform`（`@shared/types`）
- Produces:
  - `DETAIL_RENDER_LIMIT = 100`
  - `detailRows(entries: RenameEntry[]): DetailRow[]`，`DetailRow = { index: number; fromName: string; toName: string }`
  - `visibleDetailRows(entries, limit?): { rows: DetailRow[]; hidden: number; total: number }`
  - `hiddenDetailText(hidden: number, total: number): string` → `还有 ${hidden} 项未显示（共 ${total} 项）`
  - `parseCliArgs(argv: string[]): { ok: true; options: CliOptions } | { ok: false; error: string }`
  - `CliOptions = { dir: string; rule: RuleConfig; yes: boolean; autoSeq: boolean; caseSensitive: boolean; limit: number }`
  - `CLI_USAGE: string`、`isCliInvocation(argv: string[]): boolean`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/p2c.test.ts 片段
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL_RENDER_LIMIT, visibleDetailRows, hiddenDetailText } from '../src/shared/history-detail'
import { parseCliArgs, isCliInvocation } from '../src/shared/cli-args'

test('明细：超过 100 条只渲染前 100，并给出「还有 N 项」文案', () => {
  const entries = Array.from({ length: 5000 }, (_, i) => ({
    dirPath: 'D:/x', fromName: `f${i}.txt`, toName: `g${i}.txt`,
  }))
  const v = visibleDetailRows(entries)
  assert.equal(v.rows.length, DETAIL_RENDER_LIMIT)
  assert.equal(v.hidden, 4900)
  assert.equal(v.total, 5000)
  assert.equal(hiddenDetailText(v.hidden, v.total), '还有 4900 项未显示（共 5000 项）')
  assert.equal(v.rows[0].index, 1, '序号从 1 开始')
})

test('明细：100 条以内不出现「还有 N 项」', () => {
  const entries = Array.from({ length: 100 }, () => ({ dirPath: 'D:/x', fromName: 'a', toName: 'b' }))
  const v = visibleDetailRows(entries)
  assert.equal(v.rows.length, 100)
  assert.equal(v.hidden, 0)
})

test('CLI：只有出现已知开关才算命令行模式（避免误吞 Electron 自己的参数）', () => {
  assert.equal(isCliInvocation(['--rename', '--dir', 'D:/x']), true)
  assert.equal(isCliInvocation(['--dir', 'D:/x']), true)      // 缺 --rename 也要进 CLI 才能报错
  assert.equal(isCliInvocation(['--inspect=5858']), false)
  assert.equal(isCliInvocation([]), false)
})

test('CLI：--delete 与 --replace 互斥；--yes 与 --dry-run 互斥；缺 --dir 报错', () => {
  assert.equal(parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', '广告']).ok, true)
  const a = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--replace', 'a', 'b'])
  assert.equal(a.ok, false)
  const b = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', 'a', '--yes', '--dry-run'])
  assert.equal(b.ok, false)
  const c = parseCliArgs(['--rename', '--delete', 'a'])
  assert.equal(c.ok, false)
  if (c.ok === false) assert.match(c.error, /--dir/)
})

test('CLI：--delete 落到 RuleConfig 的 delete 模式；--auto-seq / --case-sensitive 生效', () => {
  const r = parseCliArgs(['--rename', '--dir', 'D:/x', '--delete', '广告', '--auto-seq', '--case-sensitive', '--yes'])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.options.rule.mode, 'delete')
    assert.equal(r.options.rule.delete.text, '广告')   // ★ 真实字段：rule.delete.text

    assert.equal(r.options.yes, true)
    assert.equal(r.options.autoSeq, true)
    assert.equal(r.options.rule.caseSensitive, true)
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/run-unit.js tests/p1-rules.test.ts tests/p2a-theme.test.ts tests/p2c.test.ts`
Expected: FAIL —— `Cannot find module '.../src/shared/history-detail'`

- [ ] **Step 3: 写实现**

`src/shared/history-detail.ts`：

```ts
/**
 * 历史明细的纯逻辑（P2-C · EL-112）。
 *
 * 为什么单拎一个文件：**「只渲染前 100 条」是一条可验证的规则**，
 * 写在组件里就只能靠肉眼看；放共享层能被单测直接钉住。
 *
 * ⚠️ 不实现设计稿里的「（无变化）」分支：`RenameTask.entries` 的定义是
 * 「只记录改名成功的明细」，`toName === fromName` 的项进不来，那是个死分支。
 */
import type { RenameEntry } from './types'

/** 明细一次最多渲染多少行（设计 §1.4 取舍 1：几千条全渲染会卡）*/
export const DETAIL_RENDER_LIMIT = 100

export interface DetailRow {
  /** 序号，从 1 开始（界面右对齐显示）*/
  index: number
  fromName: string
  toName: string
}

export function detailRows(entries: RenameEntry[]): DetailRow[] {
  return entries.map((e, i) => ({ index: i + 1, fromName: e.fromName, toName: e.toName }))
}

export function visibleDetailRows(
  entries: RenameEntry[],
  limit: number = DETAIL_RENDER_LIMIT,
): { rows: DetailRow[]; hidden: number; total: number } {
  const total = entries.length
  return { rows: detailRows(entries.slice(0, limit)), hidden: Math.max(0, total - limit), total }
}

export function hiddenDetailText(hidden: number, total: number): string {
  return `还有 ${hidden} 项未显示（共 ${total} 项）`
}
```

`src/shared/cli-args.ts` 的核心（完整文件）：

```ts
/**
 * 命令行参数解析（P2-C · F-15）。
 *
 * 放共享层：纯函数、不 import electron / fs / path，所以能被单测直接跑 ——
 * 命令行最容易出错的地方就是「参数解析」，而那部分不该只有打包后才能验。
 */
import { DEFAULT_RULE, type RuleConfig } from './types'

export interface CliOptions {
  dir: string
  rule: RuleConfig
  /** 显式 --yes 才真改；不传只打印将要做的改动 */
  yes: boolean
  autoSeq: boolean
  caseSensitive: boolean
  /** 打印上限，默认 50（避免刷屏）*/
  limit: number
}

export const CLI_FLAG_PREFIX = '--'

/** 已知开关。用于判断「这是不是命令行模式」——避免把 Electron 自己的参数当成我们的 */
const KNOWN = new Set([
  '--rename', '--help', '--dry-run', '--yes', '--dir', '--delete', '--replace',
  '--prefix', '--suffix', '--seq', '--date', '--date-format', '--regex',
  '--lower', '--upper', '--capitalize', '--auto-seq', '--case-sensitive', '--limit',
])

export function isCliInvocation(argv: string[]): boolean {
  return argv.some((a) => KNOWN.has(a))
}

export const CLI_USAGE = `耄耋改名 · 命令行模式

用法：
  maodie.exe --rename --dir "<目录>" [规则] [--yes]

规则（三选一，与界面完全一致）：
  --delete "<文本>"
  --replace "<查找>" "<替换为>"
  --prefix "<前缀>" --suffix "<后缀>" --seq --date --date-format "<格式>"

P1 能力：
  --regex                          正则匹配
  --lower | --upper | --capitalize 大小写转换

安全相关：
  --auto-seq                       冲突时自动加序号（默认不加 = 跳过）
  --case-sensitive                 区分大小写
  --limit <N>                      打印上限（默认 50）

★ 默认不覆盖任何已有文件
★ 不传 --yes 只打印将要做的改动（dry-run）；必须显式 --yes 才真正改名

示例：
  maodie.exe --rename --dir "D:\\下载\\素材" --delete "广告" --yes
`

export function parseCliArgs(
  argv: string[],
): { ok: true; options: CliOptions } | { ok: false; error: string } {
  let dir = ''
  let limit = 50
  let yes = false
  let dryRun = false
  let autoSeq = false
  let caseSensitive = false
  const rule: RuleConfig = { ...DEFAULT_RULE, rule: { ...DEFAULT_RULE.rule } }
  let ruleKind: 'delete' | 'replace' | 'basic' | null = null

  // 小工具：取下一个参数（缺了就算错）
  const take = (flag: string, i: number): { ok: true; v: string; next: number } | { ok: false; error: string } => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith(CLI_FLAG_PREFIX)) {
      return { ok: false, error: `${flag} 后面缺少值` }
    }
    return { ok: true, v, next: i + 2 }
  }

  for (let i = 0; i < argv.length; ) {
    const a = argv[i]
    if (a === '--rename') { i++; continue }
    if (a === '--yes') { yes = true; i++; continue }
    if (a === '--dry-run') { dryRun = true; i++; continue }
    if (a === '--auto-seq') { autoSeq = true; i++; continue }
    if (a === '--case-sensitive') { caseSensitive = true; i++; continue }
    if (a === '--regex') { rule.regexEnabled = true; i++; continue }
    if (a === '--lower' || a === '--upper' || a === '--capitalize') {
      rule.caseTransform = a === '--lower' ? 'lower' : a === '--upper' ? 'upper' : 'capitalize'
      i++
      continue
    }
    if (a === '--seq') { rule.rule.seqEnabled = true; ruleKind = ruleKind ?? 'basic'; i++; continue }
    if (a === '--date') { rule.rule.dateEnabled = true; ruleKind = ruleKind ?? 'basic'; i++; continue }
    if (a === '--dir' || a === '--delete' || a === '--replace' || a === '--prefix' ||
        a === '--suffix' || a === '--date-format' || a === '--limit') {
      const t = take(a, i)
      if (t.ok === false) return { ok: false, error: t.error }
      i = t.next
      switch (a) {
        case '--dir': dir = t.v; break
        case '--delete':
          if (ruleKind && ruleKind !== 'delete') return { ok: false, error: '--delete 与 --replace / 前后缀不能同时使用' }
          ruleKind = 'delete'; rule.mode = 'delete'; rule.delete.text = t.v; break
        case '--replace': {
          if (ruleKind && ruleKind !== 'replace') return { ok: false, error: '--replace 与 --delete / 前后缀不能同时使用' }
          const t2 = take('--replace 的第二个值', i - 1)
          if (t2.ok === false) return { ok: false, error: '--replace 需要两个值：<查找> <替换为>' }
          i = t2.next
          ruleKind = 'replace'; rule.mode = 'replace'; rule.replace.find = t.v; rule.replace.to = t2.v
          break
        }
        case '--prefix': ruleKind = ruleKind ?? 'basic'; rule.rule.prefix = t.v; break
        case '--suffix': ruleKind = ruleKind ?? 'basic'; rule.rule.suffix = t.v; break
        case '--date-format': {
          // 只能是 enum 里的三个值（types.ts 的 DateFormat），否则引擎会拿到野值
          if (t.v !== 'YYYY-MM-DD' && t.v !== 'YYYYMMDD' && t.v !== 'YYYY年MM月DD日') {
            return { ok: false, error: '--date-format 只支持 YYYY-MM-DD / YYYYMMDD / YYYY年MM月DD日' }
          }
          ruleKind = ruleKind ?? 'basic'; rule.rule.dateFormat = t.v; break
        }
        case '--limit': limit = Number(t.v) > 0 ? Number(t.v) : 50; break
      }
      continue
    }
    return { ok: false, error: `未知参数 ${a}（用 --help 看用法）` }
  }

  if (dir === '') return { ok: false, error: '缺少 --dir <路径>' }
  if (ruleKind === null) return { ok: false, error: '至少要给一条规则（--delete / --replace / --prefix 等）' }
  if (yes && dryRun) return { ok: false, error: '--yes 与 --dry-run 不能同时使用' }

  rule.caseSensitive = caseSensitive
  return { ok: true, options: { dir, rule, yes, autoSeq, caseSensitive, limit } }
}
```

`src/shared/channels.ts`：在 `HISTORY_UNDO_ALL` 后加一行

```ts
  HISTORY_CLEAR: 'md:history:clear',
```

`src/shared/types.ts`：`AppInfo` 加字段、新增结果类型

```ts
export interface AppInfo {
  /* …原有字段不动… */
  /** ★ P2-C：可执行文件路径，供设置里「复制程序路径」用 */
  execPath: string
}

/** P2-C · md:history:clear 的返回 */
export interface ClearHistoryResult {
  /** 被清掉的记录条数（用于状态栏文案）*/
  cleared: number
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/run-unit.js tests/p1-rules.test.ts tests/p2a-theme.test.ts tests/p2c.test.ts`
Expected: PASS（新增用例全绿，P1/P2-A 原有 27 条不回归）

- [ ] **Step 5: 把新测试文件挂进 `test:core`**

`maodie-renamer/package.json`：

```json
"test:core": "node tests/run-unit.js tests/p1-rules.test.ts tests/p2a-theme.test.ts tests/p2c.test.ts",
```

Run: `npm run test:core` → Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add maodie-renamer/src/shared/history-detail.ts maodie-renamer/src/shared/cli-args.ts \
        maodie-renamer/src/shared/channels.ts maodie-renamer/src/shared/types.ts \
        maodie-renamer/tests/p2c.test.ts maodie-renamer/package.json
git commit -F - <<'MSG'
feat(P2-C): 共享层契约 —— 明细纯逻辑 / 命令行参数解析 / 第16个通道

- src/shared/history-detail.ts：EL-112 明细行的纯函数 + 100 条渲染上限
- src/shared/cli-args.ts：命令行参数解析（纯函数，可单测）+ 用法文本
- channels.ts 新增 md:history:clear（请求响应通道 15 → 16）
- types.ts：AppInfo.execPath（供「复制程序路径」）+ ClearHistoryResult

两处刻意不照设计稿做，理由写在文件头注释里：
① 不实现「（无变化）」分支 —— entries 只记改名成功的项，那是死分支；
② CLI 参数名沿用设计草案（--delete/--replace/--yes），与既有的开发者脚本
   scripts/cli-verify.ts 区分开（那是 npm run cli:verify，不进打包产物）。
MSG
```

---

### Task 2: 主进程「清空历史」+ IPC + preload

**Files:**
- Modify: `src/main/services/history-store.ts`（新增 `clearAllTasks`）、`src/main/ipc/history.ipc.ts`、`src/main/ipc/app.ipc.ts`、`src/preload/api.ts:76-81`
- Test: `tests/p2c.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `CH.HISTORY_CLEAR`、`ClearHistoryResult`
- Produces:
  - `clearAllTasks(): Promise<number>` —— 清空并落盘，返回被清掉的条数
  - `window.maodie.history.clear(): Promise<MdResult<ClearHistoryResult>>`
  - `getAppInfo().execPath: string`

- [ ] **Step 1: 写失败的测试**

```ts
test('清空历史：记录清空、文件未被触碰（真实临时目录）', async () => {
  // 真实临时目录 + 真实文件，全程不 mock
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-p2c-'))
  const file = path.join(dir, '发票 广告.txt')
  await fsp.writeFile(file, 'x')
  const before = await fsp.stat(file)

  // 走真实存储层：initStorage 指到临时目录
  initStorage(dir)
  await loadHistory()
  await appendTask(buildTask('t1', '2026-09-15', '删除「广告」', fakeResult(), [
    { dirPath: dir, fromName: '发票 广告.txt', toName: '发票.txt' },
  ]))
  assert.equal(listTasks().length, 1)

  const cleared = await clearAllTasks()
  assert.equal(cleared, 1)
  assert.deepEqual(listTasks(), [], '记录应已清空')

  const after = await fsp.stat(file)
  assert.equal(after.mtimeMs, before.mtimeMs, '文件时间戳不许变')
  assert.ok(await fsp.readdir(dir).then((l) => l.includes('发票 广告.txt')), '文件仍在原处')
  await fsp.rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: 跑测试确认失败** → FAIL：`clearAllTasks is not a function`

- [ ] **Step 3: 写实现**

`history-store.ts` 里加（放在 `undoAll` 之后）：

```ts
/**
 * 清空全部历史记录（P2-C · IX-101 / EX-17）。
 *
 * ★ 红线（数据库设计 §4.7 / 技术方案 §11 遗留项 13）：
 *   **只删记录，绝不触碰任何文件** —— 这个函数里不出现任何 fs 改名调用。
 * @returns 被清掉的条数（供状态栏文案「已清空全部 N 条历史记录」）
 */
export async function clearAllTasks(): Promise<number> {
  const n = tasks.length
  tasks = []
  await persist()
  return n
}
```

> 实现前先看该文件里保存任务列表的变量名（可能是 `let tasks: RenameTask[]` 或模块级 `store`），照它的真实形状写。

`history.ipc.ts`：

```ts
import { clearAllTasks, listTasks, undoAll, undoTask } from '../services/history-store'
// …
  ipcMain.handle(CH.HISTORY_CLEAR, () => business(async () => ({ cleared: await clearAllTasks() })))
```

`app.ipc.ts` 的 `getAppInfo()` 里补一行：

```ts
    execPath: process.execPath,   // P2-C：设置里「复制程序路径」用
```

`preload/api.ts` 的 `history` 段补：

```ts
      clear: () => bridge.invoke(CH.HISTORY_CLEAR) as Promise<MdResult<ClearHistoryResult>>,
```

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: 跑护栏防止契约漏改**

Run: `npm run typecheck`
Expected: 0 错。**若报 `MaodieApi` 缺 `clear`** → 说明 `src/shared/types.ts` 里的 `MaodieApi` 没同步（记忆里的「最易漏」位置），补上：

```ts
    history: {
      list: () => Promise<MdResult<RenameTask[]>>
      undoTask: (req: { taskId: string }) => Promise<MdResult<UndoResult>>
      undoAll: () => Promise<MdResult<UndoAllResult>>
      clear: () => Promise<MdResult<ClearHistoryResult>>   // ← P2-C
    }
```

- [ ] **Step 6: Commit**

```bash
git add maodie-renamer/src/main maodie-renamer/src/preload maodie-renamer/src/shared/types.ts maodie-renamer/tests/p2c.test.ts
git commit -F - <<'MSG'
feat(P2-C): 清空历史的主进程侧 —— 第16个通道 + AppInfo.execPath

- history-store.clearAllTasks()：只删记录、不碰任何文件（红线）
- md:history:clear 注册进 history.ipc.ts，返回 { cleared }
- AppInfo.execPath 供设置里「复制程序路径」（取 process.execPath）
- preload 暴露 history.clear()，MaodieApi 同步
- 单测用真实临时目录断言「记录清了、文件时间戳没变」
MSG
```

---

### Task 3: 渲染层「清空历史」（含安全阀与淘汰基准重置）

**Files:**
- Modify: `src/renderer/src/stores/history.ts`、`src/renderer/src/stores/task.ts`、`src/renderer/src/components/ConfirmModal.vue`、`src/renderer/src/views/HistoryView.vue`、`src/renderer/src/styles/base.css`
- Test: `tests/p2c.test.ts`

**Interfaces:**
- Consumes: `window.maodie.history.clear()`、Task 1 的 `ClearHistoryResult`
- Produces:
  - `useHistoryStore().resetEvictionBaseline()` —— 清空后重置基准，避免假警报
  - `task.askClearHistory()`、`ConfirmKind` 增加 `'clearHistory'`、`ConfirmContext` 增加 `warning?: string` / `confirmLabel?: string` / `danger?: boolean`

- [ ] **Step 1: 写失败的测试（淘汰不误报 —— 本批最容易漏的一条）**

```ts
test('清空后不误报淘汰：resetEvictionBaseline 之后再刷新，evictedNotice 保持 0', () => {
  // 直接测 store 的判定逻辑（把判定抽成纯函数后就能这样测）
  const first = [task('a', 1), task('b', 2)]          // 最新在前
  const cleared: [] = []
  const s1 = detectEviction(null, 0, first)           // 首次加载：不报
  assert.equal(s1, 0)
  const s2 = detectEviction('b', 2, first)            // 正常刷新：不报
  assert.equal(s2, 0)
  const s3 = detectEviction('b', 2, cleared)          // ★ 清空：必须不报
  assert.equal(s3, 0, '用户主动清空不是淘汰，不许弹「较旧的记录已被清理」')
  const s4 = detectEviction('b', 2, [task('a', 1)])   // 真淘汰：要报
  assert.equal(s4, 1)
})
```

> 为此把 `stores/history.ts` 里那段判定抽成 `src/shared/history-detail.ts` 的纯函数
> `detectEviction(lastOldestId, lastCount, next): 0 | 1`（多一个「清空后基准为 null」的入参形态），
> 并在 store 里维护 `baseline`。

- [ ] **Step 2: 跑测试确认失败** → FAIL：`detectEviction is not a function`

- [ ] **Step 3: 写实现**

`src/shared/history-detail.ts` 追加：

```ts
/**
 * 淘汰检测（DEC-09「淘汰不静默」）。
 *
 * @param lastOldestId 上一份列表里最旧那条的 id；**清空后必须置回 null**
 * @param lastCount    上一份列表的长度
 * @param next         本次拿到的列表
 * @returns 1 = 判定发生了淘汰
 *
 * ★ 用户主动清空时：next 为空 → nextOldestId = null，而 lastOldestId 是上次的 id，
 *   且 0 <= lastCount —— **两个条件同时成立**，不特判就会误报
 *   「为保证性能，较旧的记录已被清理」（P2-C §2.6）。
 *   所以这里把「清空」显式排除：本次为空列表时一律不算淘汰。
 */
export function detectEviction(
  lastOldestId: string | null,
  lastCount: number,
  next: { id: string }[],
): 0 | 1 {
  if (next.length === 0) return 0            // ← 清空（或本来就没记录）永不判为淘汰
  const nextOldestId = next[next.length - 1].id
  if (lastOldestId !== null && nextOldestId !== lastOldestId && next.length <= lastCount) return 1
  return 0
}
```

`stores/history.ts`：`load()` 改用 `detectEviction(...)`；新增并导出：

```ts
  /** 清空历史后调用：把基准置回「空」，下一次刷新不许判成淘汰 */
  function resetEvictionBaseline(): void {
    lastOldestId = null
    lastCount = 0
    evictedNotice.value = 0
    tasks.value = []
  }
```

`stores/task.ts`：

```ts
export type ConfirmKind = 'rename' | 'undoOne' | 'undoAll' | 'clear' | 'clearHistory'

export interface ConfirmContext {
  kind: ConfirmKind
  title: string
  body: string
  /** P2-C：危险操作（清空历史）用 danger 主按钮 */
  danger?: boolean
  /** P2-C：红色警告块文案（EX-17）*/
  warning?: string
  /** P2-C：覆盖默认主按钮文案（清空 / 仍然清空）*/
  confirmLabel?: string
}
```

新增 `askClearHistory()`（照 `askUndoAll` 的写法）：

```ts
  /**
   * IX-101：清空历史记录。**分两支**（EX-17）——
   * 有「可撤销」任务时必须额外警告，否则用户会永久丢数据。
   */
  function askClearHistory(): void {
    const n = history.tasks.length
    const undoable = history.undoableSummary.taskCount
    confirmContext.value = {
      kind: 'clearHistory',
      title: '清空历史记录',
      body:
        `将删除全部 ${n} 条改名记录。\n` +
        '文件本身不会被删除，也不会被改名。',
      warning:
        undoable > 0
          ? `其中 ${undoable} 条改名记录仍然可以撤销。清空后这 ${undoable} 条将无法再还原 —— 只能手动把文件名改回去。`
          : undefined,
      danger: true,
      confirmLabel: undoable > 0 ? '仍然清空' : '清空',
    }
  }
```

`confirmYes()` 里加一个分支（照 `kind === 'clear'` 那段写）：

```ts
    if (ctx.kind === 'clearHistory') {
      const res = await window.maodie.history.clear()
      if (!res.ok) {
        setStatusOverride('清空没成功，稍后再试试')
        return
      }
      history.resetEvictionBaseline()
      setStatusOverride(`已清空全部 ${res.data.cleared} 条历史记录，文件未被改动`)
      return
    }
```

`ConfirmModal.vue`：正文支持换行 + 警告块 + danger 主按钮 + 文案覆盖

```vue
    <p class="md-confirm__body">{{ ctx.body }}</p>
    <!-- EX-17：有可撤销任务时的红色警告块 -->
    <p v-if="ctx.warning" class="md-modal__warn">{{ ctx.warning }}</p>
    <template #foot>
      <button class="md-btn md-btn--secondary" @click="task.confirmNo()">
        {{ ctx.kind === 'rename' ? '再改改' : '取消' }}
      </button>
      <button
        class="md-btn"
        :class="ctx.danger ? 'md-btn--danger' : 'md-btn--primary'"
        @click="task.confirmYes()"
      >{{ ctx.confirmLabel ?? confirmLabel }}</button>
    </template>
```

`HistoryView.vue` 的 footer 改成 spread（左说明 + 右清空按钮）：

```vue
    <footer class="md-history__foot md-history__foot--spread">
      <p class="md-hint">…原有保留规则说明原文不动…</p>
      <!-- EL-113 清空历史记录：全软件唯一「删用户数据」的操作，故用幽灵危险按钮 -->
      <button
        class="md-btn md-btn--ghost-danger"
        :disabled="history.tasks.length === 0 || task.running"
        @click="task.askClearHistory()"
      >清空历史记录</button>
    </footer>
```

`base.css` 新增（**只用令牌，不得出现色值**）：

```css
/* ── P2-C：清空历史（EL-113）幽灵危险按钮 ───────────────────────────── */
.md-btn--ghost-danger {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--md-radius-input);
  background: transparent;
  color: var(--md-bad);
  font-size: 12.5px;
  font-weight: 500;
}
.md-btn--ghost-danger:hover:not(:disabled) { background: var(--md-bad-bg); }
.md-btn--ghost-danger:disabled { color: var(--md-line-strong); background: transparent; }

/* 历史页页脚：左说明 + 右按钮（EL-113 位置，设计 §2.2）*/
.md-history__foot--spread {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--md-space-3);
}

/* ── P2-C：确认弹窗里的红色警告块（EX-17）──────────────────────────── */
.md-modal__warn {
  margin: var(--md-space-4) 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--md-bad-bg);
  color: var(--md-bad);
  font-size: 12.5px;
  line-height: 19px;
}
```

- [ ] **Step 4: 跑测试 + 护栏** → `npm run test:core` PASS；`npm run lint` 0 错 0 警告
- [ ] **Step 5: Commit**（消息里写明「本批最容易漏的一条：清空后的淘汰假警报」）

---

### Task 4: 历史明细展开（EL-111 / EL-112 / IX-100）

**Files:** Modify `src/renderer/src/components/HistoryCard.vue`、`src/renderer/src/styles/base.css`（或组件内 scoped）

**Interfaces:** Consumes `visibleDetailRows` / `hiddenDetailText`（Task 1）

- [ ] **Step 1: 写失败的测试** —— 明细渲染上限已在 Task 1 覆盖（纯函数层）。这里补一条「已撤销卡片也能展开」的**冒烟**用例，放到 Task 7。
- [ ] **Step 2: 写实现**

`HistoryCard.vue` 的 `<script setup>` 增加：

```ts
const open = ref(false)                                   // 纯 UI 状态，不进数据模型、不进 IPC
const detail = computed(() => visibleDetailRows(props.task.entries))
const moreText = computed(() => hiddenDetailText(detail.value.hidden, detail.value.total))
```

模板里在「首条示例」`<p>` **之后**、`actions` **之前**插入：

```vue
    <!-- EL-111 明细展开条（每条卡片各自独立、不联动）-->
    <button
      v-if="task.entries.length > 0"
      class="md-detail__bar"
      :class="{ 'md-detail__bar--open': open }"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="md-detail__caret" :class="{ 'md-detail__caret--open': open }" aria-hidden="true" />
      <span class="md-detail__label">{{ open ? '收起' : `查看全部 ${task.entries.length} 项` }}</span>
    </button>

    <!-- EL-112 明细列表（最多渲染 100 条）-->
    <div v-if="open" class="md-detail__list md-scroll">
      <p v-for="r in detail.rows" :key="r.index" class="md-detail__row">
        <span class="md-detail__no">{{ r.index }}</span>
        <span class="md-detail__pair">{{ r.fromName }} → {{ r.toName }}</span>
      </p>
      <p v-if="detail.hidden > 0" class="md-detail__more">{{ moreText }}</p>
    </div>
```

样式（scoped，规格取自设计 §1.3：容器 `bg-sunken` / 圆角 10 / 内边距 8×10 / 最大高 220 滚动 / 行高 26 / 序号 Inter 11.5 `ink-4` 宽 20 右对齐 / 正文 12.5 `ink-2`）；箭头照 `RulePanel.vue:546` 的 `.md-adv__caret` 三角写法（`border-top: 5px solid currentColor`，`--open` 时 `rotate(180deg)`），展开后 `color: var(--md-orange-dark)`。

- [ ] **Step 3: 目视 + 冒烟** —— 跑 `npm run build` 后由 Task 7 的冒烟覆盖 TC-33/TC-34
- [ ] **Step 4: Commit**

---

### Task 5: 设置弹窗的命令行入口（EL-114 / EL-115 / EL-116 / IX-102 / IX-103）

**Files:** Modify `src/renderer/src/components/SettingsModal.vue`、`src/renderer/src/styles/base.css`

**Interfaces:** Consumes `getAppInfo().execPath`；`navigator.clipboard.writeText`

- [ ] **Step 1: 写实现**

`SettingsModal.vue` 里加第 4 项（`<script setup>` 补）：

```ts
import { onMounted, ref } from 'vue'
const appInfo = ref<AppInfo | null>(null)
const cliOpen = ref(false)     // 纯 UI 状态（IX-102），不写任何偏好
onMounted(async () => {
  const res = await window.maodie.app.getInfo()
  if (res.ok) appInfo.value = res.data
})

/** 示例命令：只给一条（决策 4），并带上本机完整程序路径 */
const cliCommand = computed(() => {
  const exe = appInfo.value?.execPath ?? 'maodie.exe'
  return `${exe} --rename --dir "D:\\下载\\素材" --delete "广告" --yes`
})

async function copy(text: string, what: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  task.setStatusOverride(`${what}已复制`)      // 复用既有提示位，不弹窗（IX-103）
}
```

模板加在「减少动画」行之后：

```vue
      <!-- EL-114 命令行（P2-C）。折起 / 展开是纯 UI 状态 -->
      <div class="md-settings__row">
        <button class="md-cli__bar" :class="{ 'md-cli__bar--open': cliOpen }"
                :aria-expanded="cliOpen" @click="cliOpen = !cliOpen">
          <span class="md-settings__label">命令行</span>
          <span class="md-cli__caret" :class="{ 'md-cli__caret--open': cliOpen }" aria-hidden="true" />
        </button>
      </div>
      <div v-if="cliOpen" class="md-cli__body">
        <p class="md-cli__desc">给进阶用户用脚本批量改名。在命令行（或 .bat 文件）里跑下面这条：</p>
        <p class="md-cli__code">{{ cliCommand }}</p>
        <div class="md-cli__btns">
          <button class="md-btn md-btn--secondary" @click="copy(cliCommand, '命令')">复制命令</button>
          <button class="md-btn md-btn--secondary" @click="copy(appInfo?.execPath ?? '', '程序路径')">复制程序路径</button>
        </div>
        <p class="md-cli__hint">「复制命令」会自动带上你机器上的完整程序路径。</p>
      </div>
```

样式按设计 §3.2：展开块底 `bg-warm` 圆角 10 内边距 12；代码块底 `bg-sunken` 圆角 10 内边距 10×12、Inter 11.5 Medium `ink-1`、**可横向滚动不换行**；小字 11.5 `ink-4`。

- [ ] **Step 2: 护栏** → `npm run typecheck` + `npm run lint`；再跑 TC-32 单测确认没有新增硬编码色值
- [ ] **Step 3: Commit**

---

### Task 6: 真正可用的命令行模式

**Files:**
- Create: `src/main/cli/run.ts`（**不 import electron**）、`src/main/cli/index.ts`
- Modify: `src/main/index.ts`
- Test: `tests/p2c.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parseCliArgs` / `isCliInvocation` / `CLI_USAGE`；`resolvePaths`（`@main/services/fs-scan`）、`buildPreview`（`@shared/preview`）、`execute`（`@main/services/rename-executor`）、`initStorage/loadHistory`、`appendTask/buildTask`（history-store）、`buildRuleSummary`（`@shared/rule-summary`）
- Produces:
  - `runCli(argv: string[], deps: { out: (s: string) => void; err: (s: string) => void; userDataDir: string }): Promise<number>`
  - `maybeRunCliAsMain(): boolean`（Electron 侧：判断 + 跑 + 退出）

- [ ] **Step 1: 写失败的测试（跑真临时目录，不 mock）**

```ts
test('CLI：不带 --yes 只打印不改名；带 --yes 才真改且写入历史', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'md-cli-'))
  await fsp.writeFile(path.join(dir, '发票 广告.txt'), 'x')
  const logs: string[] = []

  // ① dry-run：文件不动
  let code = await runCli(['--rename', '--dir', dir, '--delete', '广告'], { out: (s) => logs.push(s), err: () => {}, userDataDir: dir })
  assert.equal(code, 0)
  assert.ok(logs.join('\n').includes('dry-run'), '必须明确告诉用户「不会改动任何文件」')
  assert.ok((await fsp.readdir(dir)).includes('发票 广告.txt'), 'dry-run 不许改文件')

  // ② --yes：真改
  logs.length = 0
  code = await runCli(['--rename', '--dir', dir, '--delete', '广告', '--yes'], { out: (s) => logs.push(s), err: () => {}, userDataDir: dir })
  assert.equal(code, 0)
  const names = await fsp.readdir(dir)
  assert.ok(names.includes('发票.txt'), `应已改名，实际：${names.join(',')}`)
  assert.ok(!names.includes('发票 广告.txt'))
  assert.equal(listTasks().length, 1, '★ CLI 改名必须写入历史，否则界面里撤不回来')
  await fsp.rm(dir, { recursive: true, force: true })
})

test('CLI：参数错时退出码 2，且不碰任何文件', async () => {
  const errs: string[] = []
  const code = await runCli(['--rename', '--delete', 'x'], { out: () => {}, err: (s) => errs.push(s), userDataDir: '' })
  assert.equal(code, 2)
  assert.ok(errs.join('\n').includes('--dir'))
})
```

- [ ] **Step 2: 跑测试确认失败** → FAIL：`runCli is not a function`

- [ ] **Step 3: 写实现**

`src/main/cli/run.ts` 结构（照 `scripts/cli-verify.ts` 的成熟做法改参数名与出口）：

```ts
/**
 * 命令行模式核心（P2-C · F-15）。
 *
 * ★ 本文件**不 import electron** —— 所以 `node --test` 能直接跑它，
 *   不需要启动界面就能验「命令行的安全底线」。
 *
 * 安全底线（与界面完全一致，逐条对应）：
 *   1. 不传 --yes 一律 dry-run，**不碰任何文件**（命令行没有预览界面）
 *   2. 真执行复用主进程的 `execute()` → 与界面同一套两阶段改名 / 扩展名保护 / 冲突跳过
 *   3. 改名写入历史记录 → 能在界面的历史页里撤销
 * 退出码：0 = 成功（含 dry-run）；1 = 有失败项；2 = 参数错
 */
export async function runCli(argv, deps): Promise<number> {
  const parsed = parseCliArgs(argv)
  if (parsed.ok === false) { deps.err(`参数有问题：${parsed.error}\n\n${CLI_USAGE}`); return 2 }
  const o = parsed.options
  initStorage(deps.userDataDir)
  await loadHistory()
  // …读目录直接子项（不递归，DEC-01）→ resolvePaths → buildPreview → 打印表格…
  if (!o.yes) { deps.out('\n[dry-run] 不会改动任何文件。确认无误后加 --yes 真正执行。'); return 0 }
  // …execute() → appendTask() → 打印统计…
  return result.summary.failed > 0 ? 1 : 0
}
```

`src/main/index.ts` —— **改在取锁之前**（GAP-2：否则开着界面时命令行会静默什么都不做）：

```ts
/* ── 0. 命令行模式分流（P2-C · F-15）────────────────────────────────────
   ★ 必须在取单实例锁**之前**：否则用户开着界面时再跑命令行，
     第二个实例会拿不到锁直接 quit —— 命令静默什么也不做，还没有任何提示。
   取锁失败时的提示由 CLI 自己给（见 cli/index.ts）。 */
const cliArgs = process.argv.slice(app.isPackaged ? 1 : 2)
if (isCliInvocation(cliArgs)) {
  void runCliAsMain(cliArgs)     // 内部：跑完 app.exit(code)
} else {
  /* …原有的 setPath / 单实例锁 / bootstrap 流程原样不动… */
}
```

`src/main/cli/index.ts`：

```ts
export async function runCliAsMain(argv: string[]): Promise<void> {
  await app.whenReady()
  // 与界面互斥：拿不到锁说明界面正开着 —— 明确告知并退出，绝不并发写 history.json
  if (!app.requestSingleInstanceLock()) {
    console.error('检测到「耄耋改名」正在运行。请先关闭窗口再使用命令行模式。')
    app.exit(2)
    return
  }
  const code = await runCli(argv, {
    out: (s) => process.stdout.write(s + '\n'),
    err: (s) => process.stderr.write(s + '\n'),
    userDataDir: /* 与 main/index.ts 同一处 app.setPath('userData', …) 的取值 */ join(app.getPath('appData'), USER_DATA_DIR_NAME),
  })
  app.exit(code)
}
```

> ★ 注意 `userData` 路径必须与主程序**完全一致**（同一个 `USER_DATA_DIR_NAME`），否则命令行改完的文件在界面里撤不回来。

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: 手工冒烟（真实 exe 调用路径）**

```bash
cd maodie-renamer && npm run build
# dry-run：跑完必须打印 [dry-run] 且文件不动
node_modules/electron/dist/electron.exe . --rename --dir "<临时目录>" --delete "广告"
# 真执行
node_modules/electron/dist/electron.exe . --rename --dir "<临时目录>" --delete "广告" --yes
# 参数错：退出码 2
node_modules/electron/dist/electron.exe . --rename --delete "x"; echo "exit=$?"
```

Expected：dry-run 打印表格且 `[dry-run]`；`--yes` 后文件名真的变了；参数错时 `exit=2` 且打印中文原因。

- [ ] **Step 6: Commit**

---

### Task 7: 真实界面冒烟（TC-33 ~ TC-37）+ 命令行回归

**Files:** Modify `tools/smoke.js`、`tests/smoke/helpers.js`（按需）

- [ ] **Step 1: 加用例**（照既有 21~28 条的写法，**真实点击 + 读渲染后的真值**）

| 新用例 | 关键断言（不采信 class，要读真值）|
| --- | --- |
| TC-33 明细展开 | 点「查看全部 N 项」→ 明细行数 = N（≤100）；读**算出来的容器 `max-height` = 220px**；点「收起」后明细消失 |
| TC-33b 已撤销卡片也能展开 | 先撤一条，再展开它 → 明细仍在 |
| TC-34 渲染上限 | 预置一个 5000 条的历史记录（写进隔离的 userData 的 `history.json`）→ 展开 → 断言渲染行数 = 100 且末行文案 = 「还有 4900 项未显示（共 5000 项）」 |
| TC-35 清空·无警告 | 全部撤销后点清空 → 弹窗里**不存在**警告块；主按钮文案 = 「清空」 |
| TC-36 清空·安全阀 | 存在可撤销任务 → 点清空 → 警告块存在且文案含「仍然可以撤销」；主按钮文案 = 「仍然清空」；读**算出来的主按钮背景色 = `rgb(229, 84, 75)`**（`--md-bad`）|
| TC-37 清空后不误报 | 点「仍然清空」→ 列表走空态；状态栏文案 = 「已清空全部 N 条历史记录，文件未被改动」；**且状态栏里不出现「较旧的记录已被清理」** |
| 附·清空不碰文件 | 清空前记下样本文件的名字与 mtime，清空后逐条比对不变 |
| IX-103 复制命令 | 点「复制命令」→ 读剪贴板内容，断言**包含 `--rename` 与 `--yes`**，且以真实程序路径开头 |

- [ ] **Step 2: 跑冒烟**

```bash
cd maodie-renamer && npm run build
unset ELECTRON_RUN_AS_NODE && node_modules/electron/dist/electron.exe tools/smoke.js
```

Expected：既有 29 条不回归 + 新增 8 条全绿；报告落在 `tests/artifacts/<UTC 时间戳>/report.html`

- [ ] **Step 3: 命令行回归**（Task 6 Step 5 的命令重跑一遍，确认打包产物路径没退化）
- [ ] **Step 4: Commit**

---

### Task 8: 文档同步（改上游必须同步下游）

**Files:** Modify `接口文档.md`、`P2-C轻量设计确认.md`、`交互说明文档.md`、`PRD.md`、`技术方案文档.md`、`需求清单.md`、`设计规范.md`

- [ ] **Step 1: `接口文档.md` 补 CLI 契约**（这是本批**新定的契约**，GAP-1 的修复）

新增一节「命令行模式」，内容 = Task 1 的 `CLI_USAGE` 逐字（参数表、`--yes` 默认只读、退出码 0/1/2、`--delete`≡`--replace`≡前后缀三选一互斥、`--regex` / 大小写、`--auto-seq` / `--case-sensitive`），并写明：
- CLI 与界面**同一套**执行器与安全底线；CLI 改名**写入历史**（可在界面撤销）
- 界面互斥：界面开着时 CLI 拒绝运行（退出码 2）
- `AppInfo.execPath` 的用途与「未打包时该路径不可直接使用」的限制

- [ ] **Step 2: 改掉 `P2-C轻量设计确认.md` 里那两处与代码不符的地方**
① §1.3「无变化的行 → 追加（无变化）」标注为**不实现**（`entries` 只记成功项，是死分支）；
② §9 取舍 4「CLI 语法是草案」改为「**已定稿**」（指向接口文档新增节），并补 §12 落地记录。

- [ ] **Step 3: 其余文档**：`交互说明文档.md` §12 那行「—（CLI 本身的验收随接口文档定稿）」换成 **TC-38 CLI 安全底线**；`PRD.md` §10 增 `TC-38`；`技术方案文档.md` §11 遗留项 13 标「已落地」；`需求清单.md` F13/F15 标已落地；`设计规范.md` §5.3 / §5.5 对齐实际渲染（明细容器 220px、命令行块 padding）。

- [ ] **Step 4: Commit**

---

### Task 9: 交付前的完整验证与推送

- [ ] **Step 1:** `npm run typecheck` → 0 错
- [ ] **Step 2:** `npm run lint` → 0 错 0 警告
- [ ] **Step 3:** `npm run test:core` → 全绿（P1 18 + P2-A 9 + P2-C 新增）
- [ ] **Step 4:** `npm run build` + 冒烟 → 全绿，报告留档
- [ ] **Step 5:** 在 `P2-C轻量设计确认.md` 写落地记录（含**「哪些没验到」**：打包后的 exe 在 PowerShell / cmd / Git Bash 下的参数解析差异、未打包时 `execPath` 不可用、不同终端引号转义）
- [ ] **Step 6:** 提交 → `git switch main` → `git merge --no-ff fix` → **推送用绕法**：

```bash
git -c credential.helper= -c credential.helper=manager push origin main
```

- [ ] **Step 7:** `git switch fix && git merge --ff-only main`；每步之后 `git status --porcelain` 数一遍（防沙箱吞文件）

---

## Self-Review

**Spec coverage：** §1 明细 → Task 1/4/7；§2 清空（含 §2.3 安全阀 / §2.4 danger / §2.5 清空后行为 / §2.6 淘汰基准） → Task 1/2/3/7；§3 命令行入口 → Task 5/7；§3.3 CLI 本体 → Task 1/6/7/8；§4 通道与字段 → Task 1/2；§5 编号 → 全程；§6 TC-33~37 → Task 7；§7 测试要求 → Task 1~7；§8 待同步文档 → Task 8。

**Placeholders：** 无 TBD；`history-store.ts` 里保存列表的变量名与 `buildRuleSummary` 的导出路径在实现时按真实文件核对（已在步骤里写明「照它的真实形状写」）。

**Type consistency：** `visibleDetailRows` / `hiddenDetailText` / `detectEviction` / `parseCliArgs` / `isCliInvocation` / `runCli` / `clearAllTasks` / `resetEvictionBaseline` / `askClearHistory` 的签名在定义处与调用处一致；`ClearHistoryResult.cleared` 在 IPC 返回、store 消费、状态栏文案三处同名。
