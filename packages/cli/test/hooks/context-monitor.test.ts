import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {hookEnv} from './harness/hook-env.js'
import {
  readAdditionalContext,
  runHookSubprocess,
} from './harness/hook-subprocess.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CONTEXT_MONITOR_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/context_monitor.ts',
)

function monitorInput(
  sessionId: string,
  cwd: string,
  remainingPct: number,
): Record<string, unknown> {
  const contextWindowSize = 100_000
  const tokensUsed = Math.round(contextWindowSize * (100 - remainingPct) / 100)
  const inputTokens = Math.max(0, tokensUsed - 22_600)

  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    cwd,
    session_id: sessionId,
    context_window: {
      context_window_size: contextWindowSize,
      current_usage: {
        input_tokens: inputTokens,
      },
    },
  }
}

function readWarnings(state: Record<string, unknown>): number[] {
  const lastSession = state.last_session
  if (!lastSession || typeof lastSession !== 'object') return []
  const fired = (lastSession as Record<string, unknown>).context_warnings_fired
  return Array.isArray(fired) ? fired.filter((item): item is number => typeof item === 'number') : []
}

describe('context_monitor hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('no-ops when no context is bound to the session', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'context-monitor-existing',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-missing', fixture.projectRoot, 25),
      hookEnv(fixture, 'context-monitor-missing'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('emits a warning when crossing the 30 percent threshold', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'context-monitor-thirty',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-thirty', fixture.projectRoot, 30),
      hookEnv(fixture, 'context-monitor-thirty'),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain('30% Remaining')
    expect(readWarnings(fixture.getState())).toEqual([30])
  })

  it('emits the 15 percent warning after 30 percent was already fired', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'context-monitor-fifteen',
    })
    fixtures.push(fixture)

    const first = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-fifteen', fixture.projectRoot, 30),
      hookEnv(fixture, 'context-monitor-fifteen'),
    )
    expect(first.exitCode).toBe(0)

    const second = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-fifteen', fixture.projectRoot, 15),
      hookEnv(fixture, 'context-monitor-fifteen'),
    )

    expect(second.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(second)
    expect(additionalContext).toContain('15% Remaining')
    expect(readWarnings(fixture.getState())).toEqual([30, 15])
  })

  it('deduplicates already fired warning thresholds', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'context-monitor-dedup',
    })
    fixtures.push(fixture)

    const first = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-dedup', fixture.projectRoot, 30),
      hookEnv(fixture, 'context-monitor-dedup'),
    )
    expect(first.exitCode).toBe(0)
    expect(readAdditionalContext(first)).toContain('30% Remaining')

    const second = await runHookSubprocess(
      CONTEXT_MONITOR_HOOK,
      monitorInput('context-monitor-dedup', fixture.projectRoot, 25),
      hookEnv(fixture, 'context-monitor-dedup'),
    )

    expect(second.exitCode).toBe(0)
    expect(second.parsedOutput).toBeNull()
    expect(readWarnings(fixture.getState())).toEqual([30])
  })
})

