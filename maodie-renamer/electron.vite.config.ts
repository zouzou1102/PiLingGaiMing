import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/**
 * 生产环境 CSP（技术方案 §1.3 / §7.3）。
 *
 * `connect-src 'none'` 是「完全本地离线」的技术兑现方式——它从 Chromium 内核层面
 * 拦住任何意外的网络请求（含某个依赖偷偷加的埋点），因此 TC-16 的「断网验证」
 * 从「人工观察」升级为「架构保证」。
 *
 * `img-src` 额外允许 `mdres:` —— 这是本项目自注册的**本地只读资源协议**
 * （见 src/main/index.ts 的 protocol.handle('mdres', ...)），用于按路径读取
 * `resources/cats` 与 `resources/illustration`，从而保住 PRD 要求的
 * 「换掉 resources 下的图 = 换形象，代码一行不用动」。
 * 注意：`mdres:` 是本地协议，不是网络来源，`connect-src 'none'` 依然成立。
 * 字体走 assets 打包产物（'self'），不需要网络与 data: 之外的来源。
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: mdres:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
].join('; ')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } },
    },
  },

  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [
      vue(),
      {
        // CSP 只在构建产物里注入：dev 模式需要 Vite 的 HMR websocket 与 inline 脚本，
        // 注入严格 CSP 会让开发服务器直接不可用。生产产物是唯一的发布物，加固它就够了。
        name: 'md-inject-prod-csp',
        apply: 'build',
        transformIndexHtml(html: string) {
          return html.replace(
            '<!--MD_CSP-->',
            `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`,
          )
        },
      },
    ],
    // 预览计算在 Web Worker 内完成（ADR-003）。用 ES 模块格式，与
    // `new Worker(url, { type: 'module' })` 保持一一对应。
    worker: { format: 'es' },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
    },
  },
})
