import {afterEach, describe, expect, it} from 'vitest'

import {
  clearProcessNestingVars,
  isCalledFromRepl,
  REPL_NESTING_VARS,
  sanitizedProcessEnv,
} from '../../src/lib/env-sanitizer.js'

describe('env-sanitizer', () => {
  afterEach(() => {
    for (const v of REPL_NESTING_VARS) {
      delete process.env[v]
    }
  })

  describe('REPL_NESTING_VARS', () => {
    it('includes expected env var names', () => {
      expect(REPL_NESTING_VARS).toContain('CLAUDECODE')
      expect(REPL_NESTING_VARS).toContain('CLAUDE_CODE_ENTRYPOINT')
      expect(REPL_NESTING_VARS).toContain('CLAUDE_SESSION_ID')
      expect(REPL_NESTING_VARS).toContain('CODEX_THREAD_ID')
      expect(REPL_NESTING_VARS).toContain('AIWCLI_INTERNAL_CALL')
    })
  })

  describe('isCalledFromRepl', () => {
    it('returns false when no REPL vars are set', () => {
      expect(isCalledFromRepl()).toBe(false)
    })

    it('returns true when CLAUDECODE is set', () => {
      process.env.CLAUDECODE = '1'
      expect(isCalledFromRepl()).toBe(true)
    })

    it('returns true when CODEX_THREAD_ID is set', () => {
      process.env.CODEX_THREAD_ID = 'abc'
      expect(isCalledFromRepl()).toBe(true)
    })
  })

  describe('clearProcessNestingVars', () => {
    it('removes all nesting vars from process.env', () => {
      process.env.CLAUDECODE = '1'
      process.env.CLAUDE_SESSION_ID = 'session'
      clearProcessNestingVars()
      expect(process.env.CLAUDECODE).toBeUndefined()
      expect(process.env.CLAUDE_SESSION_ID).toBeUndefined()
    })
  })

  describe('sanitizedProcessEnv', () => {
    it('returns env without nesting vars', () => {
      process.env.CLAUDECODE = '1'
      const env = sanitizedProcessEnv()
      expect(env.CLAUDECODE).toBeUndefined()
    })

    it('merges extra env vars', () => {
      const env = sanitizedProcessEnv({CUSTOM: 'value'})
      expect(env.CUSTOM).toBe('value')
    })

    it('strips AIWCLI_INTERNAL_CALL', () => {
      process.env.AIWCLI_INTERNAL_CALL = 'true'
      const env = sanitizedProcessEnv()
      expect(env.AIWCLI_INTERNAL_CALL).toBeUndefined()
    })
  })
})
