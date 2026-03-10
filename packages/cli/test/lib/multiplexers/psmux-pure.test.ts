import {describe, expect, it} from 'vitest'

import {
  type PsmuxVersion as _PsmuxVersion,
  buildAttachArgs,
  buildCreateSessionArgs,
  buildPsmuxBootstrapCommands,
  buildSplitWindowArgs,
  meetsMinVersion,
  parseVersionString,
  toPsmuxSplitFlag,
} from '../../../src/lib/multiplexers/psmux.js'

describe('psmux pure functions', () => {
  describe('toPsmuxSplitFlag', () => {
    it('maps horizontal to -h', () => {
      expect(toPsmuxSplitFlag('horizontal')).toBe('-h')
    })

    it('maps vertical to -v', () => {
      expect(toPsmuxSplitFlag('vertical')).toBe('-v')
    })
  })

  describe('meetsMinVersion', () => {
    it('rejects version below minimum (0.3.9)', () => {
      expect(meetsMinVersion({major: 0, minor: 3, patch: 9})).toBe(false)
    })

    it('accepts exact minimum version (0.4.0)', () => {
      expect(meetsMinVersion({major: 0, minor: 4, patch: 0})).toBe(true)
    })

    it('accepts version above minimum (0.4.1)', () => {
      expect(meetsMinVersion({major: 0, minor: 4, patch: 1})).toBe(true)
    })

    it('accepts higher minor version (0.5.0)', () => {
      expect(meetsMinVersion({major: 0, minor: 5, patch: 0})).toBe(true)
    })

    it('accepts higher major version (1.0.0)', () => {
      expect(meetsMinVersion({major: 1, minor: 0, patch: 0})).toBe(true)
    })

    it('rejects lower major version', () => {
      expect(meetsMinVersion({major: 0, minor: 3, patch: 99})).toBe(false)
    })
  })

  describe('parseVersionString', () => {
    it('parses standard version string', () => {
      expect(parseVersionString('psmux 0.4.2\n')).toEqual({major: 0, minor: 4, patch: 2})
    })

    it('parses version with extra whitespace', () => {
      expect(parseVersionString('  1.2.3  ')).toEqual({major: 1, minor: 2, patch: 3})
    })

    it('parses version embedded in text', () => {
      expect(parseVersionString('version 10.20.30 released')).toEqual({major: 10, minor: 20, patch: 30})
    })

    it('returns null for empty string', () => {
      expect(parseVersionString('')).toBeNull()
    })

    it('returns null for string without version pattern', () => {
      expect(parseVersionString('no version here')).toBeNull()
    })

    it('returns null for partial version', () => {
      expect(parseVersionString('0.4')).toBeNull()
    })
  })

  describe('buildPsmuxBootstrapCommands', () => {
    it('includes mouse option when enabled', () => {
      const commands = buildPsmuxBootstrapCommands(true)
      const mouseCmd = commands.find((c) => c.includes('mouse'))
      expect(mouseCmd).toEqual(['set-option', '-g', 'mouse', 'on'])
    })

    it('omits mouse option when disabled', () => {
      const commands = buildPsmuxBootstrapCommands(false)
      const mouseCmd = commands.find((c) => c.includes('mouse'))
      expect(mouseCmd).toBeUndefined()
    })

    it('always includes history-limit, cursor settings, and terminal-overrides', () => {
      const commands = buildPsmuxBootstrapCommands(false)
      const flat = commands.map((c) => c.join(' '))
      expect(flat).toContain('set-option -g history-limit 50000')
      expect(flat).toContain('set-option -g cursor-blink off')
      expect(flat).toContain('set-option -g cursor-style block')
      expect(flat).toContain('set-option -g status-interval 0')
      expect(flat.some((c) => c.includes('terminal-overrides'))).toBe(true)
    })

    it('has 6 commands when mouse enabled, 5 when disabled', () => {
      expect(buildPsmuxBootstrapCommands(true)).toHaveLength(6)
      expect(buildPsmuxBootstrapCommands(false)).toHaveLength(5)
    })
  })

  describe('buildCreateSessionArgs', () => {
    it('returns correct argument array structure', () => {
      const result = buildCreateSessionArgs({
        sessionName: 'aiw-main',
        cwd: 'C:\\repo',
        encodedCommand: 'ENC(command)',
      })
      expect(result).toEqual(['new-session', '-d', '-c', 'C:\\repo', '-s', 'aiw-main', 'ENC(command)'])
    })
  })

  describe('buildSplitWindowArgs', () => {
    it('builds horizontal split without optional params', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-h',
        encodedCommand: 'ENC(cmd)',
      })
      expect(result).toEqual(['split-window', '-h', '-P', '-F', '#{pane_id}', 'ENC(cmd)'])
    })

    it('includes cwd when provided', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-v',
        encodedCommand: 'ENC(cmd)',
        cwd: 'C:\\repo',
      })
      expect(result).toContain('-c')
      expect(result).toContain('C:\\repo')
    })

    it('includes splitTarget when provided', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-h',
        encodedCommand: 'ENC(cmd)',
        splitTarget: '%5',
      })
      expect(result).toContain('-t')
      expect(result).toContain('%5')
    })

    it('trims splitTarget whitespace', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-h',
        encodedCommand: 'ENC(cmd)',
        splitTarget: ' %5 ',
      })
      expect(result).toContain('%5')
    })

    it('omits splitTarget when it is only whitespace', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-h',
        encodedCommand: 'ENC(cmd)',
        splitTarget: '   ',
      })
      expect(result).not.toContain('-t')
    })

    it('includes both cwd and splitTarget when both provided', () => {
      const result = buildSplitWindowArgs({
        splitFlag: '-v',
        encodedCommand: 'ENC(cmd)',
        cwd: '/repo',
        splitTarget: '%3',
      })
      expect(result).toEqual([
        'split-window', '-v', '-P', '-F', '#{pane_id}',
        '-c', '/repo',
        '-t', '%3',
        'ENC(cmd)',
      ])
    })
  })

  describe('buildAttachArgs', () => {
    it('returns attach args for session name', () => {
      expect(buildAttachArgs('aiw-main')).toEqual(['attach', '-t', 'aiw-main'])
    })
  })
})
