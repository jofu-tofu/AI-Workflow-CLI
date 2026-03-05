import {existsSync, promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {createContextFixture, type ContextFixture} from './fixtures/context-fixture.js'
import {
  runHookSubprocess,
  type SubprocessHookResult,
} from './harness/hook-subprocess.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const LINT_AFTER_EDIT_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/lint_after_edit.ts',
)

type FakeRuffMode = 'clean' | 'errors'

function hookEnv(
  fixture: ContextFixture,
  sessionId: string,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: fixture.projectRoot,
    CLAUDE_SESSION_ID: sessionId,
    ...overrides,
  }
}

function lintInput(cwd: string, filePath: string): Record<string, unknown> {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    cwd,
    tool_input: {
      file_path: filePath,
    },
  }
}

function readAdditionalContext(result: SubprocessHookResult): string | null {
  const parsed = result.parsedOutput
  if (!parsed) return null

  const hookSpecificOutput = parsed.hookSpecificOutput
  if (!hookSpecificOutput || typeof hookSpecificOutput !== 'object') return null

  const additionalContext = (hookSpecificOutput as Record<string, unknown>).additionalContext
  return typeof additionalContext === 'string' ? additionalContext : null
}

async function createFakeRuff(projectRoot: string, mode: FakeRuffMode): Promise<string> {
  const binDir = join(projectRoot, 'bin')
  await fs.mkdir(binDir, {recursive: true})

  if (process.platform === 'win32') {
    const scriptPath = join(binDir, 'ruff.cmd')
    const body = mode === 'errors'
      ? '@echo off\r\necho [{"location":{"row":2,"column":4},"message":"Undefined name","code":"F821"}]\r\nexit /b 1\r\n'
      : '@echo off\r\nexit /b 0\r\n'
    await fs.writeFile(scriptPath, body, 'utf8')
    return binDir
  }

  const scriptPath = join(binDir, 'ruff')
  const body = mode === 'errors'
    ? '#!/usr/bin/env sh\necho \'[{"location":{"row":2,"column":4},"message":"Undefined name","code":"F821"}]\'\nexit 1\n'
    : '#!/usr/bin/env sh\nexit 0\n'
  await fs.writeFile(scriptPath, body, 'utf8')
  await fs.chmod(scriptPath, 0o755)
  return binDir
}

function withPathPrefix(binDir: string): Record<string, string> {
  const basePath = process.env.PATH ?? process.env.Path ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const combined = basePath ? `${binDir}${sep}${basePath}` : binDir

  if (process.platform === 'win32') {
    return {PATH: combined, Path: combined}
  }

  return {PATH: combined}
}

function bunOnlyPathEnv(): Record<string, string> {
  const rawPath = process.env.PATH ?? process.env.Path ?? ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun'
  const bunDir = rawPath
    .split(separator)
    .find((entry) => entry.length > 0 && existsSync(join(entry, bunBinaryName)))

  if (!bunDir) return {}

  if (process.platform === 'win32') {
    return {PATH: bunDir, Path: bunDir}
  }

  return {PATH: bunDir}
}

describe('lint_after_edit hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('skips markdown files', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, 'README.md'),
      hookEnv(fixture, 'lint-skip-md'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('skips paths under node_modules', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, join('node_modules', 'pkg', 'index.ts')),
      hookEnv(fixture, 'lint-skip-node-modules'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('no-ops when no linter is configured for the file extension', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const filePath = join(fixture.projectRoot, 'notes.customext')
    await fs.writeFile(filePath, 'plain text', 'utf8')

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, filePath),
      hookEnv(fixture, 'lint-no-config'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('emits lint errors as additional context', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const filePath = join(fixture.projectRoot, 'bad.py')
    await fs.writeFile(filePath, 'print(undefined_name)\n', 'utf8')
    const binDir = await createFakeRuff(fixture.projectRoot, 'errors')

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, filePath),
      hookEnv(fixture, 'lint-errors', withPathPrefix(binDir)),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain('Lint: 1 issue(s)')
    expect(additionalContext).toContain('bad.py')
    expect(additionalContext).toContain('Undefined name')
  })

  it('stays silent for clean files', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const filePath = join(fixture.projectRoot, 'clean.py')
    await fs.writeFile(filePath, 'print("ok")\n', 'utf8')
    const binDir = await createFakeRuff(fixture.projectRoot, 'clean')

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, filePath),
      hookEnv(fixture, 'lint-clean', withPathPrefix(binDir)),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('gracefully skips when linter executable is not found', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const filePath = join(fixture.projectRoot, 'missing-linter.py')
    await fs.writeFile(filePath, 'print("noop")\n', 'utf8')

    const result = await runHookSubprocess(
      LINT_AFTER_EDIT_HOOK,
      lintInput(fixture.projectRoot, filePath),
      hookEnv(fixture, 'lint-missing-binary', bunOnlyPathEnv()),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })
})
