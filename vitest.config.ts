import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.{test,spec}.{ts,js}', '**/*.test.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: [resolve(__dirname, './test/setup.ts')],
  },
})