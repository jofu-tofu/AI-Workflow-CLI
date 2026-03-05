import {describe, expect, it} from 'vitest'

import {
  buildSpawnedWindowArgs,
  buildUniqueSessionName,
  parseExtraEnv,
  resolvePromptText,
  sanitizeSessionName,
} from '../../src/lib/launch-options.js'

describe('launch-options', () => {
  describe('parseExtraEnv', () => {
    it('returns empty object for undefined input', () => {
      expect(parseExtraEnv(undefined)).toEqual({})
    })

    it('parses valid JSON object string', () => {
      expect(parseExtraEnv('{"A":"1","B":"two"}')).toEqual({A: '1', B: 'two'})
    })

    it('throws for invalid JSON', () => {
      expect(() => parseExtraEnv('{bad-json}')).toThrow('--env must be a valid JSON object string')
    })

    it('throws when parsed value is not an object', () => {
      expect(() => parseExtraEnv('["a", "b"]')).toThrow('--env must be a valid JSON object string')
    })
  })

  describe('resolvePromptText', () => {
    it('prefers --prompt text over --prompt-file', () => {
      let readCalls = 0
      const promptText = resolvePromptText(
        '  from-flag  ',
        '/tmp/prompt.txt',
        () => {
          readCalls++
          return 'from-file'
        },
      )

      expect(promptText).toBe('from-flag')
      expect(readCalls).toBe(0)
    })

    it('reads prompt from file when --prompt is empty', () => {
      const promptText = resolvePromptText(
        '   ',
        '  /tmp/prompt.txt  ',
        (filePath) => filePath === '/tmp/prompt.txt' ? '  from-file  ' : undefined,
      )
      expect(promptText).toBe('from-file')
    })

    it('returns undefined when no prompt flag or file path is provided', () => {
      const promptText = resolvePromptText(undefined, undefined, () => 'unused')
      expect(promptText).toBeUndefined()
    })

    it('returns undefined when file read throws', () => {
      const promptText = resolvePromptText(undefined, '/tmp/prompt.txt', () => {
        throw new Error('cannot read')
      })
      expect(promptText).toBeUndefined()
    })
  })

  describe('buildSpawnedWindowArgs', () => {
    it('builds argument list with codex/no-tmux/session/env and prompt-path', () => {
      const args = buildSpawnedWindowArgs({
        useCodex: true,
        disableTmux: true,
        promptPath: '/tmp/prompt-path.txt',
        promptFilePath: '/tmp/prompt-file.txt',
        rawEnvJson: '  {"A":"1"}  ',
        tmuxSessionFlag: '  session-name  ',
      })

      expect(args).toEqual([
        'aiw',
        'launch',
        '--spawned-window',
        '--codex',
        '--no-tmux',
        '--tmux-session',
        'session-name',
        '--env',
        '{"A":"1"}',
        '--prompt-path',
        '/tmp/prompt-path.txt',
      ])
    })

    it('uses prompt-file when prompt-path is not provided', () => {
      const args = buildSpawnedWindowArgs({
        useCodex: false,
        disableTmux: false,
        promptFilePath: '/tmp/prompt-file.txt',
      })

      expect(args).toEqual([
        'aiw',
        'launch',
        '--spawned-window',
        '--prompt-file',
        '/tmp/prompt-file.txt',
      ])
    })
  })

  describe('sanitizeSessionName', () => {
    it('normalizes spaces and special characters', () => {
      expect(sanitizeSessionName('  My Session!!  ')).toBe('my-session')
    })

    it('trims leading/trailing separators and falls back to aiw', () => {
      expect(sanitizeSessionName('__Hello__')).toBe('hello')
      expect(sanitizeSessionName('!!!')).toBe('aiw')
    })
  })

  describe('buildUniqueSessionName', () => {
    it('builds deterministic name with injected now and pid', () => {
      const now = 1_700_000_000_000
      const pid = 4_242
      const expected = sanitizeSessionName(`my-session-${now.toString(36)}-${pid.toString(36)}`)

      expect(buildUniqueSessionName('My Session', now, pid)).toBe(expected)
    })
  })
})
