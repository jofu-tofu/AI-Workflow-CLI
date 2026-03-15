import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {runHookSubprocess} from './harness/hook-subprocess.js'
import {hookEnv} from './harness/hook-env.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PRE_COMPACT_HOOK = resolve(TEST_DIR, '../../../../.aiwcli/_core/hooks-ts/pre_compact.ts')

describe('pre_compact hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('saves a pre-compact state snapshot for bound sessions', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'pre-compact-bound',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      PRE_COMPACT_HOOK,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Compact',
        cwd: fixture.projectRoot,
        session_id: 'pre-compact-bound',
      },
      hookEnv(fixture, 'pre-compact-bound'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()

    const state = fixture.getState()
    const lastSession = state.last_session as Record<string, unknown>
    expect(lastSession.session_id).toBe('pre-compact-bound')
    expect(lastSession.save_reason).toBe('pre_compact')
    expect(typeof lastSession.saved_at).toBe('string')
  })

  it('no-ops when no context is bound to the session', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'pre-compact-existing',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      PRE_COMPACT_HOOK,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Compact',
        cwd: fixture.projectRoot,
        session_id: 'pre-compact-missing',
      },
      hookEnv(fixture, 'pre-compact-missing'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()

    const state = fixture.getState()
    expect(state.last_session).toBeNull()
  })
})

