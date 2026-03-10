import {describe, expect, it} from 'vitest'

import {
  buildWeztermKillArgs,
  buildWeztermSpawnArgs,
  buildWeztermSplitArgs,
  toWeztermSplitFlag,
} from '../../../src/lib/multiplexers/wezterm.js'

describe('wezterm pure functions', () => {
  describe('toWeztermSplitFlag', () => {
    it('maps horizontal to --right', () => {
      expect(toWeztermSplitFlag('horizontal')).toBe('--right')
    })

    it('maps vertical to --bottom', () => {
      expect(toWeztermSplitFlag('vertical')).toBe('--bottom')
    })
  })

  describe('buildWeztermSplitArgs', () => {
    it('builds horizontal split (--right) with command', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--right',
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'split-pane', '--right', '--', 'bash', '-c', 'echo hello'])
    })

    it('builds vertical split (--bottom) with command', () => {
      const result = buildWeztermSplitArgs({
        splitFlag: '--bottom',
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'split-pane', '--bottom', '--', 'bash', '-c', 'echo hello'])
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
        '--', 'bash', '-c', 'my-cmd',
      ])
    })
  })

  describe('buildWeztermSpawnArgs', () => {
    it('builds spawn --new-window with command', () => {
      const result = buildWeztermSpawnArgs({
        command: 'echo hello',
      })
      expect(result).toEqual(['cli', 'spawn', '--new-window', '--', 'bash', '-c', 'echo hello'])
    })

    it('includes --cwd when provided', () => {
      const result = buildWeztermSpawnArgs({
        command: 'echo hello',
        cwd: '/home/user/repo',
      })
      expect(result).toEqual([
        'cli', 'spawn', '--new-window',
        '--cwd', '/home/user/repo',
        '--', 'bash', '-c', 'echo hello',
      ])
    })
  })

  describe('buildWeztermKillArgs', () => {
    it('builds kill-pane with --pane-id', () => {
      expect(buildWeztermKillArgs('42')).toEqual(['cli', 'kill-pane', '--pane-id', '42'])
    })
  })
})
