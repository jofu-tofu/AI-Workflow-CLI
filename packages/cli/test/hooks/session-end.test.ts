import {promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {runHookSubprocess} from './harness/hook-subprocess.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const SESSION_END_HOOK = resolve(TEST_DIR, '../../../../.aiwcli/_core/hooks-ts/session_end.ts')

function hookEnv(fixture: ContextFixture, sessionId: string): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: fixture.projectRoot,
    CLAUDE_SESSION_ID: sessionId,
  }
}

function sessionEndInput(
  sessionId: string,
  cwd: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hook_event_name: 'SessionEnd',
    cwd,
    session_id: sessionId,
    source: 'SessionEnd',
    ...overrides,
  }
}

function readStateMode(state: Record<string, unknown>): string {
  const {mode} = state
  return typeof mode === 'string' ? mode : ''
}

describe('session_end hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('no-ops cleanly when no context is bound to the session', async () => {
    const fixture = await createContextFixture()
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('missing-session', fixture.projectRoot),
      hookEnv(fixture, 'missing-session'),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()
  })

  it('stages active context with a plan artifact', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      planContent: '# Plan\n\n- implement phase 7',
      sessionId: 'session-plan-stage',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-plan-stage', fixture.projectRoot),
      hookEnv(fixture, 'session-plan-stage'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(readStateMode(state)).toBe('has_staged_work')
    expect(state.next_artifact_type).toBe('plan')
  })

  it('stages active context with a handoff artifact', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      handoffPath: 'handoffs/latest.md',
      nextArtifactType: 'handoff',
      sessionId: 'session-handoff-stage',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-handoff-stage', fixture.projectRoot),
      hookEnv(fixture, 'session-handoff-stage'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(readStateMode(state)).toBe('has_staged_work')
    expect(state.next_artifact_type).toBe('handoff')
  })

  it('applies latest-wins behavior by clearing handoff when a new plan is detected', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      planContent: '# Plan\n\n- newest work',
      handoffPath: 'handoffs/older.md',
      sessionId: 'session-latest-wins',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-latest-wins', fixture.projectRoot),
      hookEnv(fixture, 'session-latest-wins'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(state.handoff_path).toBeUndefined()
    expect(state.next_artifact_type).toBe('plan')
  })

  it('assigns fallback plan fields from archived plans when current plan metadata is missing', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-plan-fallback',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const planPath = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'plans',
      'fallback-plan.md',
    )
    await fs.writeFile(planPath, '# Fallback Plan\n\n- recover staged work', 'utf8')

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-plan-fallback', fixture.projectRoot),
      hookEnv(fixture, 'session-plan-fallback'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(state.plan_path).toBe(planPath)
    expect(typeof state.plan_hash).toBe('string')
    expect(String(state.plan_hash).length).toBe(12)
    expect(readStateMode(state)).toBe('has_staged_work')
    expect(state.next_artifact_type).toBe('plan')
  })

  it('archives the transcript into the context session-transcripts folder', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'session-transcript',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const transcriptPath = join(fixture.projectRoot, 'transcript.jsonl')
    const transcriptContent = '{"type":"message","content":"hello"}\n'
    await fs.writeFile(transcriptPath, transcriptContent, 'utf8')

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-transcript', fixture.projectRoot, {
        transcript_path: transcriptPath,
      }),
      hookEnv(fixture, 'session-transcript'),
    )

    expect(result.exitCode).toBe(0)

    const transcriptsDir = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'session-transcripts',
    )
    const files = await fs.readdir(transcriptsDir)
    expect(files.length).toBe(1)

    const archived = await fs.readFile(join(transcriptsDir, files[0] ?? ''), 'utf8')
    expect(archived).toBe(transcriptContent)
  })

  it('does not stage when work has already been consumed', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      planContent: '# Plan\n\n- already consumed',
      sessionId: 'session-consumed',
      workConsumed: true,
    })
    fixtures.push(fixture)

    const stateWithConsumedHash = fixture.getState()
    stateWithConsumedHash.plan_hash_consumed = stateWithConsumedHash.plan_hash
    await fs.writeFile(
      join(fixture.projectRoot, '_output', 'contexts', fixture.contextId, 'state.json'),
      JSON.stringify(stateWithConsumedHash, null, 2),
      'utf8',
    )

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-consumed', fixture.projectRoot),
      hookEnv(fixture, 'session-consumed'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(readStateMode(state)).toBe('active')
  })

  it('allows staging in plan permission mode even from idle state', async () => {
    const fixture = await createContextFixture({
      mode: 'idle',
      handoffPath: 'handoffs/pending.md',
      nextArtifactType: 'handoff',
      sessionId: 'session-plan-mode',
      workConsumed: false,
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      SESSION_END_HOOK,
      sessionEndInput('session-plan-mode', fixture.projectRoot, {
        permission_mode: 'plan',
      }),
      hookEnv(fixture, 'session-plan-mode'),
    )

    expect(result.exitCode).toBe(0)
    const state = fixture.getState()
    expect(readStateMode(state)).toBe('has_staged_work')
    expect(state.next_artifact_type).toBe('handoff')
  })
})
