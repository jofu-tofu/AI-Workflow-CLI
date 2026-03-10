import {describe, expect, it} from 'vitest'

import {
  buildTmuxCreateSessionArgs,
  buildTmuxSplitWindowArgs,
  toTmuxSplitFlag,
  withWindowsTmuxBootstrap,
} from '../../../src/lib/multiplexers/tmux.js'

describe('tmux pure functions', () => {
  describe('toTmuxSplitFlag', () => {
    it('maps horizontal to -h', () => {
      expect(toTmuxSplitFlag('horizontal')).toBe('-h')
    })

    it('maps vertical to -v', () => {
      expect(toTmuxSplitFlag('vertical')).toBe('-v')
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
