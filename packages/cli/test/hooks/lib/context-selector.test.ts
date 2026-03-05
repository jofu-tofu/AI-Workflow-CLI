import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  BlockRequest,
  determineContext,
  parseChainedCaret,
  resolveContextByPrefix,
} from '../../../src/templates/_shared/lib-ts/context/context-selector.js'
import {
  bindSession,
  createContext,
  getContext,
  loadState,
  saveState,
  updateMode,
} from '../../../src/templates/_shared/lib-ts/context/context-store.js'
import {normalizePlanContent} from '../../../src/templates/_shared/lib-ts/context/plan-manager.js'
import {getContextDir} from '../../../src/templates/_shared/lib-ts/runtime/constants.js'
import type {ContextState} from '../../../src/templates/_shared/lib-ts/types.js'

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-context-selector-'))
  mkdirSync(join(root, '.aiwcli'), {recursive: true})
  return root
}

function makeContext(id: string, summary = 'test context'): ContextState {
  const now = '2026-03-04T18:30:00.000Z'
  return {
    id,
    status: 'active',
    summary,
    method: 'test',
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
  }
}

describe('context-selector', () => {
  const projectRoots: string[] = []

  afterEach(() => {
    delete process.env.AIWCLI_INTERNAL_CALL

    while (projectRoots.length > 0) {
      const root = projectRoots.pop()
      if (!root) continue
      rmSync(root, {force: true, recursive: true})
    }
  })

  describe('resolveContextByPrefix', () => {
    const contexts = [
      makeContext('260304-1837-alpha-task'),
      makeContext('260304-1838-alpine-fix'),
      makeContext('260304-1839-beta-task'),
    ]

    it('resolves exact ID match first', () => {
      const [idx, err] = resolveContextByPrefix('260304-1839-beta-task', contexts)
      expect(idx).toBe(3)
      expect(err).toBeNull()
    })

    it('resolves unique prefix match', () => {
      const [idx, err] = resolveContextByPrefix('260304-1839', contexts)
      expect(idx).toBe(3)
      expect(err).toBeNull()
    })

    it('returns ambiguity error for multiple prefix matches', () => {
      const [idx, err] = resolveContextByPrefix('260304-183', contexts)
      expect(idx).toBeNull()
      expect(err).toContain('Ambiguous match')
      expect(err).toContain('prefix matches')
    })

    it('resolves unique substring match when prefix does not match', () => {
      const [idx, err] = resolveContextByPrefix('beta', contexts)
      expect(idx).toBe(3)
      expect(err).toBeNull()
    })

    it('returns not found error with available IDs', () => {
      const [idx, err] = resolveContextByPrefix('missing-id', contexts)
      expect(idx).toBeNull()
      expect(err).toContain("No context matches 'missing-id'")
      expect(err).toContain('260304-1837-alpha-task')
    })
  })

  describe('parseChainedCaret', () => {
    const contexts = [makeContext('ctx-a'), makeContext('ctx-b'), makeContext('ctx-c')]

    it('returns [null, null] when prompt does not start with caret', () => {
      const result = parseChainedCaret('continue implementation', contexts)
      expect(result).toEqual([null, null])
    })

    it('parses numeric select command with remaining prompt', () => {
      const [command, error] = parseChainedCaret('^2 keep going', contexts)
      expect(error).toBeNull()
      expect(command).toEqual({
        ends: [],
        select: 'ctx-b',
        new_context_desc: null,
        remaining_prompt: 'keep going',
      })
    })

    it('parses new context command with description', () => {
      const [command, error] = parseChainedCaret('^0 implement auth flow', contexts)
      expect(error).toBeNull()
      expect(command?.new_context_desc).toBe('implement auth flow')
      expect(command?.remaining_prompt).toBe('')
    })

    it('rejects new context command when description is too short', () => {
      const [command, error] = parseChainedCaret('^0 short', contexts)
      expect(command).toBeNull()
      expect(error).toContain('Minimum required: 10 characters')
    })

    it('parses chained end-select commands', () => {
      const [command, error] = parseChainedCaret('^E1S2 continue', contexts)
      expect(error).toBeNull()
      expect(command).toEqual({
        ends: ['ctx-a'],
        select: 'ctx-b',
        new_context_desc: null,
        remaining_prompt: 'continue',
      })
    })

    it('parses ID-query select command', () => {
      const [command, error] = parseChainedCaret('^S:ctx-c continue', contexts)
      expect(error).toBeNull()
      expect(command?.select).toBe('ctx-c')
      expect(command?.remaining_prompt).toBe('continue')
    })

    it('rejects command that selects a context being ended', () => {
      const [command, error] = parseChainedCaret('^E1S1', contexts)
      expect(command).toBeNull()
      expect(error).toContain("Cannot select context 'ctx-a'")
    })
  })

  describe('determineContext', () => {
    it('returns session_match when session is already bound to a context', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)
      createContext('ctx-session', 'Session context', 'manual', projectRoot)
      bindSession('ctx-session', 'session-1', projectRoot)

      const [contextId, method, outputText] = determineContext('new prompt text', 'session-1', projectRoot)
      expect(contextId).toBe('ctx-session')
      expect(method).toBe('session_match')
      expect(outputText).toContain('Active Context')
    })

    it('handles caret selection when active contexts exist', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)
      createContext('ctx-caret', 'Caret context', 'manual', projectRoot)

      const [contextId, method] = determineContext('^1 continue work', undefined, projectRoot)
      expect(contextId).toBe('ctx-caret')
      expect(method).toBe('caret_select')
    })

    it('throws BlockRequest for bare caret when no contexts exist', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)

      expect(() => determineContext('^', undefined, projectRoot)).toThrow(BlockRequest)
      expect(() => determineContext('^', undefined, projectRoot)).toThrow(/No contexts exist/i)
    })

    it('matches staged plan context by plan content and consumes staged work', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)
      const ctx = createContext('ctx-plan', 'Plan context', 'manual', projectRoot)
      const contextDir = getContextDir(ctx.id, projectRoot)
      const planDir = join(contextDir, 'plans')
      const planPath = join(planDir, 'phase5-plan.md')
      const planContent = [
        '# Implementation Plan',
        '',
        '- Extract pure logic',
        '- Add unit tests',
        '- Validate with vitest',
      ].join('\n')
      mkdirSync(planDir, {recursive: true})
      writeFileSync(planPath, planContent, 'utf8')

      const normalized = normalizePlanContent(planContent)
      const planHash = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12)
      updateMode(ctx.id, 'has_staged_work', projectRoot, {
        plan_path: planPath,
        plan_hash: planHash,
        work_consumed: false,
      })

      const [contextId, method] = determineContext(planContent, 'session-plan', projectRoot)
      expect(contextId).toBe(ctx.id)
      expect(method).toBe('plan_content_match')

      const updatedState = loadState(ctx.id, projectRoot)
      expect(updatedState?.mode).toBe('active')
      expect(updatedState?.work_consumed).toBe(true)
      expect(updatedState?.plan_hash_consumed).toBe(planHash)
      expect(updatedState?.session_ids).toContain('session-plan')
    })

    it('falls back to first staged handoff context and consumes staged work', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)
      const ctx = createContext('ctx-handoff', 'Handoff context', 'manual', projectRoot)

      const state = getContext(ctx.id, projectRoot)
      expect(state).not.toBeNull()
      if (!state) return

      const handoffPath = join(getContextDir(ctx.id, projectRoot), 'handoffs', 'handoff.md')
      mkdirSync(join(getContextDir(ctx.id, projectRoot), 'handoffs'), {recursive: true})
      writeFileSync(handoffPath, 'handoff content', 'utf8')

      state.mode = 'has_staged_work'
      state.handoff_path = handoffPath
      state.next_artifact_type = 'handoff'
      state.work_consumed = false
      saveState(state.id, state, projectRoot)

      const [contextId, method] = determineContext('continue implementation', 'session-handoff', projectRoot)
      expect(contextId).toBe(ctx.id)
      expect(method).toBe('handoff_match')

      const updatedState = loadState(ctx.id, projectRoot)
      expect(updatedState?.mode).toBe('active')
      expect(updatedState?.work_consumed).toBe(true)
      expect(updatedState?.session_ids).toContain('session-handoff')
    })

    it('does not skip context selection when internal call flag is set', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)
      process.env.AIWCLI_INTERNAL_CALL = 'true'

      const [contextId, method, outputText] = determineContext(
        'implement from internal call',
        'session-internal',
        projectRoot,
      )
      expect(contextId).toBeTruthy()
      expect(method.startsWith('auto_created')).toBe(true)
      expect(outputText).toContain('Context Created')
    })

    it('auto-creates a context when no match logic applies', () => {
      const projectRoot = createProjectRoot()
      projectRoots.push(projectRoot)

      const [contextId, method, outputText] = determineContext(
        'Implement pure function tests for hooks in phase five',
        'session-auto-create',
        projectRoot,
      )

      expect(contextId).toBeTruthy()
      expect(method.startsWith('auto_created')).toBe(true)
      expect(outputText).toContain('Context Created')

      const createdState = contextId ? loadState(contextId, projectRoot) : null
      expect(createdState).not.toBeNull()
      expect(createdState?.mode).toBe('active')
    })
  })
})
