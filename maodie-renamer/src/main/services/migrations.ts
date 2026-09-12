/**
 * 迁移表（数据库设计 §3.4）。
 *
 * 首版 `CURRENT_VERSION` 全是 1、迁移表是空的。**这不是过度设计** ——
 * 建立机制的成本是 30 行代码，而在没有机制的情况下加迁移，
 * 代价是用户的历史记录全丢。
 *
 * 规则：逐级执行（绝不写「从 1 直接到 5」的跳级迁移）；迁移代码一旦发布
 * **永远保留**，删掉它会让升级路径断裂。
 */

import type { Migration } from './storage'
import type { StoreName } from '@shared/types'

export const CURRENT_VERSION: Record<StoreName, number> = {
  history: 1,
  window: 1,
  prefs: 1,
}

export const MIGRATIONS: Record<StoreName, Record<number, Migration>> = {
  history: {
    // 1: (p) => ({ ...p, tasks: p.tasks.map((t: any) => ({ ...t, undoneAt: t.undoneAt ?? null })) }),
  },
  window: {},
  prefs: {},
}
