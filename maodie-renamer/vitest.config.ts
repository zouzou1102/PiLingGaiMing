import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // shared 是安全底线所在，覆盖率目标必须最高（技术方案 §9.1）
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
      exclude: ['src/shared/types.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
})
