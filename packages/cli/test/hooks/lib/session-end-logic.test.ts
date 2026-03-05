import {createHash} from 'node:crypto'

import {describe, expect, it} from 'vitest'

import {normalizePlanContent} from '../../../src/templates/_shared/lib-ts/context/plan-manager.js'
import {
  buildSessionMetadata,
  computePlanFallback,
  generateArchiveFilename,
  shouldStage,
} from '../../../src/templates/_shared/lib-ts/hooks/session-end-logic.js'
import type {ContextState, GitState} from '../../../src/templates/_shared/lib-ts/types.js'

function makeState(overrides: Partial<ContextState> = {}): ContextState {
  const now = '2026-03-04T18:30:00.000Z'
  return {
    id: 'ctx-session-end',
    status: 'active',
    summary: 'session end tests',
    method: 'manual',
    tags: [],
    created_at: now,
    last_active: now,
    mode: 'active',
    plan_path: null,
    plan_hash: null,
    plan_signature: null,
    plan_id: null,
    plan_anchors: [],
    plan_hash_consumed: null,
    handoff_path: null,
    work_consumed: false,
    next_artifact_type: null,
    session_ids: [],
    last_session: null,
    tasks: [],
    ...overrides,
  }
}

describe('session-end-logic', () => {
  it('computePlanFallback computes normalized hash and metadata fields', () => {
    const state = makeState({work_consumed: false})
    const planContent = [
      '# Plan',
      '',
      '- Extract pure logic from hooks',
      '- Add targeted tests',
      '- Validate in CI',
    ].join('\n')

    const normalized = normalizePlanContent(planContent)
    const expectedHash = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12)
    const fallback = computePlanFallback(state, planContent)

    expect(fallback.plan_hash).toBe(expectedHash)
    expect(fallback.plan_signature).toBe(planContent.slice(0, 200))
    expect(typeof fallback.plan_id).toBe('string')
    expect((fallback.plan_id ?? '').length).toBeGreaterThan(0)
    expect(Array.isArray(fallback.plan_anchors)).toBe(true)
  })

  it('computePlanFallback preserves work_consumed=true', () => {
    const state = makeState({work_consumed: true})
    const fallback = computePlanFallback(state, '# Plan\n\n- Keep consumed state')
    expect(fallback.work_consumed).toBe(true)
  })

  it('computePlanFallback defaults work_consumed to false when field is absent', () => {
    const state = makeState() as ContextState
    delete (state as unknown as Record<string, unknown>).work_consumed

    const fallback = computePlanFallback(state, '# Plan\n\n- Missing consumed')
    expect(fallback.work_consumed).toBe(false)
  })

  it('shouldStage returns true for active mode with staged plan and unconsumed work', () => {
    const state = makeState({
      mode: 'active',
      plan_path: 'plans/plan.md',
      plan_hash: 'abc123def456',
      work_consumed: false,
    })
    expect(shouldStage(state, 'acceptEdits')).toBe(true)
  })

  it('shouldStage returns true in plan permission mode even when state is idle', () => {
    const state = makeState({
      mode: 'idle',
      handoff_path: 'handoffs/latest.md',
      next_artifact_type: 'handoff',
      work_consumed: false,
    })
    expect(shouldStage(state, 'plan')).toBe(true)
  })

  it('shouldStage returns false when no artifact exists', () => {
    const state = makeState({mode: 'active', work_consumed: false})
    expect(shouldStage(state, 'acceptEdits')).toBe(false)
  })

  it('shouldStage returns false when work is already consumed', () => {
    const state = makeState({
      mode: 'active',
      plan_path: 'plans/plan.md',
      plan_hash: 'abc123def456',
      work_consumed: true,
    })
    expect(shouldStage(state, 'acceptEdits')).toBe(false)
  })

  it('buildSessionMetadata includes transcript_path when provided', () => {
    const gitState: GitState = {
      branch: 'feature/phase5',
      last_commit_short: 'abc1234',
      uncommitted_files: ['a.ts'],
    }

    const metadata = buildSessionMetadata(
      'session-1',
      'SessionEnd',
      '/tmp/transcript.jsonl',
      gitState,
    )

    expect(metadata.session_id).toBe('session-1')
    expect(metadata.save_reason).toBe('SessionEnd')
    expect(metadata.transcript_path).toBe('/tmp/transcript.jsonl')
    expect(metadata.git_state).toEqual(gitState)
    expect(typeof metadata.saved_at).toBe('string')
  })

  it('buildSessionMetadata omits transcript_path when not provided', () => {
    const metadata = buildSessionMetadata('session-2', 'SessionStart', undefined, {})
    expect(metadata.session_id).toBe('session-2')
    expect(metadata.save_reason).toBe('SessionStart')
    expect(metadata).not.toHaveProperty('transcript_path')
  })

  it('generateArchiveFilename uses base name when no collision exists', () => {
    const date = new Date('2026-03-04T18:45:00.000Z')
    const filename = generateArchiveFilename('session-abc', date, [])
    expect(filename).toBe('2026-03-04-1245-session-abc.jsonl')
  })

  it('generateArchiveFilename appends numeric suffix on collision', () => {
    const date = new Date('2026-03-04T18:45:00.000Z')
    const existing = ['2026-03-04-1245-session-abc.jsonl']
    const filename = generateArchiveFilename('session-abc', date, existing)
    expect(filename).toBe('2026-03-04-1245-session-abc-2.jsonl')
  })

  it('generateArchiveFilename increments suffix until a free filename is found', () => {
    const date = new Date('2026-03-04T18:45:00.000Z')
    const existing = [
      '2026-03-04-1245-session-abc.jsonl',
      '2026-03-04-1245-session-abc-2.jsonl',
      '2026-03-04-1245-session-abc-3.jsonl',
    ]
    const filename = generateArchiveFilename('session-abc', date, existing)
    expect(filename).toBe('2026-03-04-1245-session-abc-4.jsonl')
  })
})
