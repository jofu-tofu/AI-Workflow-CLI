import {promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {
  runHookSubprocess,
  type SubprocessHookResult,
} from './harness/hook-subprocess.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const SESSION_START_HOOK = resolve(TEST_DIR, '../../../../.aiwcli/_core/hooks-ts/session_start.ts')

function hookEnv(fixture: ContextFixture, sessionId: string): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: fixture.projectRoot,
    CLAUDE_SESSION_ID: sessionId,
  }
}

function sessionStartInput(
  sessionId: string,
  cwd: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hook_event_name: 'SessionStart',
    cwd,
    session_id: sessionId,
    ...overrides,
  }
}

function readAdditionalContext(result: SubprocessHookResult): null | string {
  const parsed = result.parsedOutput
  if (!parsed) return null
  const {hookSpecificOutput} = parsed
  if (!hookSpecificOutput || typeof hookSpecificOutput !== 'object') return null
  const {additionalContext} = (hookSpecificOutput as Record<string, unknown>)
  return typeof additionalContext === 'string' ? additionalContext : null
}

function readMode(state: Record<string, unknown>): string {
  const {mode} = state
  return typeof mode === 'string' ? mode : ''
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

async function readContextState(
  projectRoot: string,
  contextId: string,
): Promise<Record<string, unknown>> {
  const statePath = join(projectRoot, '_output', 'contexts', contextId, 'state.json')
  const raw = await fs.readFile(statePath, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('session_start hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('no-ops when source is not clear or compact', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-start-unknown-source',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-unknown-source', fixture.projectRoot, {
        source: 'resume',
      }),
      hookEnv(fixture, 'session-start-unknown-source'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
    expect(readMode(fixture.getState())).toBe('active')
  })

  it('restores context after compact when the session is already bound', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-start-compact-bound',
      planContent: '# Plan\n\n- continue implementation',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-compact-bound', fixture.projectRoot, {
        source: 'compact',
      }),
      hookEnv(fixture, 'session-start-compact-bound'),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain(`Resuming Context After Compaction: ${fixture.contextId}`)
  })

  it('no-ops for compact source when session is not bound to a context', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-start-compact-existing',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-compact-missing', fixture.projectRoot, {
        source: 'compact',
      }),
      hookEnv(fixture, 'session-start-compact-missing'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('restores a staged plan context on clear and marks work consumed', async () => {
    const fixture = await createContextFixture({
      mode: 'has_staged_work',
      planContent: '# Plan\n\n- staged for clear restore',
      sessionId: 'session-start-plan-old',
      nextArtifactType: 'plan',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-plan-new', fixture.projectRoot, {
        source: 'clear',
      }),
      hookEnv(fixture, 'session-start-plan-new'),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain(`Resuming Context After Plan Clear: ${fixture.contextId}`)

    const state = fixture.getState()
    expect(readMode(state)).toBe('active')
    expect(state.work_consumed).toBe(true)
    expect(state.plan_hash_consumed).toBe(state.plan_hash)

    const index = fixture.getIndex()
    const sessions = index.sessions as Record<string, string>
    expect(sessions['session-start-plan-new']).toBe(fixture.contextId)
  })

  it('restores a staged handoff context on clear and injects handoff content', async () => {
    const fixture = await createContextFixture({
      mode: 'has_staged_work',
      handoffPath: 'handoffs/latest.md',
      nextArtifactType: 'handoff',
      sessionId: 'session-start-handoff-old',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const handoffPath = join(fixture.projectRoot, 'handoffs', 'latest.md')
    await fs.mkdir(join(fixture.projectRoot, 'handoffs'), {recursive: true})
    await fs.writeFile(handoffPath, '# Handoff\n\nCarry over this work', 'utf8')

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-handoff-new', fixture.projectRoot, {
        source: 'clear',
      }),
      hookEnv(fixture, 'session-start-handoff-new'),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain(`Resuming Context After Handoff Clear: ${fixture.contextId}`)
    expect(additionalContext).toContain('Carry over this work')

    const state = fixture.getState()
    expect(readMode(state)).toBe('active')
    expect(state.work_consumed).toBe(true)
  })

  it('handles corrupted state.json gracefully during clear restore', async () => {
    const fixture = await createContextFixture({
      mode: 'has_staged_work',
      planContent: '# Plan\n\n- staged but corrupted',
      sessionId: 'session-start-corrupt-old',
      nextArtifactType: 'plan',
    })
    fixtures.push(fixture)

    const statePath = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'state.json',
    )
    await fs.writeFile(statePath, '{ this is not valid json', 'utf8')

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-corrupt-new', fixture.projectRoot, {
        source: 'clear',
      }),
      hookEnv(fixture, 'session-start-corrupt-new'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('no-ops on clear when no staged contexts are available', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-start-no-staged-old',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-no-staged-new', fixture.projectRoot, {
        source: 'clear',
      }),
      hookEnv(fixture, 'session-start-no-staged-new'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('selects the most recently active staged context when multiple are available', async () => {
    const fixture = await createContextFixture({
      contextId: 'ctx-older',
      mode: 'has_staged_work',
      sessionId: 'session-start-multi-old-a',
      planContent: '# Plan\n\n- older context',
      nextArtifactType: 'plan',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const contextIdNewer = 'ctx-newer'
    const contextRootNewer = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      contextIdNewer,
    )
    await fs.mkdir(join(contextRootNewer, 'notes'), {recursive: true})
    await fs.mkdir(join(contextRootNewer, 'plans'), {recursive: true})

    const newerPlanPath = join(contextRootNewer, 'plans', 'plan.md')
    await fs.writeFile(newerPlanPath, '# Plan\n\n- newer context', 'utf8')

    const newerState = {
      ...fixture.getState(),
      id: contextIdNewer,
      last_active: '2099-01-01T00:00:00.000Z',
      mode: 'has_staged_work',
      plan_path: newerPlanPath,
      plan_hash: 'abcdef123456',
      next_artifact_type: 'plan',
      session_ids: ['session-start-multi-old-b'],
      summary: 'newer context summary',
      work_consumed: false,
    }
    await writeJson(join(contextRootNewer, 'state.json'), newerState)

    const olderState = fixture.getState()
    olderState.last_active = '2000-01-01T00:00:00.000Z'
    await writeJson(
      join(fixture.projectRoot, '_output', 'contexts', fixture.contextId, 'state.json'),
      olderState,
    )

    const index = fixture.getIndex()
    const contexts = index.contexts as Record<string, {last_active: string; mode: string; summary: string}>
    contexts[fixture.contextId] = {
      last_active: '2000-01-01T00:00:00.000Z',
      mode: 'has_staged_work',
      summary: 'older context summary',
    }
    contexts[contextIdNewer] = {
      last_active: '2099-01-01T00:00:00.000Z',
      mode: 'has_staged_work',
      summary: 'newer context summary',
    }

    const sessions = index.sessions as Record<string, string>
    sessions['session-start-multi-old-b'] = contextIdNewer

    await writeJson(join(fixture.projectRoot, '_output', 'index.json'), index)

    const result = await runHookSubprocess(
      SESSION_START_HOOK,
      sessionStartInput('session-start-multi-new', fixture.projectRoot, {
        source: 'clear',
      }),
      hookEnv(fixture, 'session-start-multi-new'),
    )

    expect(result.exitCode).toBe(0)
    const additionalContext = readAdditionalContext(result)
    expect(additionalContext).toContain(`Resuming Context After Plan Clear: ${contextIdNewer}`)

    const reloadedNewer = await readContextState(fixture.projectRoot, contextIdNewer)
    expect(readMode(reloadedNewer)).toBe('active')

    const reloadedOlder = fixture.getState()
    expect(readMode(reloadedOlder)).toBe('has_staged_work')
  })
})

