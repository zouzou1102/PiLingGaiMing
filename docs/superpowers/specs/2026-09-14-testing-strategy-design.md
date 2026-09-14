# 耄耋改名 · 测试体系设计

- **日期**：2026-09-14
- **状态**：设计已口头确认，待评审后进入实施计划
- **范围**：测试体系重构 —— 由第三方框架 Vitest 迁移到运行时内置能力（`node --test` + Electron 真实窗口冒烟）
- **关联文档**：`技术方案文档.md`（§10 ADR 的测试相关条目、§测试策略，**待同步**）、`PRD.md` §10 验收用例 TC-01~TC-18

---

## 1. 背景与目标

项目已进入 P0 功能收尾、准备真机验收的阶段。此前测试依赖第三方框架 Vitest（213 个用例，分 `tests/unit`、`tests/integration`、`tests/renderer` 三摊）。新的测试规范要求：**不引入任何第三方测试框架**，改用运行时内置能力，并补一层驱动真实窗口的端到端冒烟。

目标：
1. 单测用 `node --test` + `node:assert`，用例放 `tests/*.test.js`。
2. 界面/集成用端到端冒烟：启动真实 Electron 实例（`electron tools/smoke.js`）驱动真实窗口，不 mock 界面。
3. 业务逻辑只保留一份源码，单测与界面共用，禁止为测试另写实现。
4. 断言只认用户可见结果，测试挂了如实报告原始报错。

## 2. 约束（规范原文，作为验收依据）

- **不引入第三方测试框架**（不用 Jest / Vitest / Mocha / Playwright / Cypress）。
- **分两层自动化**：A 纯逻辑 → 单测；B 界面/集成 → 端到端冒烟。
- **共一份代码**：业务逻辑只写一份，单测与界面共用；禁止为测试另写实现。
- **冒烟必须做到**：① 隔离（临时目录/临时配置，绝不读写真实用户数据）；② 真实交互（发真实输入事件，Electron 用 `sendInputEvent` 的 `mouseDown`/`mouseUp` 按坐标点，不直接调内部函数）；③ 时间相关断言轮询到状态变化为止，不 sleep 固定时长；④ 兜底监听 console 报错、资源加载失败、预加载报错并打印原始信息。
- **断言纪律**：只断言用户能看到的结果（颜色/尺寸读 `getComputedStyle` 实际值；资源等 `load` 事件真的完成）；**绝不为让测试变绿而放宽、跳过或删掉断言**；测试挂了如实说并给原始报错。
- **看不到的副作用用 spy 观察**（如替换 `window.Audio` 记录播放的文件名与音量），**不往生产代码加测试钩子**。
- **每次交付报告**：① 单测通过 x/x、冒烟通过 y/y，及失败原始报错；② 明确说出没验到的情况（打包后路径、真机行为等）。

## 3. 现状与冲突

| 维度 | 项目现状 | 新规 |
|---|---|---|
| 框架 | Vitest + `@vitest/coverage-v8`（devDependencies） | 不用任何第三方测试框架 |
| 命令 | `npm test` = `vitest run` | `node --test` |
| 用例 | `tests/unit/*.spec.ts`、`tests/integration/*.spec.ts`、`tests/renderer/*.spec.ts`，共 213 个 | `tests/*.test.js` |
| 语言 | TypeScript（`.spec.ts`） | `.js` |
| 冒烟 | 无 | `tools/smoke.js`（Electron 真实窗口） |

**已确认的两项决策**：
1. **现有 213 个用例：分阶段迁移** —— 先立新能力，再逐批改写，全部迁完后移除 Vitest。
2. **被测逻辑：保持 TS 源码** —— `src/shared/` 仍是唯一那份 TS，不引入 UMD；加一个最小编译步骤产出 JS 供 `node --test` 引用。

**"一份代码"的现状澄清**：`src/shared/`（规则引擎 / 冲突检测 / 扩展名保护 / 校验器 / 差异高亮等纯函数）已经是唯一源码，主进程与渲染层都从它构建而来。**"禁止另写一份实现"这条当前已满足**，本次不改变这一事实。

## 4. 设计

### 4.1 总体架构

```
        ┌─────────────────────────── src/shared/  (TS，唯一源码) ───────────────────────────┐
        │   rule-engine · conflicts · name-split · validator · diff-range · preview · …      │
        └───────────┬───────────────────────────────────────────────────┬────────────────────┘
                    │ 编译（scripts/build-core.mjs）                     │ 构建（electron-vite，既有）
                    ▼                                                    ▼
        .test-build/  (JS) ──引用──▶ tests/*.test.js  (node --test)     主进程 / 渲染层 (既有产物)
                                                                         │
                                                                         ▼
                                                    tools/smoke.js  (electron 真实窗口 · sendInputEvent)
```

### 4.2 单测层（A）

