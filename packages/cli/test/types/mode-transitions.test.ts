import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  createContext,
  getContext,
  maybeActivate,
  updateMode,
} from '../../src/templates/core/lib-ts/context/context-store.js'
import type {ContextState} from '../../src/templates/core/lib-ts/types.js'

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aiwcli-mode-transitions-'))
  mkdirSync(join(root, '.aiwcli'), {recursive: true})
  return root
}

describe('mode transitions', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const r of roots) {
      if (existsSync(r)) rmSync(r, {recursive: true, force: true})
    }

    roots.length = 0
  })

  it('idle -> active via maybeActivate', () => {
    const root = createProjectRoot()
    roots.push(root)

    const state = createContext('trans-idle-active', 'idle to active test', '', root)
    expect(state.mode).toBe('idle')

    const changed = maybeActivate('trans-idle-active', 'acceptEdits', root, 'test')
    expect(changed).toBe(true)

    const updated = getContext('trans-idle-active', root)
    expect(updated).not.toBeNull()
    expect(updated!.mode).toBe('active')
  })

  it('has_staged_work -> active via maybeActivate', () => {
    const root = createProjectRoot()
    roots.push(root)

    createContext('trans-staged-active', 'staged to active test', '', root)

    updateMode('trans-staged-active', 'has_staged_work', root, {
      plan_path: '/tmp/plan.md',
      plan_hash: 'abc123',
    })

    const staged = getContext('trans-staged-active', root)
    expect(staged).not.toBeNull()
    expect(staged!.mode).toBe('has_staged_work')

    const changed = maybeActivate('trans-staged-active', 'acceptEdits', root, 'test')
    expect(changed).toBe(true)

    const updated = getContext('trans-staged-active', root)
    expect(updated).not.toBeNull()
    expect(updated!.mode).toBe('active')
    expect(updated!.work_consumed).toBe(true)
  })

  it('idempotent re-activation returns false', () => {
    const root = createProjectRoot()
    roots.push(root)

    createContext('trans-idempotent', 'idempotent test', '', root)

    const first = maybeActivate('trans-idempotent', 'acceptEdits', root, 'test')
    expect(first).toBe(true)

    const second = maybeActivate('trans-idempotent', 'acceptEdits', root, 'test')
    expect(second).toBe(false)

    const state = getContext('trans-idempotent', root)
    expect(state).not.toBeNull()
    expect(state!.mode).toBe('active')
  })

  it('plan permission mode prevents activation', () => {
    const root = createProjectRoot()
    roots.push(root)

    createContext('trans-plan-block', 'plan block test', '', root)
    expect(getContext('trans-plan-block', root)!.mode).toBe('idle')

    const changed = maybeActivate('trans-plan-block', 'plan', root, 'test')
    expect(changed).toBe(false)

    const state = getContext('trans-plan-block', root)
    expect(state).not.toBeNull()
    expect(state!.mode).toBe('idle')
  })

  it('active -> idle via updateMode clears plan/handoff fields', () => {
    const root = createProjectRoot()
    roots.push(root)

    createContext('trans-active-idle', 'active to idle test', '', root)
    maybeActivate('trans-active-idle', 'acceptEdits', root, 'test')

    const active = getContext('trans-active-idle', root)
    expect(active).not.toBeNull()
    expect(active!.mode).toBe('active')

    updateMode('trans-active-idle', 'idle', root)

    const idle = getContext('trans-active-idle', root)
    expect(idle).not.toBeNull()
    expect(idle!.mode).toBe('idle')
    expect(idle!.plan_path).toBeNull()
    expect(idle!.plan_hash).toBeNull()
    expect(idle!.handoff_path).toBeNull()
  })

  it('full lifecycle: idle -> has_staged_work -> active -> idle', () => {
    const root = createProjectRoot()
    roots.push(root)

    // Phase 1: create (starts idle)
    const state = createContext('trans-lifecycle', 'full lifecycle test', '', root)
    expect(state.mode).toBe('idle')

    // Phase 2: idle -> has_staged_work
    updateMode('trans-lifecycle', 'has_staged_work', root, {
      plan_path: '/tmp/lifecycle-plan.md',
      plan_hash: 'hash456',
    })

    const staged = getContext('trans-lifecycle', root)
    expect(staged).not.toBeNull()
    expect(staged!.mode).toBe('has_staged_work')
    expect(staged!.plan_path).toBe('/tmp/lifecycle-plan.md')
    expect(staged!.plan_hash).toBe('hash456')

    // Phase 3: has_staged_work -> active
    const changed = maybeActivate('trans-lifecycle', 'acceptEdits', root, 'test')
    expect(changed).toBe(true)

    const active = getContext('trans-lifecycle', root)
    expect(active).not.toBeNull()
    expect(active!.mode).toBe('active')
    expect(active!.work_consumed).toBe(true)

    // Phase 4: active -> idle (clears everything)
    updateMode('trans-lifecycle', 'idle', root)

    const idle = getContext('trans-lifecycle', root)
    expect(idle).not.toBeNull()
    expect(idle!.mode).toBe('idle')
    expect(idle!.plan_path).toBeNull()
    expect(idle!.plan_hash).toBeNull()
    expect(idle!.handoff_path).toBeNull()
  })
})
