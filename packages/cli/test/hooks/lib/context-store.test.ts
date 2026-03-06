import {createHash, randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  bindSession,
  createContext,
  determineArtifactType,
  getContext,
  getContextBySessionId,
  loadState,
  maybeActivate,
  saveState,
  updateMode,
} from '../../../src/templates/core/lib-ts/context/context-store.js'
import {getContextDir, getIndexPath} from '../../../src/templates/core/lib-ts/runtime/constants.js'
import type {ContextState} from '../../../src/templates/core/lib-ts/types.js'

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-context-store-'))
  mkdirSync(join(root, '.aiwcli'), {recursive: true})
  return root
}

function readIndex(projectRoot: string): {
  contexts: Record<string, {last_active: string; mode: string; summary: string}>
  sessions: Record<string, string>
  updated_at: string
  version: string
} {
  return JSON.parse(readFileSync(getIndexPath(projectRoot), 'utf8')) as {
    contexts: Record<string, {last_active: string; mode: string; summary: string}>
    sessions: Record<string, string>
    updated_at: string
    version: string
  }
}

function makeState(overrides: Partial<ContextState> = {}): ContextState {
  const now = '2026-03-04T18:30:00.000Z'
  return {
    id: 'ctx-test',
    status: 'active',
    summary: 'summary',
    method: 'test',
    tags: [],
    created_at: now,
    last_active: now,
    mode: 'idle',
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

describe('context-store', () => {
  const projectRoots: string[] = []

  afterEach(() => {
    while (projectRoots.length > 0) {
      const root = projectRoots.pop()
      if (!root) continue
      rmSync(root, {force: true, recursive: true})
    }
  })

  it('createContext creates context directory, notes directory, and state/index entries', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)

    const state = createContext('ctx-create', 'Create context test', 'manual', projectRoot, ['phase5'])

    expect(state.id).toBe('ctx-create')
    expect(existsSync(getContextDir('ctx-create', projectRoot))).toBe(true)
    expect(existsSync(join(getContextDir('ctx-create', projectRoot), 'notes'))).toBe(true)

    const reloaded = loadState('ctx-create', projectRoot)
    expect(reloaded?.summary).toBe('Create context test')
    expect(reloaded?.tags).toEqual(['phase5'])

    const index = readIndex(projectRoot)
    expect(index.contexts['ctx-create']?.summary).toBe('Create context test')
  })

  it('createContext generates an ID when contextId is null', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)

    const state = createContext(null, 'Generated context from summary', 'auto', projectRoot)

    expect(state.id.length).toBeGreaterThan(0)
    expect(existsSync(getContextDir(state.id, projectRoot))).toBe(true)
    expect(loadState(state.id, projectRoot)?.id).toBe(state.id)
  })

  it('createContext rejects path traversal IDs', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)

    expect(() => createContext('../evil', 'x', 'test', projectRoot)).toThrow(/path traversal/i)
    expect(() => createContext('..%2fescape', 'x', 'test', projectRoot)).toThrow(/path traversal/i)
  })

  it('saveState persists state changes and updates index sessions map', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-save', 'Before save', 'manual', projectRoot)

    const state = getContext('ctx-save', projectRoot)
    expect(state).not.toBeNull()
    if (!state) return

    state.summary = 'After save'
    state.session_ids = ['session-save']
    const [ok, err] = saveState('ctx-save', state, projectRoot)

    expect(ok).toBe(true)
    expect(err).toBeNull()

    const reloaded = loadState('ctx-save', projectRoot)
    expect(reloaded?.summary).toBe('After save')

    const index = readIndex(projectRoot)
    expect(index.contexts['ctx-save']?.summary).toBe('After save')
    expect(index.sessions['session-save']).toBe('ctx-save')
  })

  it('getContextBySessionId resolves from index session mapping', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-index', 'Index lookup', 'manual', projectRoot)
    bindSession('ctx-index', 'session-index', projectRoot)

    const found = getContextBySessionId('session-index', projectRoot)
    expect(found?.id).toBe('ctx-index')
  })

  it('getContextBySessionId falls back to scanning contexts when index mapping is missing', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-scan', 'Scan fallback', 'manual', projectRoot)
    bindSession('ctx-scan', 'session-scan', projectRoot)

    const indexPath = getIndexPath(projectRoot)
    const index = readIndex(projectRoot)
    delete index.sessions['session-scan']
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')

    const found = getContextBySessionId('session-scan', projectRoot)
    expect(found?.id).toBe('ctx-scan')
  })

  it('bindSession adds a session to state and index', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-bind', 'Bind session', 'manual', projectRoot)

    const bound = bindSession('ctx-bind', 'session-bind', projectRoot)
    expect(bound).toBe(true)

    const state = getContext('ctx-bind', projectRoot)
    expect(state?.session_ids).toContain('session-bind')

    const index = readIndex(projectRoot)
    expect(index.sessions['session-bind']).toBe('ctx-bind')
  })

  it('bindSession is idempotent for duplicate session IDs', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-bind-dupe', 'Bind duplicate', 'manual', projectRoot)

    expect(bindSession('ctx-bind-dupe', 'session-dupe', projectRoot)).toBe(true)
    expect(bindSession('ctx-bind-dupe', 'session-dupe', projectRoot)).toBe(true)

    const state = getContext('ctx-bind-dupe', projectRoot)
    const count = state?.session_ids.filter((id) => id === 'session-dupe').length ?? 0
    expect(count).toBe(1)
  })

  it('updateMode updates mode and plan metadata fields', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-mode', 'Mode update', 'manual', projectRoot)

    const updated = updateMode('ctx-mode', 'has_staged_work', projectRoot, {
      plan_path: 'plans/phase5.md',
      plan_hash: 'abc123def456',
      plan_signature: 'Phase 5',
      plan_id: 'plan-1',
      plan_anchors: ['anchor-a', 'anchor-b'],
      work_consumed: true,
      plan_hash_consumed: 'abc123def456',
    })

    expect(updated?.mode).toBe('has_staged_work')
    expect(updated?.plan_path).toBe('plans/phase5.md')
    expect(updated?.plan_hash).toBe('abc123def456')
    expect(updated?.plan_id).toBe('plan-1')
    expect(updated?.plan_anchors).toEqual(['anchor-a', 'anchor-b'])
    expect(updated?.work_consumed).toBe(true)
    expect(updated?.plan_hash_consumed).toBe('abc123def456')
  })

  it('updateMode clears staged artifact fields when returning to idle', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-idle-clear', 'Idle clear', 'manual', projectRoot)

    const state = getContext('ctx-idle-clear', projectRoot)
    expect(state).not.toBeNull()
    if (!state) return

    state.mode = 'has_staged_work'
    state.plan_path = 'plans/plan.md'
    state.plan_hash = 'fedcba987654'
    state.plan_signature = 'signature'
    state.plan_id = 'plan-id'
    state.plan_anchors = ['first']
    state.plan_hash_consumed = 'fedcba987654'
    state.handoff_path = 'handoffs/latest.md'
    state.work_consumed = true
    state.next_artifact_type = 'handoff'
    saveState(state.id, state, projectRoot)

    const updated = updateMode('ctx-idle-clear', 'idle', projectRoot)
    expect(updated?.mode).toBe('idle')
    expect(updated?.plan_path).toBeNull()
    expect(updated?.plan_hash).toBeNull()
    expect(updated?.plan_signature).toBeNull()
    expect(updated?.plan_id).toBeNull()
    expect(updated?.plan_anchors).toEqual([])
    expect(updated?.plan_hash_consumed).toBeNull()
    expect(updated?.handoff_path).toBeNull()
    expect(updated?.work_consumed).toBe(false)
    expect(updated?.next_artifact_type).toBeNull()
  })

  it('maybeActivate transitions idle to active when permission mode is not plan', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-activate', 'Activate context', 'manual', projectRoot)

    const changed = maybeActivate('ctx-activate', 'acceptEdits', projectRoot, 'test')
    expect(changed).toBe(true)
    expect(getContext('ctx-activate', projectRoot)?.mode).toBe('active')
  })

  it('maybeActivate transitions has_staged_work to active and marks work as consumed', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-activate-staged', 'Activate staged', 'manual', projectRoot)
    updateMode('ctx-activate-staged', 'has_staged_work', projectRoot, {
      plan_path: 'plans/ready.md',
      plan_hash: createHash('sha256').update('phase5').digest('hex').slice(0, 12),
      work_consumed: false,
    })

    const changed = maybeActivate('ctx-activate-staged', 'acceptEdits', projectRoot, 'test')
    expect(changed).toBe(true)

    const state = getContext('ctx-activate-staged', projectRoot)
    expect(state?.mode).toBe('active')
    expect(state?.work_consumed).toBe(true)
  })

  it('maybeActivate does not activate in plan permission mode and is a no-op for active mode', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-no-activate', 'No activate', 'manual', projectRoot)

    const blockedByPlan = maybeActivate('ctx-no-activate', 'plan', projectRoot, 'test')
    expect(blockedByPlan).toBe(false)
    expect(getContext('ctx-no-activate', projectRoot)?.mode).toBe('idle')

    updateMode('ctx-no-activate', 'active', projectRoot)
    const alreadyActive = maybeActivate('ctx-no-activate', 'acceptEdits', projectRoot, 'test')
    expect(alreadyActive).toBe(false)
    expect(getContext('ctx-no-activate', projectRoot)?.mode).toBe('active')
  })

  it('determineArtifactType honors explicit next_artifact_type and falls back to field detection', () => {
    const explicit = makeState({
      next_artifact_type: 'handoff',
      plan_path: 'plans/plan.md',
      plan_hash: 'abc123def456',
      handoff_path: 'handoffs/latest.md',
    })
    const planOnly = makeState({plan_path: 'plans/plan.md', plan_hash: 'abc123def456'})
    const handoffOnly = makeState({handoff_path: 'handoffs/latest.md'})
    const none = makeState()

    expect(determineArtifactType(explicit)).toBe('handoff')
    expect(determineArtifactType(planOnly)).toBe('plan')
    expect(determineArtifactType(handoffOnly)).toBe('handoff')
    expect(determineArtifactType(none)).toBeNull()
  })

  it('determineArtifactType returns plan when both plan and handoff are present without explicit type', () => {
    const conflicted = makeState({
      plan_path: 'plans/plan.md',
      plan_hash: 'abc123def456',
      handoff_path: 'handoffs/latest.md',
      next_artifact_type: null,
    })
    expect(determineArtifactType(conflicted)).toBe('plan')
  })

  it('saveState throws when contextId fails validation', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    const state = makeState({id: 'ctx-valid', summary: 'x'})

    expect(() => saveState('../bad', state, projectRoot)).toThrow(/path traversal/i)
  })

  it('bindSession returns false for unknown session IDs and missing contexts', () => {
    const projectRoot = createProjectRoot()
    projectRoots.push(projectRoot)
    createContext('ctx-bind-false', 'Bind false', 'manual', projectRoot)

    expect(bindSession('ctx-bind-false', 'unknown', projectRoot)).toBe(false)
    expect(bindSession(`missing-${randomUUID()}`, 'session-real', projectRoot)).toBe(false)
  })
})
