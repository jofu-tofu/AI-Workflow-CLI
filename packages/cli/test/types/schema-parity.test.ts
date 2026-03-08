/**
 * Phase 2.1 contract tests: verify Zod schemas match TypeScript interfaces.
 * Round-trip, rejection, nullable, and passthrough coverage.
 */

import {describe, expect, it} from 'vitest'

import {
  ContextStateSchema,
  HookInputSchema,
  IndexEntrySchema,
  IndexFileSchema,
  ModeSchema,
  TaskSchema,
} from '../../src/templates/core/lib-ts/schemas.js'

// ---------------------------------------------------------------------------
// Helpers: canonical valid objects matching the TS interfaces
// ---------------------------------------------------------------------------

function validTask() {
  return {
    active_form: 'implement',
    completed_at: null,
    created_at: '2025-01-01T00:00:00Z',
    description: 'Build the widget',
    evidence: 'tests pass',
    files_changed: ['src/widget.ts'],
    id: 'task-001',
    status: 'in_progress' as const,
    subject: 'widget',
    work_summary: 'Added widget module',
  }
}

function validContextState() {
  return {
    created_at: '2025-01-01T00:00:00Z',
    handoff_path: null,
    id: 'ctx-001',
    last_active: '2025-01-02T00:00:00Z',
    last_session: null,
    method: 'plan',
    mode: 'active' as const,
    next_artifact_type: null,
    plan_anchors: [],
    plan_hash: null,
    plan_hash_consumed: null,
    plan_id: null,
    plan_path: null,
    plan_signature: null,
    session_ids: ['sess-001'],
    status: 'active' as const,
    summary: 'Working on widgets',
    tags: ['infra'],
    tasks: [validTask()],
    work_consumed: false,
  }
}

function validHookInput() {
  return {
    hook_event_name: 'PostToolUse',
    session_id: 'sess-001',
    cwd: '/home/user/project',
    tool_name: 'Write',
    tool_input: {path: '/tmp/file.txt'},
    context_window: {
      context_window_size: 200_000,
      current_usage: {
        input_tokens: 5000,
        output_tokens: 1200,
        cache_read_input_tokens: 300,
        cache_creation_input_tokens: 0,
      },
    },
  }
}

function validIndexFile() {
  return {
    contexts: {
      'ctx-001': {
        last_active: '2025-01-02T00:00:00Z',
        mode: 'active',
        summary: 'Working on widgets',
      },
    },
    sessions: {
      'sess-001': 'ctx-001',
    },
    updated_at: '2025-01-02T00:00:00Z',
    version: '3.0' as const,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema parity – round-trip', () => {
  it('ModeSchema accepts all valid modes', () => {
    for (const m of ['active', 'has_staged_work', 'idle'] as const) {
      expect(ModeSchema.parse(m)).toBe(m)
    }
  })

  it('TaskSchema round-trips a valid Task', () => {
    const task = validTask()
    const parsed = TaskSchema.parse(task)
    expect(parsed).toEqual(task)
  })

  it('TaskSchema round-trips with optional session_id', () => {
    const task = {...validTask(), session_id: 'sess-002'}
    const parsed = TaskSchema.parse(task)
    expect(parsed).toEqual(task)
  })

  it('ContextStateSchema round-trips a valid ContextState', () => {
    const ctx = validContextState()
    const parsed = ContextStateSchema.parse(ctx)
    expect(parsed).toEqual(ctx)
  })

  it('HookInputSchema round-trips a valid HookInput', () => {
    const input = validHookInput()
    const parsed = HookInputSchema.parse(input)
    expect(parsed).toEqual(input)
  })

  it('HookInputSchema round-trips minimal HookInput', () => {
    const minimal = {hook_event_name: 'PreToolUse'}
    const parsed = HookInputSchema.parse(minimal)
    expect(parsed).toEqual(minimal)
  })

  it('IndexFileSchema round-trips a valid IndexFile', () => {
    const idx = validIndexFile()
    const parsed = IndexFileSchema.parse(idx)
    expect(parsed).toEqual(idx)
  })

  it('IndexEntrySchema round-trips a valid IndexEntry', () => {
    const entry = {last_active: '2025-01-01T00:00:00Z', mode: 'idle', summary: 'Done'}
    const parsed = IndexEntrySchema.parse(entry)
    expect(parsed).toEqual(entry)
  })
})

