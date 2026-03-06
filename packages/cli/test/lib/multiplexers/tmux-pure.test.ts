import {describe, expect, it, vi} from 'vitest'

import {
  buildCommandArgs,
  buildEnvPrefix,
  buildShToolCommand,
  buildTmuxCreateSessionArgs,
  buildTmuxSplitWindowArgs,
  withWindowsTmuxBootstrap,
} from '../../../src/lib/multiplexers/tmux.js'

describe('tmux pure functions', () => {
  describe('buildEnvPrefix', () => {
    it('returns empty string for empty env', () => {
      expect(buildEnvPrefix({})).toBe('')
    })

    it('builds single env var assignment', () => {
      const result = buildEnvPrefix({FOO: 'bar'})
      expect(result).toContain('FOO=')
      expect(result).toContain('bar')
    })

    it('builds multiple env vars space-separated', () => {
      const result = buildEnvPrefix({FOO: 'bar', BAZ: 'qux'})
      expect(result).toContain('FOO=')
      expect(result).toContain('BAZ=')
    })
  })

  describe('buildShToolCommand', () => {
    it('builds basic repl command with env and tool path', () => {
      const result = buildShToolCommand({
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
      const result = buildShToolCommand({
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
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).not.toContain('< ')
    })

    it('appends prompt text as argument in repl mode', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptText: 'hello world',
      })
      expect(result).toContain('hello world')
    })
  })

  describe('buildCommandArgs', () => {
    it('returns args unchanged in exec mode', () => {
      expect(buildCommandArgs(['--flag'], 'exec', 'some text')).toEqual(['--flag'])
    })

    it('returns args unchanged in repl mode without promptText', () => {
      expect(buildCommandArgs(['--flag'], 'repl')).toEqual(['--flag'])
    })

    it('returns args unchanged in repl mode with undefined promptText', () => {
      expect(buildCommandArgs(['--flag'], 'repl', undefined)).toEqual(['--flag'])
    })

    it('appends promptText in repl mode', () => {
      expect(buildCommandArgs(['--flag'], 'repl', 'hello')).toEqual(['--flag', 'hello'])
    })

    it('appends even empty string promptText in repl mode', () => {
      expect(buildCommandArgs([], 'repl', '')).toEqual([''])
    })
  })

  describe('withWindowsTmuxBootstrap', () => {
    it('returns command unchanged on non-win32 platform', () => {
      expect(withWindowsTmuxBootstrap('some command', 'linux')).toBe('some command')
    })

    it('returns command unchanged on darwin platform', () => {
      expect(withWindowsTmuxBootstrap('some command', 'darwin')).toBe('some command')
    })

    it('prepends bootstrap commands on win32 platform', () => {
      const result = withWindowsTmuxBootstrap('my-command', 'win32')
      expect(result).toContain('my-command')
      // The bootstrap prefix should come before the original command
      expect(result.indexOf('my-command')).toBeGreaterThan(0)
      expect(result).toContain('; my-command')
    })
  })

  describe('buildTmuxSplitWindowArgs', () => {
    it('builds basic horizontal split args', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-h',
        command: 'bash -lc "run"',
      })
      expect(result).toEqual(['split-window', '-h', '-P', '-F', '#{pane_id}', 'bash -lc "run"'])
    })

    it('builds vertical split args', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-v',
        command: 'bash -lc "run"',
      })
      expect(result[1]).toBe('-v')
    })

    it('includes cwd when provided', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-h',
        command: 'cmd',
        cwd: '/repo',
      })
      expect(result).toContain('-c')
      expect(result).toContain('/repo')
    })

    it('includes splitTarget when provided', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-h',
        command: 'cmd',
        splitTarget: '%5',
      })
      expect(result).toContain('-t')
      expect(result).toContain('%5')
    })

    it('includes both cwd and splitTarget when both provided', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-v',
        command: 'cmd',
        cwd: '/repo',
        splitTarget: '%3',
      })
      expect(result).toEqual([
        'split-window', '-v', '-P', '-F', '#{pane_id}',
        '-c', '/repo',
        '-t', '%3',
        'cmd',
      ])
    })

    it('omits cwd when not provided', () => {
      const result = buildTmuxSplitWindowArgs({
        splitFlag: '-h',
        command: 'cmd',
      })
      expect(result).not.toContain('-c')
    })
  })

  describe('buildTmuxCreateSessionArgs', () => {
    it('builds new-session args without reattach', () => {
      const result = buildTmuxCreateSessionArgs({
        sessionName: 'aiw-main',
        cwd: '/repo',
        shellCommand: 'bootstrap command',
      })
      expect(result).toEqual(['new-session', '-c', '/repo', '-s', 'aiw-main', 'bootstrap command'])
    })

    it('includes -A flag when reattach is true', () => {
      const result = buildTmuxCreateSessionArgs({
        sessionName: 'aiw-main',
        cwd: '/repo',
        shellCommand: 'bootstrap command',
        reattach: true,
      })
      expect(result).toEqual(['new-session', '-A', '-c', '/repo', '-s', 'aiw-main', 'bootstrap command'])
    })

    it('omits -A flag when reattach is false', () => {
      const result = buildTmuxCreateSessionArgs({
        sessionName: 'aiw-main',
        cwd: '/repo',
        shellCommand: 'cmd',
        reattach: false,
      })
      expect(result).not.toContain('-A')
    })

    it('omits -A flag when reattach is undefined', () => {
      const result = buildTmuxCreateSessionArgs({
        sessionName: 'aiw-main',
        cwd: '/repo',
        shellCommand: 'cmd',
      })
      expect(result).not.toContain('-A')
    })
  })
})
