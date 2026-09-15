/**
 * 窗口管理（技术方案 §4.2.4 / 数据库设计 §5）。
 *
 * 三件容易被忽略、但会真实咬人的事：
 *  1. **恢复位置前必须校验「窗口是否还在某块显示器上」**。
 *     用户拔掉外接屏后 `x = 3000` 会让窗口出现在屏幕外 —— 非技术用户会
 *     认为「软件打不开」，然后卸载重装，而重装后 window.json 还在，问题依旧。
 *  2. **关闭时用同步写**（`flushJsonSync`）。`close` 之后进程随时退出，
 *     异步写会在写完之前就结束，用户最后一次调整的尺寸就丢了。
 *  3. **单实例锁**。两个实例同时改同一批文件会绕过进程内的写入队列。
 *  4. **主题必须在 `new BrowserWindow` 之前定下来**（P2-A §7.1）。
 *     窗口底色是「首帧不闪」那一帧用的颜色：先把深浅色信号交给 Electron，
 *     再据此定底色，否则冷启动会先白一下再变深（验收 TC-30）。
 */

import { BrowserWindow, app, screen, session } from 'electron'
import { join } from 'node:path'
import { WINDOW_DEFAULT, WINDOW_MIN, WINDOW_SAVE_DEBOUNCE_MS } from '@shared/constants'
import { windowBackgroundFor } from '@shared/theme'
import type { WindowState } from '@shared/types'
import { CURRENT_VERSION, MIGRATIONS } from './services/migrations'
import { getPrefs } from './services/prefs-store'
import { applyThemeSource, isDarkNow } from './services/theme'
import {
  enqueueWrite,
  flushJsonSync,
  readStore,
  storePath,
  writeJsonAtomic,
} from './services/storage'

type SavedWindow = WindowState & { savedAt: number }

const DEFAULT_STATE: SavedWindow = {
  ...WINDOW_DEFAULT,
  x: Number.NaN,
  y: Number.NaN,
  maximized: false,
  savedAt: 0,
}

function isWindowPayload(p: unknown): p is SavedWindow {
  return typeof p === 'object' && p !== null && !Array.isArray(p)
}

let win: BrowserWindow | null = null
let saveTimer: NodeJS.Timeout | null = null
let cached: SavedWindow = { ...DEFAULT_STATE }

/* ── 读取与钳制 ─────────────────────────────────────────────────────── */

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** 三项校验：尺寸下限、尺寸上限、位置是否还在某块显示器上 */
function clampToDisplays(raw: SavedWindow): SavedWindow {
  const primary = screen.getPrimaryDisplay()
  const area = primary.workArea
  const displays = screen.getAllDisplays()

  const width = Math.round(Math.min(Math.max(num(raw.width, WINDOW_DEFAULT.width), WINDOW_MIN.width), area.width))
  const height = Math.round(Math.min(Math.max(num(raw.height, WINDOW_DEFAULT.height), WINDOW_MIN.height), area.height))

  const x = num(raw.x, Number.NaN)
  const y = num(raw.y, Number.NaN)

  const visible =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    displays.some((d) => {
      const wa = d.workArea
      // 有交集即视为可见（留 1px 容差）
      return x < wa.x + wa.width - 1 && x + width > wa.x + 1 && y < wa.y + wa.height - 1 && y + height > wa.y + 1
    })

  if (!visible) {
    // 回主显示器居中
    return {
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      maximized: raw.maximized === true,
      savedAt: raw.savedAt,
    }
  }

  return { width, height, x: Math.round(x), y: Math.round(y), maximized: raw.maximized === true, savedAt: raw.savedAt }
}

export async function loadWindowState(): Promise<SavedWindow> {
  const { payload } = await readStore<SavedWindow>({
    name: 'window',
    currentVersion: CURRENT_VERSION.window,
    migrations: MIGRATIONS.window,
    fallback: { ...DEFAULT_STATE },
    validate: isWindowPayload,
  })
  cached = clampToDisplays(payload)
  return cached
}

/* ── 创建窗口 ───────────────────────────────────────────────────────── */

