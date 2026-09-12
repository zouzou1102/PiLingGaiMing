/**
 * 偏好设置（数据库设计 §6）。
 *
 * 两条要点：
 *  · **读取时逐字段兜底** —— 不信任文件内容。`confirmThreshold` 若为 `'abc'`
 *    或 `-5` 就回落到默认值。用户手动改坏文件不应该让软件崩溃。
 *  · **写入即落盘**（不防抖）—— 设置变更频率很低，实时写更安全。
 */

import { DEFAULT_PREFS, type Prefs } from '@shared/types'
import { CURRENT_VERSION, MIGRATIONS } from './migrations'
import { enqueueWrite, isWriteBlocked, readStore, storePath, writeJsonAtomic } from './storage'

/* ── 应用版本（由 index.ts 注入，避免服务层 import electron）──────────── */

let appVersion = '0.0.0'

export function setAppVersion(v: string): void {
  appVersion = v
}

export function getAppVersion(): string {
  return appVersion
}

/* ── 内存中的当前偏好 ──────────────────────────────────────────────── */

let current: Prefs = { ...DEFAULT_PREFS }

function isObjectPayload(p: unknown): p is Record<string, unknown> {
  return typeof p === 'object' && p !== null && !Array.isArray(p)
}

/** 逐字段兜底 + 越界钳制 */
function sanitize(raw: Record<string, unknown>): Prefs {
  const confirm = Math.trunc(Number(raw.confirmThreshold))
  return {
    version: Number.isInteger(raw.version) ? (raw.version as number) : DEFAULT_PREFS.version,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULT_PREFS.soundEnabled,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : DEFAULT_PREFS.reduceMotion,
    // 越界钳制到 [1, 1000]
    confirmThreshold: Number.isFinite(confirm)
      ? Math.min(1000, Math.max(1, confirm))
      : DEFAULT_PREFS.confirmThreshold,
    // 首版只有 light（深色模式是 P2，字段先留着）
    theme: 'light',
  }
}

/** @returns 是否因损坏 / 版本过新而被重置 */
export async function loadPrefs(): Promise<boolean> {
  const { payload, reset } = await readStore<Record<string, unknown>>({
    name: 'prefs',
    currentVersion: CURRENT_VERSION.prefs,
    migrations: MIGRATIONS.prefs,
    fallback: { ...DEFAULT_PREFS },
    validate: isObjectPayload,
  })
  current = sanitize(payload)
  return reset
}

export function getPrefs(): Prefs {
  return { ...current }
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const merged = sanitize({ ...current, ...patch })
  current = merged

  if (!isWriteBlocked('prefs')) {
    const file = storePath('prefs')
    await enqueueWrite(file, () =>
      writeJsonAtomic(file, {
        schemaVersion: CURRENT_VERSION.prefs,
        appVersion,
        payload: {
          soundEnabled: merged.soundEnabled,
          reduceMotion: merged.reduceMotion,
          confirmThreshold: merged.confirmThreshold,
          theme: merged.theme,
        },
      }),
    )
  }
  return { ...merged }
}
