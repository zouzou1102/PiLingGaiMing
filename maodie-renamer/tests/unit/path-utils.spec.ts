import { describe, expect, it } from 'vitest'
import {
  dirName,
  fullPathLength,
  isAbsoluteWinPath,
  joinPath,
  normalizeForCompare,
  normalizeSeparators,
  stripTrailingSep,
} from '@shared/path-utils'

describe('path-utils · 分隔符与末尾处理', () => {
  it('正斜杠统一成反斜杠', () => {
    expect(normalizeSeparators('C:/Users/PC/a.txt')).toBe('C:\\Users\\PC\\a.txt')
  })

  it('去掉末尾分隔符，但保留盘符根', () => {
    expect(stripTrailingSep('C:\\Users\\PC\\')).toBe('C:\\Users\\PC')
    expect(stripTrailingSep('C:\\Users\\PC')).toBe('C:\\Users\\PC')
    expect(stripTrailingSep('C:\\')).toBe('C:\\')
  })

  it('比较用的归一化会抹平大小写与末尾分隔符', () => {
    expect(normalizeForCompare('C:\\Users\\PC\\A.TXT')).toBe('c:\\users\\pc\\a.txt')
    expect(normalizeForCompare('C:\\Users\\PC\\')).toBe('c:\\users\\pc')
  })
})

describe('path-utils · 取目录 / 取文件名 / 拼接', () => {
  it.each([
    ['C:\\Users\\PC\\a.txt', 'C:\\Users\\PC', 'a.txt'],
    ['C:\\a.txt', 'C:\\', 'a.txt'],
    ['\\\\server\\share\\a.txt', '\\\\server\\share', 'a.txt'],
    ['C:\\Users\\PC\\文件夹', 'C:\\Users\\PC', '文件夹'],
  ])('dirName/baseName(%s)', (p, dir, base) => {
    expect(dirName(p)).toBe(dir)
    expect(joinPath(dir, base)).toBe(stripTrailingSep(normalizeSeparators(p)))
  })

  it('无分隔符时 dirName 为空串', () => {
    expect(dirName('a.txt')).toBe('')
  })

  it('joinPath 不产生双分隔符', () => {
    expect(joinPath('C:\\Users\\PC', 'a.txt')).toBe('C:\\Users\\PC\\a.txt')
    expect(joinPath('C:\\Users\\PC\\', 'a.txt')).toBe('C:\\Users\\PC\\a.txt')
    expect(joinPath('C:\\', 'a.txt')).toBe('C:\\a.txt')
    expect(joinPath('', 'a.txt')).toBe('a.txt')
  })

  it('isAbsoluteWinPath', () => {
    expect(isAbsoluteWinPath('C:\\a.txt')).toBe(true)
    expect(isAbsoluteWinPath('c:/a.txt')).toBe(true)
    expect(isAbsoluteWinPath('\\\\server\\share')).toBe(true)
    expect(isAbsoluteWinPath('a.txt')).toBe(false)
    expect(isAbsoluteWinPath('..\\a.txt')).toBe(false)
  })

  it('fullPathLength = 目录 + 1 + 名称', () => {
    // 'C:\d' 是 4 个字符，'a.txt' 是 5 个 → 4 + 1 + 5 = 10
    expect(fullPathLength('C:\\d', 'a.txt')).toBe(10)
  })
})
