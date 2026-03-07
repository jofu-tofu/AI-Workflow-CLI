import {describe, expect, it} from 'vitest'

import {cleanClaudeEnv, getLastLine, splitFlagFromDimensions} from '../../src/lib/mux-utils.js'

describe('mux-utils', () => {
  describe('getLastLine', () => {
    it('returns the last non-empty trimmed line from multiline input', () => {
      const input = 'first line\n\n  second line  \n  last line   \n'
      expect(getLastLine(input)).toBe('last line')
    })

    it('returns the single line when there is no newline', () => {
      expect(getLastLine('  only line  ')).toBe('only line')
    })

    it('returns an empty string for empty or whitespace-only input', () => {
      expect(getLastLine('')).toBe('')
      expect(getLastLine(' \n \r\n\t')).toBe('')
    })
  })

  describe('splitFlagFromDimensions', () => {
    it('chooses horizontal split for wide panes', () => {
      expect(splitFlagFromDimensions(220, 80)).toBe('-h')
    })

    it('chooses vertical split for tall panes', () => {
      expect(splitFlagFromDimensions(120, 90)).toBe('-v')
    })

    it('uses horizontal split at the width/height*2 boundary', () => {
      expect(splitFlagFromDimensions(200, 100)).toBe('-h')
    })
  })

  describe('cleanClaudeEnv', () => {
    it('removes CLAUDE env vars while preserving extra vars', () => {
      const env = cleanClaudeEnv({
        CLAUDECODE: 'remove-me',
        CLAUDE_CODE_ENTRYPOINT: 'remove-me-too',
        TEST_KEEP: 'value',
      })

      expect(env.CLAUDECODE).toBeUndefined()
      expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
      expect(env.TEST_KEEP).toBe('value')
    })

    it('strips AIWCLI_INTERNAL_CALL so launched sessions are not marked internal', () => {
      process.env.AIWCLI_INTERNAL_CALL = 'true'
      const env = cleanClaudeEnv()
      expect(env.AIWCLI_INTERNAL_CALL).toBeUndefined()
      delete process.env.AIWCLI_INTERNAL_CALL
    })
  })
})
