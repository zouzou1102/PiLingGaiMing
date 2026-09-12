/**
 * 名称拆分与扩展名保护（技术方案 §4.1.1 / PRD §4.2.4 的 EX-07 全细则）。
 *
 * **扩展名一律不参与任何规则** —— 这是默认行为，不是开关（EX-07 已是 P0）。
 * `joinName` 永远把 ext 原样拼回，是本机制的最后一道实现。
 */

export interface NameParts {
  /** 规则作用的主体 */
  stem: string
  /** 扩展名，含点；无扩展名时为空串 */
  ext: string
}

/**
 * 拆分名称主体与扩展名。
 *
 * | 输入 | isDir | stem | ext |
 * | --- | --- | --- | --- |
 * | `报告.docx` | false | `报告` | `.docx` |
 * | `IMG_0001.JPG` | false | `IMG_0001` | `.JPG`（大小写原样保留）|
 * | `我的.备份.tar.gz` | false | `我的.备份.tar` | `.gz`（只切最后一个点）|
 * | `.gitignore` | false | `.gitignore` | ``（点在开头 → 不视为扩展名）|
 * | `README` | false | `README` | `` |
 * | `文件夹名.2026` | true | `文件夹名.2026` | ``（文件夹不拆分）|
 * | `.env.local` | false | `.env` | `.local`（点不在开头，是常规扩展名）|
 * | `报告.` | false | `报告.` | ``（结尾点不算扩展名，本方案补足）|
 * | `a.b.c.` | false | `a.b.c.` | ``（同上）|
 * | `报告．docx`（全角点）| false | `报告．docx` | ``（全角点不是路径分隔符语义）|
 */
export function splitName(name: string, isDir: boolean): NameParts {
  // 1. 文件夹无扩展名概念，规则作用于完整名称
  if (isDir) return { stem: name, ext: '' }

  const idx = name.lastIndexOf('.')

  // 2. 无点，或点在开头（如 .gitignore）→ 整名都是主体
  if (idx <= 0) return { stem: name, ext: '' }

  // 3. 点在结尾（如 `报告.`）→ `.后无内容` 不算扩展名
  if (idx === name.length - 1) return { stem: name, ext: '' }

  // 4. 常规情形：只切最后一个点
  return { stem: name.slice(0, idx), ext: name.slice(idx) }
}

/** 把主体与扩展名拼回完整名称。扩展名原样拼回 —— 扩展名保护的最后一步 */
export function joinName(stem: string, ext: string): string {
  return stem + ext
}
