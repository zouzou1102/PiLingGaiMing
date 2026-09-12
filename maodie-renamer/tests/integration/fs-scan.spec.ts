/**
 * 入列扫描集成测试（技术方案 §4.2.2 / 接口文档 §3.3）。
 *
 * 重点验证 stats 五个计数各自单独命中，以及 DEC-01「添加文件夹不递归」。
 */

import { afterAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolvePaths } from '../../src/main/services/fs-scan'
import { dirKey } from '@shared/path-utils'
import { MAX_ITEMS_PER_BATCH } from '@shared/constants'
import { cleanupAll, ls, makeDir, makeFiles, makeTempDir } from '../fixtures'

afterAll(cleanupAll)

describe('fs-scan · 入列与统计', () => {
  it('正常入列：填好 id / stem / ext / dirPath，并带回目录快照', async () => {
    const dir = await makeTempDir()
    await makeFiles(dir, ['报告.docx', 'README', '.gitignore', 'IMG_0001.JPG'])

    const batch = await resolvePaths({ paths: [join(dir, '报告.docx'), join(dir, 'README'), join(dir, '.gitignore'), join(dir, 'IMG_0001.JPG')], existingPaths: [] })

    expect(batch.stats.accepted).toBe(4)
    const byName = new Map(batch.items.map((i) => [i.name, i]))
    expect(byName.get('报告.docx')).toMatchObject({ stem: '报告', ext: '.docx', isDir: false })
    expect(byName.get('README')).toMatchObject({ stem: 'README', ext: '' })
    expect(byName.get('.gitignore')).toMatchObject({ stem: '.gitignore', ext: '' })
    expect(byName.get('IMG_0001.JPG')).toMatchObject({ stem: 'IMG_0001', ext: '.JPG' })

    // id 唯一
    expect(new Set(batch.items.map((i) => i.id)).size).toBe(4)
    // 快照按 dirKey 索引
    expect(batch.snapshot[dirKey(dir)].sort()).toEqual(['.gitignore', 'IMG_0001.JPG', 'README', '报告.docx'].sort())
  })

  it('EX-08：非文件系统对象（网页链接 / 纯文本）被拒收', async () => {
    const dir = await makeTempDir()
    const batch = await resolvePaths({
      paths: ['https://example.com/a.txt', '随便一段文字', 'a.txt', '..\\相对路径.txt', ''],
      existingPaths: [],
    })
    expect(batch.stats.rejected).toBe(5)
    expect(batch.items).toHaveLength(0)
    void dir
  })

  it('EX-09：重复项被静默忽略（含与已在列表的路径重复，不区分大小写）', async () => {
    const dir = await makeTempDir()
    await makeFiles(dir, ['a.txt'])
    const full = join(dir, 'a.txt')

    const batch = await resolvePaths({
      paths: [full, full, full.toUpperCase()],
      existingPaths: [full],
    })
    // 三条都与 existingPaths 重复
    expect(batch.stats.ignoredDuplicates).toBe(3)
    expect(batch.items).toHaveLength(0)
  })

  it('未入列时也会去重本批内部的重复（正斜杠形式视为同一路径）', async () => {
    const dir = await makeTempDir()
    await makeFiles(dir, ['a.txt'])
    const full = join(dir, 'a.txt')

    const batch = await resolvePaths({ paths: [full, full.replace(/\\/g, '/')], existingPaths: [] })
    expect(batch.stats.accepted).toBe(1)
    expect(batch.stats.ignoredDuplicates).toBe(1)
  })

  it('路径归一化：正斜杠与末尾分隔符不会造成「两个不同路径」', async () => {
    const dir = await makeTempDir()
    await makeFiles(dir, ['a.txt'])
    const batch = await resolvePaths({ paths: [`${dir.replace(/\\/g, '/')}/a.txt`], existingPaths: [] })
    expect(batch.items[0].fullPath).toBe(join(dir, 'a.txt'))
    expect(batch.items[0].dirPath).toBe(dir)
  })

  it('已消失的路径记为 vanished，不影响其余项', async () => {
    const dir = await makeTempDir()
    await makeFiles(dir, ['exists.txt'])
    const batch = await resolvePaths({
      paths: [join(dir, 'exists.txt'), join(dir, 'gone.txt')],
      existingPaths: [],
    })
    expect(batch.stats.vanished).toBe(1)
    expect(batch.stats.accepted).toBe(1)
  })

  it('DEC-01：文件夹只加入它本身，绝不递归其内部文件', async () => {
    const dir = await makeTempDir()
    const sub = await makeDir(dir, '我的文件夹')
    await makeFiles(sub, ['里面1.txt', '里面2.txt', '里面3.txt'])

    const batch = await resolvePaths({ paths: [sub], existingPaths: [] })

    expect(batch.stats.accepted).toBe(1)
    expect(batch.items[0]).toMatchObject({ name: '我的文件夹', isDir: true })
    // 内部文件一个都没进来
    expect(batch.items.some((i) => i.name.startsWith('里面'))).toBe(false)
  })

  it('文件夹名带点时不拆分扩展名', async () => {
    const dir = await makeTempDir()
    const sub = await makeDir(dir, 'v1.2.3')
    const batch = await resolvePaths({ paths: [sub], existingPaths: [] })
    expect(batch.items[0]).toMatchObject({ stem: 'v1.2.3', ext: '' })
  })

  it('EX-13：超出单批上限的部分被丢弃并计数', async () => {
    const dir = await makeTempDir()
    const names = Array.from({ length: 5 }, (_, i) => `f${i}.txt`)
    await makeFiles(dir, names)

    const batch = await resolvePaths({
      paths: names.map((n) => join(dir, n)),
      // 假装列表里已经有到上限的数量
      existingPaths: Array.from({ length: MAX_ITEMS_PER_BATCH - 3 }, (_, i) => `C:\\x\\p${i}.txt`),
    })

    expect(batch.stats.accepted).toBe(3)
    expect(batch.stats.overflow).toBe(2)
  })

  it('文件与文件夹可混合入列，各按自己的规则拆名', async () => {
    const dir = await makeTempDir()
    const sub = await makeDir(dir, '资料.2026')
    await makeFiles(dir, ['a.docx', 'b'])
    const batch = await resolvePaths({
      paths: [join(dir, 'a.docx'), join(dir, 'b'), sub],
      existingPaths: [],
    })
    const names = batch.items.map((i) => i.name).sort()
    expect(names).toEqual(['a.docx', 'b', '资料.2026'].sort())
    expect(batch.items.find((i) => i.name === '资料.2026')).toMatchObject({ isDir: true, stem: '资料.2026', ext: '' })
  })

  it('空入参返回空批次（不报错）', async () => {
    const batch = await resolvePaths({ paths: [], existingPaths: [] })
    expect(batch.items).toEqual([])
    expect(batch.stats).toEqual({ accepted: 0, ignoredDuplicates: 0, overflow: 0, rejected: 0, vanished: 0 })
    void ls
  })
})

describe('fs-scan · 符号链接（PRD 未覆盖，本方案定义）', () => {
  it('指向目录的链接：isDir 为 true 且 isSymlink 为 true，允许改名但不递归', async () => {
    const dir = await makeTempDir()
    const target = await makeDir(dir, '真实目录')
    await makeFiles(target, ['内部.txt'])
    const linkPath = join(dir, '链接目录')

    const { trySymlink } = await import('../fixtures')
    const ok = await trySymlink(target, linkPath, 'dir')
    if (!ok) {
      // Windows 上建 junction 需要权限；无权限时跳过（不把环境问题当失败）
      expect(true).toBe(true)
      return
    }

    const batch = await resolvePaths({ paths: [linkPath], existingPaths: [] })
    const item = batch.items.find((i) => i.name === '链接目录')
    expect(item).toMatchObject({ isDir: true, isSymlink: true })
    // 不递归：内部文件没进来
    expect(batch.items.some((i) => i.name === '内部.txt')).toBe(false)
  })
})
