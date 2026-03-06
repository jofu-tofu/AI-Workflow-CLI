import {describe, expect, it} from 'vitest'

import {
  escapeSingleQuotedPath,
  quoteForPowerShell,
  quoteForSh,
  toEncodedPowerShell,
} from '../../src/lib/shell-quoting.js'

describe('shell-quoting', () => {
  describe('quoteForSh', () => {
    it('wraps plain input in single quotes', () => {
      expect(quoteForSh('abc')).toBe("'abc'")
    })

    it('preserves spaces inside single quotes', () => {
      expect(quoteForSh('hello world')).toBe("'hello world'")
    })

    it('escapes embedded single quotes safely', () => {
      expect(quoteForSh("it's fine")).toBe("'it'\"'\"'s fine'")
    })

    it('returns quoted empty string for empty input', () => {
      expect(quoteForSh('')).toBe("''")
    })

    it('re-quotes already quoted input safely', () => {
      const result = quoteForSh("'already-quoted'")
      expect(result).toBe("''\"'\"'already-quoted'\"'\"''")
      expect(result).toContain("'\"'\"'")
    })
  })

  describe('quoteForPowerShell', () => {
    it('wraps plain input in single quotes', () => {
      expect(quoteForPowerShell('abc')).toBe("'abc'")
    })

    it('doubles embedded single quotes', () => {
      expect(quoteForPowerShell("O'Hare")).toBe("'O''Hare'")
    })

    it('preserves special characters as literal text', () => {
      expect(quoteForPowerShell('$env:USER & dir')).toBe("'$env:USER & dir'")
    })
  })

  describe('toEncodedPowerShell', () => {
    it('round-trips command text via utf16le base64 payload', () => {
      const command = "$x='hello'; Write-Host $x"
      const wrapped = toEncodedPowerShell(command)
      const prefix = 'powershell.exe -NoProfile -EncodedCommand '

      expect(wrapped.startsWith(prefix)).toBe(true)
      const payload = wrapped.slice(prefix.length)
      const decoded = Buffer.from(payload, 'base64').toString('utf16le')
      expect(decoded).toBe(command)
    })
  })

  describe('escapeSingleQuotedPath', () => {
    it('escapes single quotes for bash dialect', () => {
      expect(escapeSingleQuotedPath("/tmp/it's-here", 'bash')).toBe(String.raw`/tmp/it'\''s-here`)
    })

    it('escapes single quotes for powershell dialect', () => {
      expect(escapeSingleQuotedPath("C:/it's-here", 'powershell')).toBe("C:/it''s-here")
    })
  })
})
