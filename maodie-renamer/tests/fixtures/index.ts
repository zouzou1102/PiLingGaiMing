/**
 * 集成测试的造文件工具。
 *
 * 用真实临时目录，不用 mock —— 「绝不覆盖」这类性质只能在真实文件系统上验证。
 */

import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const created: string[] = []

/** 建一个临时目录（用后由 cleanupAll 统一清理）*/
export async function makeTempDir(prefix = 'md-it-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

/** 在目录下批量建文件，内容默认 = 文件名（便于字节比对）*/
export async function makeFiles(dir: string, names: string[], content?: (name: string) => string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const n of names) {
    await writeFile(join(dir, n), content ? content(n) : `content-of-${n}`, 'utf8')
  }
}

/** 建子目录 */
export async function makeDir(dir: string, name: string): Promise<string> {
  const p = join(dir, name)
  await mkdir(p, { recursive: true })
  return p
}

/** 列目录（排序后返回，便于断言）*/
export async function ls(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort()
}

export async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}

/** 试着建一个目录符号链接；Windows 上无权限时返回 false（调用方自行跳过）*/
export async function trySymlink(target: string, linkPath: string, type: 'dir' | 'file'): Promise<boolean> {
  try {
    await symlink(target, linkPath, type === 'dir' ? 'junction' : 'file')
    return true
  } catch {
    return false
  }
}

export async function cleanupAll(): Promise<void> {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })))
}
