import {describe, expect, it} from 'vitest'

import {
  detectPowerShell,
  findAvailableLinuxTerminal,
  isWSL,
  resolveWindowsTerminalStrategy,
} from '../../src/lib/terminal-strategy.js'

describe('terminal-strategy', () => {
  describe('resolveWindowsTerminalStrategy', () => {
    it('prefers mintty then git-bash-in-wt when mintty preference is selected', () => {
      const strategies = resolveWindowsTerminalStrategy(
        'mintty',
        'C:/Program Files/Git/bin/bash.exe',
        true,
        'pwsh',
      )

      expect(strategies).toEqual(['mintty', 'git-bash-in-wt', 'powershell-fallback'])
    })

    it('falls back to git-bash-in-wt when mintty is unavailable', () => {
      const strategies = resolveWindowsTerminalStrategy(
        'mintty',
        'C:/Program Files/Git/bin/bash.exe',
        false,
        '',
      )

      expect(strategies).toEqual(['git-bash-in-wt'])
    })

    it('falls back to windows-terminal when git-bash path is missing', () => {
      const strategies = resolveWindowsTerminalStrategy('git-bash', null, false, '')
      expect(strategies).toEqual(['windows-terminal'])
    })

    it('uses windows-terminal for default preference and appends powershell fallback', () => {
      const strategies = resolveWindowsTerminalStrategy('default', null, false, 'powershell')
      expect(strategies).toEqual(['windows-terminal', 'powershell-fallback'])
    })
  })

  describe('detectPowerShell', () => {
    it('returns pwsh when available', () => {
      const shell = detectPowerShell((command) => command === 'pwsh')
      expect(shell).toBe('pwsh')
    })

    it('falls back to powershell when pwsh is not available', () => {
      const seen: string[] = []
      const shell = detectPowerShell((command) => {
        seen.push(command)
        return false
      })

      expect(shell).toBe('powershell')
      expect(seen).toEqual(['pwsh'])
    })
  })

  describe('isWSL', () => {
    it('returns true when WSL_DISTRO_NAME is set', () => {
      expect(isWSL({WSL_DISTRO_NAME: 'Ubuntu'})).toBe(true)
    })

    it('returns false when WSL_DISTRO_NAME is not set', () => {
      expect(isWSL({})).toBe(false)
    })
  })

  describe('findAvailableLinuxTerminal', () => {
    it('returns the first available configured terminal', () => {
      const terminal = findAvailableLinuxTerminal((command) => command === 'xterm')
      expect(terminal?.cmd).toBe('xterm')
    })

    it('returns null when no terminals are available', () => {
      const terminal = findAvailableLinuxTerminal(() => false)
      expect(terminal).toBeNull()
    })
  })
})
