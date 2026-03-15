import {existsSync, promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {
  readAdditionalContext,
  runHookSubprocess,
} from './harness/hook-subprocess.js'
import {hookEnv} from './harness/hook-env.js'
import {withPathPrefix} from './harness/path-env.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CODEX_EXPLORER_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/codex_explorer.ts',
)

type FakeCodexMode = 'failure' | 'success'

function userPromptInput(
  sessionId: string,
  cwd: string,
  prompt: string,
  permissionMode: string,
): Record<string, unknown> {
  return {
    'hook_event_name': 'UserPromptSubmit',
    cwd,
    'session_id': sessionId,
    prompt,
    'permission_mode': permissionMode,
  }
}

async function createFakeCodex(
  projectRoot: string,
  mode: FakeCodexMode,
): Promise<{binDir: string; logPath: string}> {
  const binDir = join(projectRoot, 'bin')
  const logPath = join(projectRoot, 'codex-args.log')
  await fs.mkdir(binDir, {recursive: true})

  if (process.platform === 'win32') {
    const scriptPath = join(binDir, 'codex.cmd')
    const body = mode === 'success'
      ? '@echo off\r\nif not "%CODEX_TEST_LOG%"=="" echo %*>>"%CODEX_TEST_LOG%"\r\necho Explorer summary from Spark\r\nexit /b 0\r\n'
      : '@echo off\r\nif not "%CODEX_TEST_LOG%"=="" echo %*>>"%CODEX_TEST_LOG%"\r\necho forced failure 1>&2\r\nexit /b 1\r\n'
    await fs.writeFile(scriptPath, body, 'utf8')
    return {binDir, logPath}
  }

  const scriptPath = join(binDir, 'codex')
  const body = mode === 'success'
    ? '#!/usr/bin/env sh\nif [ -n "$CODEX_TEST_LOG" ]; then printf \'%s\\n\' "$*" >> "$CODEX_TEST_LOG"; fi\ncat >/dev/null\necho "Explorer summary from Spark"\nexit 0\n'
    : '#!/usr/bin/env sh\nif [ -n "$CODEX_TEST_LOG" ]; then printf \'%s\\n\' "$*" >> "$CODEX_TEST_LOG"; fi\ncat >/dev/null\necho "forced failure" >&2\nexit 1\n'
  await fs.writeFile(scriptPath, body, 'utf8')
  await fs.chmod(scriptPath, 0o755)
  return {binDir, logPath}
}

async function readLoggedArgs(logPath: string): Promise<string[]> {
  if (!existsSync(logPath)) return []
  const content = await fs.readFile(logPath, 'utf8')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

describe('codex_explorer hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    const cleanupTargets = fixtures.splice(0, fixtures.length)
    await Promise.all(cleanupTargets.map(async (fixture) => fixture.cleanup()))
  })

  it('uses Spark model and emits explorer context in plan mode', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'codex-explorer-plan-success',
    })
    fixtures.push(fixture)

    const {binDir, logPath} = await createFakeCodex(fixture.projectRoot, 'success')

    const result = await runHookSubprocess(
      CODEX_EXPLORER_HOOK,
      userPromptInput(
        'codex-explorer-plan-success',
        fixture.projectRoot,
        'analyze this repo for hooks and context routing',
        'plan',
      ),
      hookEnv(
        fixture,
        'codex-explorer-plan-success',
        {
          ...withPathPrefix(binDir),
          CODEX_TEST_LOG: logPath,
        },
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(readAdditionalContext(result)).toContain('Explorer summary from Spark')

    const calls = await readLoggedArgs(logPath)
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('--model gpt-5.3-codex-spark')
  })

  it('skips Codex invocation when not in plan mode', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'codex-explorer-non-plan',
    })
    fixtures.push(fixture)

    const {binDir, logPath} = await createFakeCodex(fixture.projectRoot, 'success')

    const result = await runHookSubprocess(
      CODEX_EXPLORER_HOOK,
      userPromptInput(
        'codex-explorer-non-plan',
        fixture.projectRoot,
        'analyze this repo for hooks and context routing',
        'bypassPermissions',
      ),
      hookEnv(
        fixture,
        'codex-explorer-non-plan',
        {
          ...withPathPrefix(binDir),
          CODEX_TEST_LOG: logPath,
        },
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
    expect(await readLoggedArgs(logPath)).toEqual([])
  })

  it('stays silent when Spark inference fails and does not retry fallback', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'codex-explorer-plan-fail',
    })
    fixtures.push(fixture)

    const {binDir, logPath} = await createFakeCodex(fixture.projectRoot, 'failure')

    const result = await runHookSubprocess(
      CODEX_EXPLORER_HOOK,
      userPromptInput(
        'codex-explorer-plan-fail',
        fixture.projectRoot,
        'analyze this repo for hooks and context routing',
        'plan',
      ),
      hookEnv(
        fixture,
        'codex-explorer-plan-fail',
        {
          ...withPathPrefix(binDir),
          CODEX_TEST_LOG: logPath,
        },
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
    expect((await readLoggedArgs(logPath)).length).toBe(1)
  })
})
