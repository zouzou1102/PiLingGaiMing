import { describe, expect, it } from 'vitest'
import { joinName, splitName } from '@shared/name-split'

/**
 * EX-07 / PRD §4.2.4 的判定细则逐条固化。
 * 扩展名保护是**默认行为**，不是开关。
 */
describe('name-split · 主体与扩展名拆分', () => {
  const cases: Array<[string, boolean, string, string]> = [
    // 输入名, isDir, 期望 stem, 期望 ext
    ['报告.docx', false, '报告', '.docx'],
    ['IMG_0001.JPG', false, 'IMG_0001', '.JPG'], // 扩展名大小写原样保留
    ['我的.备份.tar.gz', false, '我的.备份.tar', '.gz'], // 只切最后一个点
    ['README', false, 'README', ''], // 无点
    ['文件夹名.2026', true, '文件夹名.2026', ''], // 文件夹不拆分
    // 以下为 PRD 未列、由技术方案补足的边界
    ['..', false, '..', ''], // 目录引用，理论上入列时已被主进程过滤
    ['报告．docx', false, '报告．docx', ''], // 全角点不是扩展名分隔符
    ['', false, '', ''],
    ['.', false, '.', ''],
  ]

  it.each(cases)('splitName(%s, isDir=%s) → %s + %s', (name, isDir, stem, ext) => {
    expect(splitName(name, isDir)).toEqual({ stem, ext })
  })

  // ★ U-06：`.gitignore` 不拆分
  it('U-06 .gitignore 不拆分（点在第 0 位不视为扩展名）', () => {
    expect(splitName('.gitignore', false)).toEqual({ stem: '.gitignore', ext: '' })
  })

  // 技术方案 §4.1.1 补足：点不在第 0 位时是常规扩展名
  it('.env.local → stem=.env, ext=.local（点在中间，是常规扩展名）', () => {
    expect(splitName('.env.local', false)).toEqual({ stem: '.env', ext: '.local' })
  })

  // 技术方案 §4.1.1 补足：结尾点不算扩展名
  it.each([['报告.'], ['a.b.c.']])('结尾点 %s 整名为主体', (name) => {
    expect(splitName(name, false)).toEqual({ stem: name, ext: '' })
  })

  it('joinName 只是拼接，绝不改动扩展名', () => {
    expect(joinName('报告', '.docx')).toBe('报告.docx')
    expect(joinName('x', '')).toBe('x')
    expect(joinName('.gitignore', '')).toBe('.gitignore')
  })

  it('拆分后拼回 = 原名（幂等性，覆盖全部上表用例）', () => {
    for (const [name, isDir] of cases) {
      const { stem, ext } = splitName(name, isDir)
      expect(joinName(stem, ext)).toBe(name)
    }
  })
})
