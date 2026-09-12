import { describe, expect, it } from 'vitest'
import { VALIDATOR_MESSAGES, validateNewName } from '@shared/validator'
import { MAX_PATH_SEGMENT_LEN } from '@shared/constants'

const DIR = 'C:\\Users\\PC\\Desktop'

describe('validator · 空名（EX-04 / U-10）', () => {
  it('U-10 改后名称为空 → E_EMPTY_NAME', () => {
    expect(validateNewName('', DIR)).toMatchObject({ ok: false, code: 'E_EMPTY_NAME' })
  })

  it('主体被删光、只剩原本的扩展名 → 也算空名', () => {
    expect(validateNewName('.docx', DIR, '.docx')).toMatchObject({ ok: false, code: 'E_EMPTY_NAME' })
    expect(validateNewName('.gz', DIR, '.gz')).toMatchObject({ ok: false, code: 'E_EMPTY_NAME' })
  })

  it('★ .gitignore 不是「只剩扩展名」：它本来就没有扩展名，整名是主体', () => {
    // 这正是 originalExt 必须由调用方传入的原因 ——
    // `.docx`（主体被删光）与 `.gitignore`（合法文件名）在字符串层面完全同构，
    // 单看名字根本无法区分
    expect(validateNewName('.gitignore', DIR, '').ok).toBe(true)
  })
})

describe('validator · 非法字符（EX-01）', () => {
  it.each([['a\\b.txt'], ['a/b.txt'], ['a:b.txt'], ['a*b.txt'], ['a?b.txt'], ['a"b.txt'], ['a<b.txt'], ['a>b.txt'], ['a|b.txt']])(
    '含非法字符 %s → E_INVALID_CHAR',
    (name) => {
      expect(validateNewName(name, DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
    },
  )

  it('控制字符（U+0000–U+001F）也算非法', () => {
    expect(validateNewName('a\u0000b.txt', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
    expect(validateNewName('a\tb.txt', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
  })

  it('非法字符的文案与技术方案 §4.1.5 一致', () => {
    const r = validateNewName('a?b.txt', DIR)
    expect(r.detail).toBe(VALIDATOR_MESSAGES.invalidChars)
  })
})

describe('validator · Windows 设备保留名（U-09，PRD 未覆盖的边界）', () => {
  it('U-09 保留文件名 con → E_INVALID_CHAR', () => {
    expect(validateNewName('con', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
    // 场景：删除规则把 contract 删成了 con
    expect(validateNewName('con.txt', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
  })

  it.each([['CON'], ['nul'], ['Aux'], ['prn'], ['COM1'], ['lpt9'], ['con.doc']])(
    '保留名 %s 一律拦截（不区分大小写、带扩展名也算）',
    (name) => {
      expect(validateNewName(name, DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
    },
  )

  it('含保留名但不是保留名的不拦（console / contract / com10）', () => {
    expect(validateNewName('console.txt', DIR).ok).toBe(true)
    expect(validateNewName('contract.txt', DIR).ok).toBe(true)
    expect(validateNewName('com10.txt', DIR).ok).toBe(true)
  })
})

describe('validator · 结尾点 / 结尾空格', () => {
  it('以点结尾 → 拦截', () => {
    expect(validateNewName('报告.', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
  })

  it('以空格结尾 → 拦截', () => {
    expect(validateNewName('报告 ', DIR)).toMatchObject({ ok: false, code: 'E_INVALID_CHAR' })
  })

  it('中间的点与空格不拦', () => {
    expect(validateNewName('报 告.备份.docx', DIR).ok).toBe(true)
  })
})

describe('validator · 路径过长（EX-02）', () => {
  it('目录 + 名称 > 255 字符 → E_PATH_TOO_LONG', () => {
    const longDir = `C:\\${'a'.repeat(MAX_PATH_SEGMENT_LEN)}`
    expect(validateNewName('x.txt', longDir)).toMatchObject({ ok: false, code: 'E_PATH_TOO_LONG' })
  })

  it('恰好等于 255 字符 → 通过（阈值是「超过」才拦）', () => {
    const dir = 'C:\\d'
    const name = `${'n'.repeat(MAX_PATH_SEGMENT_LEN - dir.length - 1 - 4)}.txt`
    expect(dir.length + 1 + name.length).toBe(MAX_PATH_SEGMENT_LEN)
    expect(validateNewName(name, dir).ok).toBe(true)
  })
})

describe('validator · 正常名字一律通过', () => {
  it.each([['报告.docx'], ['IMG_0001.JPG'], ['2026-09-11-发票-001.JPG'], ['我的.备份.tar.gz'], ['README'], ['文件夹名.2026'], ['中文 English 混排 😀.txt']])(
    '%s 通过校验',
    (name) => {
      expect(validateNewName(name, DIR)).toEqual({ ok: true })
    },
  )
})
