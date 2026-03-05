import {defineConfig} from 'vitest/config'

const sharedProjectConfig = {
  environment: 'node',
  globals: true,
} as const

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...sharedProjectConfig,
          include: [
            'test/lib/**/*.test.ts',
            'test/commands/**/*.test.ts',
            'test/types/**/*.test.ts',
            'test/index.test.ts',
          ],
          name: 'unit',
        },
      },
      {
        test: {
          ...sharedProjectConfig,
          fileParallelism: false,
          include: ['test/hooks/**/*.test.ts'],
          name: 'hooks',
          testTimeout: 30_000,
        },
      },
      {
        test: {
          ...sharedProjectConfig,
          fileParallelism: false,
          include: ['test/integration/**/*.test.ts'],
          name: 'integration',
          testTimeout: 60_000,
        },
      },
    ],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
