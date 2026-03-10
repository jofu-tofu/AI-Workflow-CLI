import {describe, expect, it} from 'vitest'

import {
  buildCommandArgs,
  buildEnvPrefix,
  buildShToolCommand,
  buildWeztermKillArgs,
  buildWeztermSpawnArgs,
  buildWeztermSplitArgs,
  weztermSplitFlagFromDirection,
} from '../../../src/lib/multiplexers/wezterm.js'

describe('wezterm pure functions', () => {
  describe('buildEnvPrefix', () => {
    it('builds space-separated KEY=value pairs with sh quoting', () => {
      const result = buildEnvPrefix({FOO: 'bar', BAZ: 'qux'})
      expect(result).toContain("FOO='bar'")
      expect(result).toContain("BAZ='qux'")
    })

    it('returns empty string for empty env', () => {
      expect(buildEnvPrefix({})).toBe('')
    })
  })

  describe('buildCommandArgs', () => {
    it('returns args unchanged in exec mode', () => {
      expect(buildCommandArgs(['--flag'], 'exec', 'some text')).toEqual(['--flag'])
    })

    it('returns args unchanged in repl mode without promptText', () => {
      expect(buildCommandArgs(['--flag'], 'repl')).toEqual(['--flag'])
    })

    it('appends promptText in repl mode', () => {
      const result = buildCommandArgs(['--flag'], 'repl', 'hello')
      expect(result).toEqual(['--flag', 'hello'])
    })

    it('returns empty array when args is empty and mode is exec', () => {
      expect(buildCommandArgs([], 'exec')).toEqual([])
    })
  })

  describe('buildShToolCommand', () => {
    it('builds command with env vars and tool path', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {FOO: 'bar'},
        mode: 'repl',
      })
      expect(result).toContain("FOO='bar'")
      expect(result).toContain("'/usr/bin/claude'")
    })

    it('builds command without env vars', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
      })
      expect(result).not.toContain('FOO=')
      expect(result).toContain("'/usr/bin/claude'")
    })

    it('includes args in the invocation', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: ['--dangerously-skip-permissions'],
        env: {},
        mode: 'repl',
      })
      expect(result).toContain("'--dangerously-skip-permissions'")
    })

    it('pipes prompt content in exec mode with promptPath', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'exec',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).toContain("< '/tmp/prompt.md'")
    })

    it('does not pipe in repl mode even with promptPath', () => {
      const result = buildShToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).not.toContain('<')
    })
  })

  describe('buildWeztermSplitArgs', () => {
    it('builds horizontal split (--right) with command', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--right',
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'split-pane', '--right', '--', 'bash', '-lc', 'echo hello'])
    })

    it('builds vertical split (--bottom) with command', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--bottom',
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'split-pane', '--bottom', '--', 'bash', '-lc', 'echo hello'])
    })

    it('includes --cwd when provided', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--right',
        command: 'echo hello',
        cwd: '/home/user/repo',
      })
      expect(result).toContain('--cwd')
      expect(result).toContain('/home/user/repo')
    })

    it('includes --pane-id when provided', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--right',
        command: 'echo hello',
        paneId: '42',
      })
      expect(result).toContain('--pane-id')
      expect(result).toContain('42')
    })

    it('includes both --cwd and --pane-id when both provided', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--bottom',
        command: 'my-cmd',
        cwd: '/repo',
        paneId: '7',
      })
      expect(result).toEqual([
        'cli', 'split-pane', '--bottom',
        '--cwd', '/repo',
        '--pane-id', '7',
        '--', 'bash', '-lc', 'my-cmd',
      ])
    })
  })

  describe('buildWeztermSpawnArgs', () => {
    it('builds spawn --new-window with command', () => {
      const result = buildWeztermSpawnArgs({
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'spawn', '--new-window', '--', 'bash', '-lc', 'echo hello'])
    })

    it('includes --cwd when provided', () => {
      const result = buildWeztermSpawnArgs({
        command: 'echo hello',
        cwd: '/home/user/repo',
      })
      expect(result).toEqual([
        'cli', 'spawn', '--new-window',
        '--cwd', '/home/user/repo',
        '--', 'bash', '-lc', 'echo hello',
      ])
    })
  })

  describe('buildWeztermKillArgs', () => {
    it('builds kill-pane with --pane-id', () => {
      expect(buildWeztermKillArgs('42')).toEqual(['cli', 'kill-pane', '--pane-id', '42'])
    })
  })

  describe('weztermSplitFlagFromDirection', () => {
    it('maps h to --right', () => {
      expect(weztermSplitFlagFromDirection('h')).toBe('--right')
    })

    it('maps v to --bottom', () => {
      expect(weztermSplitFlagFromDirection('v')).toBe('--bottom')
    })
  })
})
