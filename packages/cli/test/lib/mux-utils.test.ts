import {describe, expect, it} from 'vitest'

import {getLastLine, splitFlagFromDimensions} from '../../src/lib/mux-utils.js'

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
})
