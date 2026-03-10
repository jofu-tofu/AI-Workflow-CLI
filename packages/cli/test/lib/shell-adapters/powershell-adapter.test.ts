import {describe, expect, it} from 'vitest'

import {PowerShellAdapter} from '../../../src/lib/shell-adapters/powershell-adapter.js'

describe('PowerShellAdapter', () => {
  const adapter = new PowerShellAdapter()

  describe('quote', () => {
    it('wraps value in single quotes', () => {
      expect(adapter.quote('hello')).toBe("'hello'")
    })

    it('escapes single quotes by doubling', () => {
      expect(adapter.quote("it's")).toBe("'it''s'")
    })
  })

  describe('buildEnvPreamble', () => {
    it('returns empty string for empty env', () => {
      expect(adapter.buildEnvPreamble({})).toBe('')
    })

    it('builds $env: assignments with PS quoting', () => {
      const result = adapter.buildEnvPreamble({FOO: 'bar'})
      expect(result).toContain("$env:FOO='bar'")
    })

    it('separates multiple vars with semicolons', () => {
      const result = adapter.buildEnvPreamble({FOO: 'bar', BAZ: 'qux'})
      expect(result).toContain('; ')
    })
  })

  describe('buildToolCommand', () => {
    it('builds command with env vars and tool path', () => {
      const result = adapter.buildToolCommand({
        toolPath: 'C:\\tools\\claude.exe',
        args: [],
        env: {FOO: 'bar'},
        mode: 'repl',
      })
      expect(result).toContain("$env:FOO='bar'")
      expect(result).toContain("& 'C:\\tools\\claude.exe'")
    })

    it('includes args as @() array', () => {
      const result = adapter.buildToolCommand({
        toolPath: 'C:\\tools\\claude.exe',
        args: ['--dangerously-skip-permissions'],
        env: {},
        mode: 'repl',
      })
      expect(result).toContain("@('--dangerously-skip-permissions')")
    })

    it('pipes prompt content in exec mode with promptPath', () => {
      const result = adapter.buildToolCommand({
        toolPath: 'C:\\tools\\claude.exe',
        args: [],
        env: {},
        mode: 'exec',
        promptPath: 'C:\\tmp\\prompt.md',
      })
      expect(result).toContain('Get-Content -Raw -Path')
    })
  })

  describe('buildNestingCleanup', () => {
    it('includes Remove-Item for nesting vars', () => {
      const result = adapter.buildNestingCleanup()
      expect(result).toContain('Remove-Item Env:\\CLAUDECODE')
      expect(result).toContain('-ErrorAction SilentlyContinue')
    })
  })

  describe('encodeForExecution', () => {
    it('wraps command in powershell.exe -EncodedCommand', () => {
      const result = adapter.encodeForExecution('Write-Host hello')
      expect(result).toContain('powershell.exe')
      expect(result).toContain('-EncodedCommand')
    })
  })

  describe('resolveToolPath', () => {
    it('returns native path unchanged', async () => {
      const result = await adapter.resolveToolPath('claude', 'C:\\tools\\claude.exe')
      expect(result).toBe('C:\\tools\\claude.exe')
    })
  })
})
