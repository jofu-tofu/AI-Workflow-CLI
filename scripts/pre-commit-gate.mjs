#!/usr/bin/env node

/**
 * Pre-commit gate — runs all checks before allowing a commit.
 *
 * Checks (stops on first failure):
 *   1. TypeScript import validation  (bunx tsc --noEmit in .aiwcli/_core/lib-ts)
 *   2. Contract tests                (vitest run test/types/ in packages/cli)
 *   3. Template sync check           (check-template-sync.mjs)
 *
 * Pure Node.js ESM, no external dependencies.
 */

import {execSync} from 'node:child_process'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const checks = [
  {
    label: 'TypeScript import validation',
    command: 'bunx tsc --noEmit',
    cwd: join(ROOT, '.aiwcli', '_core', 'lib-ts'),
  },
  {
    label: 'Contract tests',
    command: 'npx vitest run test/types/ --reporter=dot',
    cwd: join(ROOT, 'packages', 'cli'),
  },
  {
    label: 'Template sync check',
    command: 'node packages/cli/scripts/check-template-sync.mjs',
    cwd: ROOT,
  },
]

for (let i = 0; i < checks.length; i++) {
  const {label, command, cwd} = checks[i]
  console.log(`[pre-commit] ${i + 1}/${checks.length} \u2014 ${label}...`)

  try {
    execSync(command, {stdio: 'inherit', cwd})
  } catch {
    console.error(`\n[pre-commit] FAILED: ${label}`)
    process.exit(1)
  }
}

console.log('[pre-commit] All checks passed.')
