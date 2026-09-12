/**
 * 预加载 —— **唯一的门**（技术方案 §1.1 / 接口文档 §2）。
 *
 * 这里只做三件事：把 ipcRenderer 的三项能力包装成 bridge、构造 window.maodie、
 * 冻结后挂到 window 上。**不含任何业务逻辑** —— 业务逻辑要放进 shared 或主进程
 * services，那样它才可单测。
 *
 * 明确不做的（P-06）：不暴露 ipcRenderer 本体、不暴露 require / process /
 * Buffer / __dirname、不暴露 shell.openExternal。
 */

import { contextBridge, ipcRenderer } from 'electron'
import { buildMaodieApi, type PreloadBridge } from './api'

const bridge: PreloadBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, cb) => {
    // 统一包装成「返回取消函数」的形式，避免界面侧忘记 off
    const handler = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

/**
 * `Object.freeze` 不是装饰：它防止界面代码（或被注入的脚本）
 * 替换掉 api.rename.execute。成本为零。
 */
contextBridge.exposeInMainWorld('maodie', Object.freeze(buildMaodieApi(bridge)))
