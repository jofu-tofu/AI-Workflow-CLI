import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  checkSkipPersistence,
  CONTEXT_BASELINE_TOKENS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  getContextPercentRemaining,
  getToolInput,
  parseContextWindow,
  validateHookEvent,
} from '../../../src/templates/core/lib-ts/hooks/hook-utils.js'
import type {HookInput} from '../../../src/templates/core/lib-ts/types.js'
import {type ContextFixture, createContextFixture} from '../fixtures/context-fixture.js'

describe('hook-utils', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('validateHookEvent returns true when expected event and tool match', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
    }

    expect(validateHookEvent(payload, 'PostToolUse')).toBe(true)
    expect(validateHookEvent(payload, 'PostToolUse', 'Write')).toBe(true)
  })

  it('validateHookEvent returns false for mismatched event or tool', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
    }

    expect(validateHookEvent(payload, 'PreToolUse')).toBe(false)
    expect(validateHookEvent(payload, 'PostToolUse', 'Write')).toBe(false)
  })

  it('getToolInput returns object tool_input and null otherwise', () => {
    const withObject: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_input: {path: 'src/index.ts'},
    }
    const withoutObject: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_input: 'not-an-object' as unknown as Record<string, unknown>,
    }

    expect(getToolInput(withObject)).toEqual({path: 'src/index.ts'})
    expect(getToolInput(withoutObject)).toBeNull()
  })

  it('checkSkipPersistence honors metadata.skip_persistence', () => {
    const skipPayload: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_input: {metadata: {skip_persistence: true}},
    }
    const keepPayload: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_input: {metadata: {skip_persistence: false}},
    }

    expect(checkSkipPersistence(skipPayload, 'test-hook')).toBe(true)
    expect(checkSkipPersistence(keepPayload, 'test-hook')).toBe(false)
  })

  it('parseContextWindow returns nulls when context window data is missing', () => {
    const payload: HookInput = {hook_event_name: 'PostToolUse'}
    expect(parseContextWindow(payload)).toEqual([null, null])
  })

  it('parseContextWindow computes token usage with baseline and explicit max tokens', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      context_window: {
        current_usage: {
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 100,
          input_tokens: 200,
          output_tokens: 25,
        },
        context_window_size: 100_000,
      },
    }

    const [tokensUsed, maxTokens] = parseContextWindow(payload)
    expect(tokensUsed).toBe(CONTEXT_BASELINE_TOKENS + 375)
    expect(maxTokens).toBe(100_000)
  })

  it('parseContextWindow falls back to default context window size when not provided', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      context_window: {
        current_usage: {
          input_tokens: 10,
        },
      },
    }

    const [tokensUsed, maxTokens] = parseContextWindow(payload)
    expect(tokensUsed).toBe(CONTEXT_BASELINE_TOKENS + 10)
    expect(maxTokens).toBe(DEFAULT_CONTEXT_WINDOW_SIZE)
  })

  it('getContextPercentRemaining computes and rounds percentage from context_window', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      context_window: {
        current_usage: {
          input_tokens: 7400,
        },
        context_window_size: 100_000,
      },
    }

    const [pct, tokensUsed, maxTokens] = getContextPercentRemaining(payload)
    expect(tokensUsed).toBe(CONTEXT_BASELINE_TOKENS + 7400)
    expect(maxTokens).toBe(100_000)
    expect(pct).toBe(70)
  })

  it('getContextPercentRemaining clamps negative percentage to zero', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      context_window: {
        current_usage: {
          input_tokens: 5000,
        },
        context_window_size: 100,
      },
    }

    const [pct] = getContextPercentRemaining(payload)
    expect(pct).toBe(0)
  })

  it('getContextPercentRemaining falls back to last_session.context_remaining_pct', async () => {
    const fixture = await createContextFixture({sessionId: 'session-fallback'})
    fixtures.push(fixture)

    const statePath = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'state.json',
    )
    const state = fixture.getState()
    state.last_session = {
      context_remaining_pct: 42,
      saved_at: '2026-03-04T18:37:00.000Z',
      session_id: 'session-fallback',
    }
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')

    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      cwd: fixture.projectRoot,
      session_id: 'session-fallback',
    }
    expect(getContextPercentRemaining(payload)).toEqual([42, null, null])
  })

  it('getContextPercentRemaining returns nulls when no context metrics are available', () => {
    const payload: HookInput = {
      hook_event_name: 'PostToolUse',
      cwd: '/path/that/does/not/matter',
      session_id: 'missing-session',
    }
    expect(getContextPercentRemaining(payload)).toEqual([null, null, null])
  })
})