- 运行器：`node --test`，断言：`node:assert/strict`。
- 用例位置：`tests/*.test.js`。
- 被测对象：**同一份 `src/shared/` 源码**，经 `scripts/build-core.mjs` 编译为 JS 后引用。不开小灶、不复制实现。
- `scripts/build-core.mjs` 用项目已装的 TypeScript（`tsc`）编译 `src/shared` 到 `.test-build/`（ESM），只做编译，不引入任何测试框架。
- 命令：`npm run test` = `node scripts/build-core.mjs && node --test tests/`。

### 4.3 冒烟层（B）

- 入口：`tools/smoke.js`，以 Electron 主进程脚本方式运行：`electron tools/smoke.js`（复用已装的 electron 二进制）。
- **隔离**：`app.setPath('userData', <临时目录>)`；被测文件放 `os.tmpdir()` 下的一次性目录；退出时清理。绝不读写 `%APPDATA%\MaoDieRenamer` 的真实数据。
- **真实交互**：创建真实 `BrowserWindow` 加载真实界面（开发构建 `out/renderer`），通过 `webContents.sendInputEvent` 发 `mouseDown`/`mouseUp`（按坐标点），经真实事件链触发，**不直接调用内部函数**（以抓出"被别的元素挡住点不到"）。
- **轮询断言**：`pollUntil(fn, { timeout })` 轮询到条件成立为止，不 sleep 固定时长再比一次。
- **兜底监听**：捕获 `console-message`、`did-fail-load`、`render-process-gone`、preload 报错，失败即打印原始信息。
- **副作用 spy**：通过 `webContents.executeJavaScript` 在渲染层替换 `window.Audio` 记录播放的文件名与音量；**不修改生产代码**。

### 4.4 命令约定

| 命令 | 作用 | 生命周期 |
|---|---|---|
| `npm run test` | 单测（`node --test`，迁移期指向 `.test.js`） | 长期 |
| `npm run smoke` | 冒烟（`electron tools/smoke.js`） | 长期 |
| `npm run test:legacy` | 现有 213 个 Vitest 用例 | **过渡期临时**，迁完删除 |

### 4.5 目录结构（新增部分）

```
maodie-renamer/
├─ scripts/build-core.mjs   # 编译 src/shared → .test-build/（仅供 node --test 引用）
├─ tests/*.test.js          # 新单测（node --test）
├─ tools/smoke.js           # Electron 真实窗口冒烟
└─ （现有 tests/**/*.spec.ts 过渡期保留，逐批迁完即删）
```

## 5. 分阶段落地

1. **阶段 1（本轮）——搭骨架**：`scripts/build-core.mjs` + 1 个示例单测（打通 `node --test` 通路）+ `tools/smoke.js` 第一版（启动 + 真实点一个按钮）+ npm 脚本。现有 Vitest 原样保留，可随时回退。
2. **阶段 2**：`tests/unit/*.spec.ts`（9 个）逐个改写为 `.test.js`，迁一个删一个。
3. **阶段 3**：迁移 `tests/integration/*.spec.ts`（3 个）+ `tests/renderer/*.spec.ts`（1 个）。
4. **阶段 4**：移除 `vitest` / `@vitest/coverage-v8` 依赖与相关脚本；同步更新 `技术方案文档.md` 的测试策略与 ADR，更新项目回归基线。

每阶段独立可验证、可停可回退；不一次性推倒。

## 6. 断言纪律与副作用观察（实施红线）

- 断言读**渲染后的实际值**（`getComputedStyle` 的颜色/尺寸），不只断言 class 有没有加上。
- 资源类断言等**真实加载完成**（图片 `load` 事件），不只看变量里有没有那个字符串。
- 时间相关一律轮询，不 sleep。
- 幕后效果用 spy，不往生产代码加钩子。
- **绝不为让测试变绿而放宽、跳过或删除断言**。测试挂了如实说 + 给原始报错。

## 7. 交付报告格式（每阶段固定输出）

```
单测：x/x 通过     冒烟：y/y 通过
失败项原始报错：（如有，逐条贴原始输出）
本次未覆盖：（如打包后 exe、真机行为、需人工目视的项）
```

## 8. 已知未覆盖范围（诚实声明）

- 冒烟跑的是**开发构建**（`out/`），**打包后的 exe 路径**覆盖不到。
- **真机行为**（不同 Windows 版本、显示缩放、系统拖拽协议）覆盖不到，需人工真机验证。
- 需人工目视判断的（猫咪形象好不好看、动效观感）无法自动断言。

## 9. 风险与待办

- 迁移期两套测试并存（`test` 与 `test:legacy`），需避免"忘了迁"的半途状态；以阶段 4 移除 Vitest 为终点。
- `scripts/build-core.mjs` 采用的编译方式需在阶段 1 落实并验证（TS → ESM，路径与 `.spec.ts` 的既有引用方式对齐）。
- 技术方案文档 ADR 目前锁定 Vitest，阶段 4 必须同步修订，避免文档与实现背离。
