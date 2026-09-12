/**
 * 校验器（技术方案 §4.1.5 / 接口文档 §6）。
 *
 * 判定顺序严格按文档表格顺序短路返回：空名 → 非法字符/保留名 →
 * 结尾点或空格 → 路径过长。
 *
 * 其中「Windows 设备保留名」与「结尾点 / 空格」是 PRD 未覆盖、但会真实发生的
 * 边界：用户在删除规则里很容易把 `contract` 删成 `con`，若不提前拦截，
 * 这条会在**执行阶段**报一个难懂的 EPERM。提前到预览阶段拦截，用户能看见。
 */

import { INVALID_CHARS, MAX_PATH_SEGMENT_LEN, RESERVED_NAMES } from './constants'
import { MD_ERROR, type MdErrorCode } from './errors'
import { splitName } from './name-split'
import { fullPathLength } from './path-utils'

export interface ValidationResult {
  ok: boolean
  code?: MdErrorCode
  detail?: string
}

const INVALID_CHAR_RE = /[\\/:*?"<>|]/
// 这里必须匹配控制字符：Windows 文件名不允许 U+0000–U+001F，正是要拦截它们（EX-01）
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u001f]/

const MESSAGES = {
  invalidChars: `名称里不能包含 ${INVALID_CHARS.join(' ')}`,
  reserved: '这是系统保留名，换个名字吧',
  trailing: '名字不能以点或空格结尾',
} as const

/**
 * 校验「完整新名」在给定目录下是否合法。
 *
 * @param originalExt 该项**原本**的扩展名（含点）。它是判定「整体只剩扩展名」的
 *   唯一可靠依据 —— 单看名字本身无法区分下面两种情形：
 *     · `x.docx` 的主体被规则删光 → 新名 `.docx` → **应判空名**
 *     · 一个本来就叫 `.gitignore` 的文件 → 新名 `.gitignore` → **合法**
 *   两者在字符串层面完全同构，所以必须由调用方把原始扩展名带进来。
 */
export function validateNewName(
  newName: string,
  dirPath: string,
  originalExt = '',
): ValidationResult {
  // ① 空名：整体为空，或主体被删光、只剩原本的扩展名
  if (newName === '') return { ok: false, code: MD_ERROR.E_EMPTY_NAME }
  if (originalExt !== '' && newName === originalExt) {
    return { ok: false, code: MD_ERROR.E_EMPTY_NAME }
  }

  // ② 非法字符（含控制字符）
  if (INVALID_CHAR_RE.test(newName) || CONTROL_CHAR_RE.test(newName)) {
    return { ok: false, code: MD_ERROR.E_INVALID_CHAR, detail: MESSAGES.invalidChars }
  }

  // ③ Windows 设备保留名（复用 E_INVALID_CHAR，界面统一归入「非法」徽标）
  const { stem } = splitName(newName, false)
  if (RESERVED_NAMES.includes(stem.toUpperCase() as (typeof RESERVED_NAMES)[number])) {
    return { ok: false, code: MD_ERROR.E_INVALID_CHAR, detail: MESSAGES.reserved }
  }

  // ④ 结尾点 / 结尾空格
  if (newName.endsWith('.') || newName.endsWith(' ')) {
    return { ok: false, code: MD_ERROR.E_INVALID_CHAR, detail: MESSAGES.trailing }
  }

  // ⑤ 路径过长（保守阈值 255，见 constants.ts 的说明）
  if (fullPathLength(dirPath, newName) > MAX_PATH_SEGMENT_LEN) {
    return { ok: false, code: MD_ERROR.E_PATH_TOO_LONG }
  }

  return { ok: true }
}

/** 供测试与界面复用的文案（界面文案仍以 MD_ERROR_TEXT 为准）*/
export const VALIDATOR_MESSAGES = MESSAGES
