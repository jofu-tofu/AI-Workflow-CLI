import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {
  readAdditionalContext,
  runHookSubprocess,
  type SubprocessHookResult,
} from './harness/hook-subprocess.js'
import {hookEnv} from './harness/hook-env.js'
import {bunOnlyPathEnv} from './harness/path-env.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const USER_PROMPT_SUBMIT_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/user_prompt_submit.ts',
)

function userPromptInput(
  sessionId: string,
  cwd: string,
  prompt: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hook_event_name: 'UserPromptSubmit',
    cwd,
    session_id: sessionId,
    prompt,
    ...overrides,
  }
}

function readDecision(result: SubprocessHookResult): null | string {
  const parsed = result.parsedOutput
  if (!parsed) return null
  const {decision} = parsed
  return typeof decision === 'string' ? decision : null
}

function readMode(state: Record<string, unknown>): string {
  const {mode} = state
  return typeof mode === 'string' ? mode : ''
}

async function cleanupWithRetry(fixture: ContextFixture): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fixture.cleanup()
      return
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))
    }
  }
}

describe('user_prompt_submit hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await cleanupWithRetry(fixture)
    }
  })

  it('passes through with no output when already bound to an active context', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'ups-bound-active',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput('ups-bound-active', fixture.projectRoot, 'continue current task'),
      hookEnv(fixture, 'ups-bound-active'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('creates and binds a new context on first prompt for an unbound session', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'ups-existing-session',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput(
        'ups-new-session',
        fixture.projectRoot,
        'implement subprocess hook integration tests for phase seven',
      ),
      hookEnv(fixture, 'ups-new-session', bunOnlyPathEnv()),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain('Context Created')

    const index = fixture.getIndex()
    const sessions = index.sessions as Record<string, string>
    const newContextId = sessions['ups-new-session']
    expect(typeof newContextId).toBe('string')
    expect(newContextId).not.toBe(fixture.contextId)
  })

  it('blocks caret picker prompts with a top-level block decision', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'ups-caret-existing',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput('ups-caret-new', fixture.projectRoot, '^'),
      hookEnv(fixture, 'ups-caret-new'),
    )

    expect(result.exitCode).toBe(0)
    expect(readDecision(result)).toBe('block')
    const parsed = result.parsedOutput
    expect(parsed && typeof parsed.reason === 'string').toBe(true)
  })

  it('does not restore a consumed handoff context and creates a new context instead', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      handoffPath: 'handoffs/consumed.md',
      sessionId: 'ups-consumed-old',
      workConsumed: true,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput(
        'ups-consumed-new',
        fixture.projectRoot,
        'start a separate effort unrelated to the consumed handoff',
      ),
      hookEnv(fixture, 'ups-consumed-new', bunOnlyPathEnv()),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain('Context Created')

    const index = fixture.getIndex()
    const sessions = index.sessions as Record<string, string>
    const newContextId = sessions['ups-consumed-new']
    expect(newContextId).not.toBe(fixture.contextId)
  })

  it('transitions idle context to active when a bound session submits a prompt', async () => {
    const fixture = await createContextFixture({
      mode: 'idle',
      sessionId: 'ups-idle-to-active',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput('ups-idle-to-active', fixture.projectRoot, 'continue implementation'),
      hookEnv(fixture, 'ups-idle-to-active'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
    expect(readMode(fixture.getState())).toBe('active')
  })

  it('suppresses activation in plan mode for an already bound idle context', async () => {
    const fixture = await createContextFixture({
      mode: 'idle',
      sessionId: 'ups-plan-mode',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      USER_PROMPT_SUBMIT_HOOK,
      userPromptInput('ups-plan-mode', fixture.projectRoot, 'stay in plan mode', {
        permission_mode: 'plan',
      }),
      hookEnv(fixture, 'ups-plan-mode'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
    expect(readMode(fixture.getState())).toBe('idle')
  })
})
