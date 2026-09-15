/**
 * F-10 正则的「小白化」示例数据（照抄表 + 演示样本）。
 *
 * 为什么放 `shared/` 而不是组件里：这张照抄表**必须可验证** ——
 * 每一行的「结果」都由 `rule-engine` 真算一遍（见 `tests/p1-rules.test.ts`）。
 * 文案写在组件里就成了没法验证的死字，写歪了（比如换了引擎行为）没人会发现。
 * 放这里 = 一份数据两处用：界面照着渲染，单测照着校验。
 *
 * 与本文件同性质的先例：`labels.ts`（枚举 → 中文标签）。
 * 纪律：不 import electron / fs / path（shared 层铁律）。
 */

import type { RuleMode } from './types'

export interface RegexCheatRow {
  /** 「我想做的事」—— 大白话，不出现任何术语 */
  goal: string
  /** 这个写法在哪些模式里出现。删除模式**没有**「替换框」，所以行必须按模式过滤 */
  modes: RuleMode[]
  /** 查找框里填什么 */
  find: string
  /** 替换框里填什么；空串 = 留空，效果等于「删掉」。
   *  不变式：凡是含 `delete` 的行，`to` 必须为空串（单测会把这条钉住）*/
  to: string
  /** 举例：原名主体（不含扩展名）*/
  sampleFrom: string
  /** 按上面 find / to 处理后应该得到的结果（单测会把这一行真跑一遍）*/
  sampleTo: string
}

/**
 * 照抄表：最常见的改名场景，按模式分。
 *
 * 顺序有意为之 —— **删除模式的行排在前**：删除是默认页签，
 * 新手打开时最可能就停在这里，先给他能直接用的。
 */
export const REGEX_CHEATSHEET: RegexCheatRow[] = [
  {
    goal: '干掉日期（连横杠一起）',
    modes: ['delete'],
    find: '\\d{4}-\\d{2}-\\d{2}',
    to: '',
    sampleFrom: '2026-08-01发票',
    sampleTo: '发票',
  },
  {
    goal: '干掉【】连同里面的字',
    modes: ['delete', 'replace'],
    find: '【.*?】',
    to: '',
    sampleFrom: '【待整理】合同',
    sampleTo: '合同',
  },
  {
    goal: '干掉所有数字',
    modes: ['delete'],
    find: '\\d+',
    to: '',
    sampleFrom: '第3批2026报告',
    sampleTo: '第批报告',
  },
  {
    goal: '日期改成「年月日」',
    modes: ['replace'],
    find: '(\\d{4})-(\\d{2})-(\\d{2})',
    to: '$1年$2月$3日',
    sampleFrom: '发票 2026-08-01',
    sampleTo: '发票 2026年08月01日',
  },
  {
    goal: '删掉日期里的横杠',
    modes: ['replace'],
    find: '(\\d{4})-(\\d{2})-(\\d{2})',
    to: '$1$2$3',
    sampleFrom: '发票 2026-08-01',
    sampleTo: '发票 20260801',
  },
  {
    goal: '数字全换成一个 #',
    modes: ['replace'],
    find: '\\d+',
    to: '#',
    sampleFrom: '发票 2026-08-01',
    sampleTo: '发票 #-#-#',
  },
]

/**
 * 当场演示用的固定示例文件名。
 *
 * 为什么不用列表里的真实文件：教学示例要**保证看得出变化**。
 * 真实文件不一定匹配得上当前写法，那时演示区一片未变化，反而更让人懵；
 * 列表里本来就有真实名字的对照，那是另一份「演示」。
 */
export const REGEX_DEMO_FILE = '发票 2026-08-01.pdf'
