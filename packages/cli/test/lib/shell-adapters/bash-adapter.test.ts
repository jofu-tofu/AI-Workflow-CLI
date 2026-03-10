import {describe, expect, it} from 'vitest'

import {BashAdapter} from '../../../src/lib/shell-adapters/bash-adapter.js'

describe('BashAdapter', () => {
  const adapter = new BashAdapter()

  describe('quote', () => {
    it('wraps value in single quotes', () => {
      expect(adapter.quote('hello')).toBe("'hello'")
    })

    it('escapes single quotes within value', () => {
      const result = adapter.quote("it's")
      expect(result).toContain("it")
      expect(result).toContain("s")
    })
  })

  describe('buildEnvPreamble', () => {
    it('returns empty string for empty env', () => {
      expect(adapter.buildEnvPreamble({})).toBe('')
    })

    it('builds KEY=value pairs with sh quoting', () => {
      const result = adapter.buildEnvPreamble({FOO: 'bar', BAZ: 'qux'})
      expect(result).toContain("FOO='bar'")
      expect(result).toContain("BAZ='qux'")
    })
  })

  describe('buildToolCommand', () => {
    it('builds repl command with env and tool path', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: ['--flag'],
        env: {COLORTERM: 'truecolor'},
        mode: 'repl',
      })
      expect(result).toContain('COLORTERM=')
      expect(result).toContain('/usr/bin/claude')
      expect(result).toContain('--flag')
    })

    it('builds exec command with prompt redirect', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'exec',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).toContain('< ')
      expect(result).toContain('/tmp/prompt.md')
    })

    it('does not redirect in repl mode even with promptPath', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).not.toContain('< ')
    })

    it('appends prompt text as argument in repl mode', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptText: 'hello world',
      })
      expect(result).toContain('hello world')
    })
  })

  describe('buildNestingCleanup', () => {
    it('includes PATH fix', () => {
      expect(adapter.buildNestingCleanup()).toContain('export PATH=')
    })

    it('includes unset for nesting vars', () => {
      const result = adapter.buildNestingCleanup()
      expect(result).toContain('unset CLAUDECODE')
      expect(result).toContain('CLAUDE_CODE_ENTRYPOINT')
    })
  })

  describe('wrapQuickExitRetry', () => {
    it('includes warmup command and retry logic', () => {
      const result = adapter.wrapQuickExitRetry('run-cmd', '/usr/bin/tool')
      expect(result).toContain('/usr/bin/tool --version')
      expect(result).toContain('run-cmd')
      expect(result).toContain('SECONDS')
    })
  })

  describe('encodeForExecution', () => {
    it('returns command unchanged (no encoding for bash)', () => {
      expect(adapter.encodeForExecution('some command')).toBe('some command')
    })
  })
})
