import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