describe('Schema parity – rejection', () => {
  it('ContextStateSchema rejects missing required field (id)', () => {
    const bad = {...validContextState()}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (bad as any).id
    const result = ContextStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('ContextStateSchema rejects missing required field (mode)', () => {
    const bad = {...validContextState()}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (bad as any).mode
    const result = ContextStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('ContextStateSchema rejects wrong type for id (number)', () => {
    const bad = {...validContextState(), id: 42}
    const result = ContextStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('ContextStateSchema rejects invalid mode value', () => {
    const bad = {...validContextState(), mode: 'sleeping'}
    const result = ContextStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('ContextStateSchema rejects wrong type for tasks (not array)', () => {
    const bad = {...validContextState(), tasks: 'not-an-array'}
    const result = ContextStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('TaskSchema rejects missing required field (status)', () => {
    const bad = {...validTask()}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (bad as any).status
    const result = TaskSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('TaskSchema rejects invalid status enum value', () => {
    const bad = {...validTask(), status: 'cancelled'}
    const result = TaskSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('HookInputSchema rejects missing hook_event_name', () => {
    const bad = {session_id: 'sess-001', cwd: '/tmp'}
    const result = HookInputSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('HookInputSchema rejects wrong type for hook_event_name (number)', () => {
    const bad = {hook_event_name: 123}
    const result = HookInputSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('IndexFileSchema rejects wrong version literal', () => {
    const bad = {...validIndexFile(), version: '2.0'}
    const result = IndexFileSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('IndexFileSchema rejects missing contexts', () => {
    const bad = {sessions: {}, updated_at: '2025-01-01T00:00:00Z', version: '3.0'}
    const result = IndexFileSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('ModeSchema rejects invalid string', () => {
    const result = ModeSchema.safeParse('running')
    expect(result.success).toBe(false)
  })

  it('ModeSchema rejects non-string', () => {
    const result = ModeSchema.safeParse(42)
    expect(result.success).toBe(false)
  })
})

describe('Schema parity – nullable fields', () => {
  it('ContextState plan_path accepts null', () => {
    const ctx = {...validContextState(), plan_path: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_path).toBeNull()
  })

  it('ContextState plan_path accepts string', () => {
    const ctx = {...validContextState(), plan_path: '/plans/plan-001.md'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_path).toBe('/plans/plan-001.md')
  })

  it('ContextState plan_id accepts null', () => {
    const ctx = {...validContextState(), plan_id: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_id).toBeNull()
  })

  it('ContextState plan_id accepts string', () => {
    const ctx = {...validContextState(), plan_id: 'plan-abc'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_id).toBe('plan-abc')
  })

  it('ContextState plan_hash accepts null', () => {
    const ctx = {...validContextState(), plan_hash: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_hash).toBeNull()
  })

  it('ContextState plan_hash accepts string', () => {
    const ctx = {...validContextState(), plan_hash: 'abc123'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_hash).toBe('abc123')
  })

  it('ContextState plan_signature accepts null', () => {
    const ctx = {...validContextState(), plan_signature: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_signature).toBeNull()
  })

  it('ContextState plan_signature accepts string', () => {
    const ctx = {...validContextState(), plan_signature: 'sig-xyz'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_signature).toBe('sig-xyz')
  })

  it('ContextState handoff_path accepts null', () => {
    const ctx = {...validContextState(), handoff_path: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.handoff_path).toBeNull()
  })

  it('ContextState handoff_path accepts string', () => {
    const ctx = {...validContextState(), handoff_path: '/handoffs/h1.md'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.handoff_path).toBe('/handoffs/h1.md')
  })

  it('ContextState next_artifact_type accepts null', () => {
    const ctx = {...validContextState(), next_artifact_type: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.next_artifact_type).toBeNull()
  })

  it('ContextState next_artifact_type accepts "plan"', () => {
    const ctx = {...validContextState(), next_artifact_type: 'plan'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.next_artifact_type).toBe('plan')
  })

  it('ContextState next_artifact_type accepts "handoff"', () => {
    const ctx = {...validContextState(), next_artifact_type: 'handoff'}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.next_artifact_type).toBe('handoff')
  })

  it('ContextState last_session accepts null', () => {
    const ctx = {...validContextState(), last_session: null}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.last_session).toBeNull()
  })

  it('ContextState last_session accepts a valid LastSession object', () => {
    const ctx = {
      ...validContextState(),
      last_session: {
        session_id: 'sess-prev',
        saved_at: '2025-01-01T00:00:00Z',
        save_reason: 'manual',
      },
    }
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.last_session).toEqual(ctx.last_session)
  })

  it('Task completed_at accepts null', () => {
    const task = {...validTask(), completed_at: null}
    const result = TaskSchema.safeParse(task)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.completed_at).toBeNull()
  })

  it('Task completed_at accepts string', () => {
    const task = {...validTask(), completed_at: '2025-01-03T00:00:00Z'}
    const result = TaskSchema.safeParse(task)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.completed_at).toBe('2025-01-03T00:00:00Z')
  })

  it('nullable+optional fields accept absent keys (toDict strips nulls)', () => {
    // plan_path is nullable AND optional — absent key should pass
    // because toDict() historically strips null values from serialized JSON
    const ctx = {...validContextState()}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (ctx as any).plan_path
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
  })
})

describe('Schema parity – passthrough preserves unknown keys', () => {
  it('ContextStateSchema preserves cc_native extension fields', () => {
    const ctx = {
      ...validContextState(),
      cc_native_agent: 'review-agent',
      cc_native_version: '1.2.0',
    }
    const parsed = ContextStateSchema.parse(ctx)
    expect(parsed).toHaveProperty('cc_native_agent', 'review-agent')
    expect(parsed).toHaveProperty('cc_native_version', '1.2.0')
  })

  it('TaskSchema preserves unknown extension fields', () => {
    const task = {
      ...validTask(),
      custom_priority: 'high',
      estimated_hours: 4,
    }
    const parsed = TaskSchema.parse(task)
    expect(parsed).toHaveProperty('custom_priority', 'high')
    expect(parsed).toHaveProperty('estimated_hours', 4)
  })

  it('HookInputSchema preserves unknown extension fields', () => {
    const input = {
      ...validHookInput(),
      custom_hook_data: {key: 'value'},
    }
    const parsed = HookInputSchema.parse(input)
    expect(parsed).toHaveProperty('custom_hook_data')
    expect((parsed as Record<string, unknown>).custom_hook_data).toEqual({key: 'value'})
  })

  it('IndexFileSchema preserves unknown extension fields', () => {
    const idx = {
      ...validIndexFile(),
      migration_source: 'v2',
    }
    const parsed = IndexFileSchema.parse(idx)
    expect(parsed).toHaveProperty('migration_source', 'v2')
  })

  it('IndexEntrySchema preserves unknown extension fields', () => {
    const entry = {
      last_active: '2025-01-01T00:00:00Z',
      mode: 'active',
      summary: 'Working',
      extra_metric: 42,
    }
    const parsed = IndexEntrySchema.parse(entry)
    expect(parsed).toHaveProperty('extra_metric', 42)
  })

  it('passthrough does not leak known fields as extra', () => {
    const ctx = validContextState()
    const parsed = ContextStateSchema.parse(ctx)
    // All keys in parsed should match keys in original – no extra keys added
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(ctx).sort())
  })
})

describe('Schema parity – deprecated optional fields', () => {
  it('ContextState accepts handoff_consumed when present', () => {
    const ctx = {...validContextState(), handoff_consumed: true}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.handoff_consumed).toBe(true)
  })

  it('ContextState accepts plan_consumed when present', () => {
    const ctx = {...validContextState(), plan_consumed: false}
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.plan_consumed).toBe(false)
  })

  it('ContextState is valid without handoff_consumed', () => {
    const ctx = validContextState()
    // Ensure handoff_consumed is NOT present
    expect(ctx).not.toHaveProperty('handoff_consumed')
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
  })

  it('ContextState is valid without plan_consumed', () => {
    const ctx = validContextState()
    // Ensure plan_consumed is NOT present
    expect(ctx).not.toHaveProperty('plan_consumed')
    const result = ContextStateSchema.safeParse(ctx)
    expect(result.success).toBe(true)
  })

  it('Task accepts optional session_id when present', () => {
    const task = {...validTask(), session_id: 'sess-123'}
    const result = TaskSchema.safeParse(task)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.session_id).toBe('sess-123')
  })

  it('Task is valid without session_id', () => {
    const task = validTask()
    expect(task).not.toHaveProperty('session_id')
    const result = TaskSchema.safeParse(task)
    expect(result.success).toBe(true)
  })
})
