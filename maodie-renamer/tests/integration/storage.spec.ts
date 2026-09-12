/**
 * 存储服务集成测试（数据库设计 §3 / §7 / §8 / §9）。
 *
 * 重点：原子写、损坏恢复、「版本比软件新 → 拒绝写入」、写入队列不被失败卡死、
 * 以及启动时「谨慎删除」临时文件。
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import {
  cleanupStaleTemp,
  drainWrites,
  enqueueWrite,
  flushJsonSync,
  initStorage,
  isWriteBlocked,
  readStore,
  setStorageWarningSink,
  storePath,
  writeJsonAtomic,
} from '../../src/main/services/storage'
import { CURRENT_VERSION, MIGRATIONS } from '../../src/main/services/migrations'
import type { StorageWarningPayload } from '@shared/types'
import { cleanupAll, makeTempDir, readText } from '../fixtures'

let dir = ''
let warnings: StorageWarningPayload[] = []

const isAny = (p: unknown): p is Record<string, unknown> => typeof p === 'object' && p !== null

async function readPrefsStore() {
  return readStore<Record<string, unknown>>({
    name: 'prefs',
    currentVersion: CURRENT_VERSION.prefs,
    migrations: MIGRATIONS.prefs,
    fallback: { soundEnabled: true },
    validate: isAny,
  })
}

beforeEach(async () => {
  dir = await makeTempDir('md-store-')
  initStorage(dir)
  warnings = []
  setStorageWarningSink((w) => warnings.push(w))
})

afterAll(cleanupAll)

describe('storage · 原子写', () => {
  it('首次写入产生合法 JSON（带外层信封），且不留临时文件', async () => {
    const file = storePath('prefs')
    await writeJsonAtomic(file, { schemaVersion: 1, appVersion: '1.0.0', payload: { a: 1 } })

    const parsed = JSON.parse(await readText(file))
    expect(parsed).toEqual({ schemaVersion: 1, appVersion: '1.0.0', payload: { a: 1 } })
    // 临时文件已被 rename 走
    expect((await fsp.readdir(dir)).filter((n) => n.includes('.tmp-'))).toHaveLength(0)
  })

  it('覆写已存在的文件（原子替换）', async () => {
    const file = storePath('prefs')
    await writeJsonAtomic(file, { v: 1 })
    await writeJsonAtomic(file, { v: 2 })
    expect(JSON.parse(await readText(file))).toEqual({ v: 2 })
  })

  it('flushJsonSync 同步落盘（关闭窗口时的关键路径）', async () => {
    const file = storePath('window')
    flushJsonSync(file, { schemaVersion: 1, appVersion: '1.0.0', payload: { width: 1080 } })
    // 不等任何 Promise，立即就能读到
    expect(JSON.parse(await readText(file)).payload).toEqual({ width: 1080 })
  })

  it('写入失败（目录不存在）不留残渣，且错误被抛出', async () => {
    const bogus = join(dir, '不存在的子目录', 'prefs.json')
    await expect(writeJsonAtomic(bogus, { a: 1 })).rejects.toBeTruthy()
    expect((await fsp.readdir(dir)).filter((n) => n.includes('.tmp-'))).toHaveLength(0)
  })
})

describe('storage · 读取与损坏恢复', () => {
  it('文件不存在 → 返回默认值，不报错、不创建文件', async () => {
    const r = await readPrefsStore()
    expect(r.reset).toBe(false)
    expect(r.payload).toEqual({ soundEnabled: true })
    expect(await fsp.readdir(dir)).toHaveLength(0)
  })

  it('正常文件 → 返回 payload', async () => {
    await writeJsonAtomic(storePath('prefs'), {
      schemaVersion: 1,
      appVersion: '1.0.0',
      payload: { soundEnabled: false },
    })
    const r = await readPrefsStore()
    expect(r.payload).toEqual({ soundEnabled: false })
    expect(r.reset).toBe(false)
  })

  it('★ 非法 JSON → 备份为 .corrupt-*.json、返回默认值、发出 storageWarning', async () => {
    const file = storePath('prefs')
    await fsp.writeFile(file, '{ 这不是 JSON', 'utf8')

    const r = await readPrefsStore()

    expect(r.reset).toBe(true)
    expect(r.payload).toEqual({ soundEnabled: true })
    const backups = (await fsp.readdir(dir)).filter((n) => n.includes('.corrupt-'))
    expect(backups).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ file: 'prefs', kind: 'corrupted' })
    expect(warnings[0].message).toContain('损坏')
    // 坏文件仍在原处 —— 用户还能自己打开看
    expect(await readText(file)).toBe('{ 这不是 JSON')
  })

  it('空文件算损坏（不是「空数据」）', async () => {
    await fsp.writeFile(storePath('prefs'), '', 'utf8')
    const r = await readPrefsStore()
    expect(r.reset).toBe(true)
    expect((await fsp.readdir(dir)).some((n) => n.includes('.corrupt-'))).toBe(true)
  })

  it('JSON 合法但结构不符 → 同样算损坏', async () => {
    await fsp.writeFile(storePath('prefs'), JSON.stringify([1, 2, 3]), 'utf8')
    const r = await readPrefsStore()
    expect(r.reset).toBe(true)
    expect(warnings).toHaveLength(1)
  })

  it('★ schemaVersion 比软件新 → 备份为 .future-*、拒绝写入、不静默摧毁数据', async () => {
    const file = storePath('prefs')
    const future = { schemaVersion: 99, appVersion: '9.9.9', payload: { soundEnabled: false, newField: '未来字段' } }
    await fsp.writeFile(file, JSON.stringify(future), 'utf8')

    const r = await readPrefsStore()

    expect(r.reset).toBe(true)
    expect(isWriteBlocked('prefs')).toBe(true)
    expect((await fsp.readdir(dir)).some((n) => n.includes('.future-'))).toBe(true)
    // 源文件一个字都没改 —— 未来版本的数据必须原样保住
    expect(JSON.parse(await readText(file))).toEqual(future)
    expect(warnings[0].message).toContain('版本比软件更新')
  })

  it('缺 schemaVersion → 当作 0 走迁移链', async () => {
    // 造一个「没有版本号」的老文件；迁移表为空 → 结构校验通过即可
    await fsp.writeFile(storePath('prefs'), JSON.stringify({ payload: { soundEnabled: true } }), 'utf8')
    const r = await readPrefsStore()
    expect(r.reset).toBe(false)
    expect(r.payload).toEqual({ soundEnabled: true })
    // 迁移后立即落盘，避免每次启动都重跑迁移
    expect(JSON.parse(await readText(storePath('prefs'))).schemaVersion).toBe(1)
  })

  it('逐级迁移会被依次执行，并备份原文件', async () => {
    await fsp.writeFile(
      storePath('window'),
      JSON.stringify({ schemaVersion: 0, appVersion: '0.1.0', payload: { width: 100 } }),
      'utf8',
    )
    const r = await readStore<Record<string, unknown>>({
      name: 'window',
      currentVersion: 2,
      migrations: {
        0: (p) => ({ ...p, step0: true }),
        1: (p) => ({ ...p, step1: true }),
      },
      fallback: {},
      validate: isAny,
    })
    expect(r.payload).toEqual({ width: 100, step0: true, step1: true })
    expect((await fsp.readdir(dir)).some((n) => n.includes('.v0-'))).toBe(true)
  })

  it('损坏备份最多保留 3 个', async () => {
    for (let i = 0; i < 5; i++) {
      await fsp.writeFile(storePath('prefs'), `坏内容${i}`, 'utf8')
      await readPrefsStore()
    }
    const backups = (await fsp.readdir(dir)).filter((n) => n.includes('.corrupt-') || n.includes('.future-'))
    expect(backups.length).toBeLessThanOrEqual(3)
  })
})

describe('storage · 写入队列串行化', () => {
  it('★ 一次写入失败不会让后续写入全部不执行', async () => {
    const order: string[] = []
    const failing = enqueueWrite('same-file', async () => {
      order.push('bad')
      throw new Error('模拟磁盘满')
    })
    await expect(failing).rejects.toThrow('模拟磁盘满')

    await enqueueWrite('same-file', async () => {
      order.push('good')
    })
    await drainWrites()

    expect(order).toEqual(['bad', 'good'])
  })

  it('同一文件的写入按提交顺序串行执行', async () => {
    const order: number[] = []
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        enqueueWrite('q', async () => {
          order.push(n)
        }),
      ),
    )
    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('不同文件的写入互不阻塞', async () => {
    const started: string[] = []
    const a = enqueueWrite('file-a', async () => {
      started.push('a-start')
      await new Promise((r) => setTimeout(r, 20))
      started.push('a-end')
    })
    const b = enqueueWrite('file-b', async () => {
      started.push('b')
    })
    await Promise.all([a, b])
    // b 在 a 结束之前就跑完了 → 说明不同文件确实是并行的
    expect(started.indexOf('b')).toBeLessThan(started.indexOf('a-end'))
  })
})

describe('storage · 启动清理（谨慎删除）', () => {
  it('只删除「命名匹配 + 超过 1 天」的自己生成的临时文件', async () => {
    const oldTmp = join(dir, '.history.json.tmp-1234-1000')
    const freshTmp = join(dir, '.history.json.tmp-1234-2000')
    const unrelatedOld = join(dir, '别人的文件.txt')

    await fsp.writeFile(oldTmp, 'x')
    await fsp.writeFile(freshTmp, 'x')
    await fsp.writeFile(unrelatedOld, 'x')

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000)
    await fsp.utimes(oldTmp, twoDaysAgo, twoDaysAgo)
    await fsp.utimes(unrelatedOld, twoDaysAgo, twoDaysAgo)

    const removed = cleanupStaleTemp(dir)

    expect(removed).toBe(1)
    const left = await fsp.readdir(dir)
    expect(left).not.toContain('.history.json.tmp-1234-1000') // 老的被清掉
    expect(left).toContain('.history.json.tmp-1234-2000') // 新的保留（可能正在用）
    expect(left).toContain('别人的文件.txt') // 绝不动别人的文件
  })
})