export async function createMainWindow(): Promise<BrowserWindow> {
  const state = await loadWindowState()

  /* ★ 主题先定，再建窗口 —— 见文件头第 4 条铁律。
     用户选的深/浅色先交给 Electron，再据「现在实际是不是深色」定窗口底色，
     这样窗口出现的**第一帧**颜色就是对的（`prefs` 已在 bootstrap 里加载过，
     所以这里拿到的是已落盘的设置，不是默认值）。 */
  const theme = getPrefs().theme
  applyThemeSource(theme)

  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    show: false,
    frame: false, // 自绘标题栏（设计规范 §5.1 R-01 高 44px）
    resizable: true,
    maximizable: true,
    backgroundColor: windowBackgroundFor(isDarkNow(theme)),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // ── 进程安全配置（技术方案 §1.3）────────────────────────────────
      contextIsolation: true,
      nodeIntegration: false,
      // 需要 false：预加载要 require 共享层的常量。代价是预加载有 Node 权限，
      // 但它只有几十行、不做业务逻辑，由代码评审 + 单测保证它只做转发。
      sandbox: false,
      webSecurity: true,
      nodeIntegrationInWorker: false,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  // 最大化状态单独记：启动时先 setBounds（已在构造里做了）再 maximize
  if (state.maximized) win.maximize()

  win.once('ready-to-show', () => win?.show())

  // ── 尺寸位置记忆 ───────────────────────────────────────────────────
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveWindowState()
    }, WINDOW_SAVE_DEBOUNCE_MS)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)

  const emitMaximize = (): void => {
    win?.webContents.send('md:window:maximizeChanged', { maximized: win.isMaximized() })
  }
  win.on('maximize', () => {
    emitMaximize()
    scheduleSave()
  })
  win.on('unmaximize', () => {
    emitMaximize()
    scheduleSave()
  })

  // ── 关闭：同步写，绝不丢最后一次调整 ────────────────────────────────
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    flushWindowStateSync()
  })

  win.on('closed', () => {
    win = null
  })

  // ── 加载页面 ───────────────────────────────────────────────────────
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function getMainWindow(): BrowserWindow | null {
  return win
}

/* ── 状态读写 ───────────────────────────────────────────────────────── */

function currentState(): SavedWindow {
  if (!win || win.isDestroyed()) return cached
  const b = win.getBounds()
  return {
    width: b.width,
    height: b.height,
    // 最大化时 getBounds 返回的是最大化后的尺寸，存「还原态」更有意义
    ...(win.isMaximized() ? {} : { x: b.x, y: b.y }),
    x: b.x,
    y: b.y,
    maximized: win.isMaximized(),
    savedAt: Date.now(),
  }
}

export function getWindowState(): WindowState | null {
  if (!win || win.isDestroyed()) return null
  return currentState()
}

async function saveWindowState(): Promise<void> {
  const state = currentState()
  cached = state
  try {
    const file = storePath('window')
    await enqueueWrite(file, () =>
      writeJsonAtomic(file, {
        schemaVersion: CURRENT_VERSION.window,
        appVersion: app.getVersion(),
        payload: state,
      }),
    )
  } catch (err) {
    console.warn('[md] 保存窗口状态失败：', err)
  }
}

/** ★ 关闭窗口时必须用同步写 —— 见文件头说明 */
export function flushWindowStateSync(): void {
  if (!win || win.isDestroyed()) return
  try {
    const state = currentState()
    cached = state
    flushJsonSync(storePath('window'), {
      schemaVersion: CURRENT_VERSION.window,
      appVersion: app.getVersion(),
      payload: state,
    })
  } catch (err) {
    console.warn('[md] 同步保存窗口状态失败：', err)
  }
}

export function toggleMaximize(): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return win.isMaximized()
}

/* ── 隐私与安全加固（技术方案 §7.3）─────────────────────────────────── */

export function hardenSession(): void {
  // 一律拒绝权限请求（摄像头 / 定位 / 通知…… 本项目一个都不需要）
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

/** 禁止一切弹窗、外链与新窗口 —— 本项目零网络请求 */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      const devUrl = process.env['ELECTRON_RENDERER_URL']
      if (devUrl && url.startsWith(devUrl)) return
      event.preventDefault()
    })
  })
}
