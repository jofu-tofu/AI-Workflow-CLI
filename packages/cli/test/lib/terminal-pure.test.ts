import {describe, expect, it} from 'vitest'

import {
  buildLinuxTerminalSpawnArgs,
  buildMacTerminalSpawnArgs,
  buildPowerShellFallbackSpawnArgs,
  buildWindowsTerminalSpawnArgs,
  buildWSLTerminalSpawnArgs,
  resolveTerminalPlatform,
} from '../../src/lib/terminal.js'

describe('terminal pure functions', () => {
  describe('resolveTerminalPlatform', () => {
    it('returns windows for win32 platform', () => {
      expect(resolveTerminalPlatform('win32', false)).toBe('windows')
    })

    it('returns windows for win32 even when WSL is true', () => {
      expect(resolveTerminalPlatform('win32', true)).toBe('windows')
    })

    it('returns darwin for darwin platform', () => {
      expect(resolveTerminalPlatform('darwin', false)).toBe('darwin')
    })

    it('returns wsl for linux platform when WSL detected', () => {
      expect(resolveTerminalPlatform('linux', true)).toBe('wsl')
    })

    it('returns linux for linux platform without WSL', () => {
      expect(resolveTerminalPlatform('linux', false)).toBe('linux')
    })

    it('returns linux for freebsd platform', () => {
      expect(resolveTerminalPlatform('freebsd', false)).toBe('linux')
    })
  })

  describe('buildMacTerminalSpawnArgs', () => {
    it('returns osascript command', () => {
      const result = buildMacTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.command).toBe('osascript')
    })

    it('includes AppleScript tell command', () => {
      const result = buildMacTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.args).toHaveLength(2)
      expect(result.args[0]).toBe('-e')
      expect(result.args[1]).toContain('tell application "Terminal" to do script')
    })

    it('includes cd and command in script', () => {
      const result = buildMacTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.args[1]).toContain('/repo')
      expect(result.args[1]).toContain('aiw launch')
    })

    it('escapes double quotes in the command for AppleScript', () => {
      const result = buildMacTerminalSpawnArgs('/repo', 'echo "hello"')
      expect(result.args[1]).toContain(String.raw`\"`)
    })

    it('escapes backslashes for AppleScript', () => {
      const result = buildMacTerminalSpawnArgs('/repo', 'echo \\n')
      expect(result.args[1]).toContain('\\\\')
    })
  })

  describe('buildWindowsTerminalSpawnArgs', () => {
    it('returns wt command', () => {
      const result = buildWindowsTerminalSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.command).toBe('wt')
    })

    it('includes -d flag with cwd', () => {
      const result = buildWindowsTerminalSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.args[0]).toBe('-d')
      expect(result.args[1]).toBe('C:\\repo')
    })

    it('includes powershell command with -NoExit and -Command', () => {
      const result = buildWindowsTerminalSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.args).toEqual(['-d', 'C:\\repo', 'pwsh', '-NoExit', '-Command', 'aiw launch'])
    })

    it('uses powershell 5.1 when specified', () => {
      const result = buildWindowsTerminalSpawnArgs('C:\\repo', 'aiw launch', 'powershell')
      expect(result.args[2]).toBe('powershell')
    })
  })

  describe('buildPowerShellFallbackSpawnArgs', () => {
    it('returns powershell command', () => {
      const result = buildPowerShellFallbackSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.command).toBe('pwsh')
    })

    it('includes -Command flag', () => {
      const result = buildPowerShellFallbackSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.args[0]).toBe('-Command')
    })

    it('includes Start-Process in command', () => {
      const result = buildPowerShellFallbackSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.args[1]).toContain('Start-Process pwsh')
    })

    it('includes -NoExit and cd in ArgumentList', () => {
      const result = buildPowerShellFallbackSpawnArgs('C:\\repo', 'aiw launch', 'pwsh')
      expect(result.args[1]).toContain('-NoExit')
      expect(result.args[1]).toContain('C:\\repo')
      expect(result.args[1]).toContain('aiw launch')
    })

    it('uses the correct powershell command name', () => {
      const result = buildPowerShellFallbackSpawnArgs('C:\\repo', 'aiw launch', 'powershell')
      expect(result.command).toBe('powershell')
      expect(result.args[1]).toContain('Start-Process powershell')
    })
  })

  describe('buildLinuxTerminalSpawnArgs', () => {
    it('uses terminal cmd from terminalInfo', () => {
      const result = buildLinuxTerminalSpawnArgs('/repo', 'aiw launch', {
        cmd: 'gnome-terminal',
        getArgs: (cmd) => ['--', 'bash', '-c', `${cmd}; exec bash`],
      })
      expect(result.command).toBe('gnome-terminal')
    })

    it('passes full command through getArgs', () => {
      const result = buildLinuxTerminalSpawnArgs('/repo', 'aiw launch', {
        cmd: 'gnome-terminal',
        getArgs: (cmd) => ['--', 'bash', '-c', `${cmd}; exec bash`],
      })
      expect(result.args).toEqual([
        '--', 'bash', '-c',
        expect.stringContaining('aiw launch'),
      ])
    })

    it('includes cd in the full command', () => {
      const result = buildLinuxTerminalSpawnArgs('/repo', 'aiw launch', {
        cmd: 'xterm',
        getArgs: (cmd) => ['-e', cmd],
      })
      expect(result.args[1]).toContain("cd '/repo'")
      expect(result.args[1]).toContain('aiw launch')
    })

    it('works with konsole-style getArgs', () => {
      const result = buildLinuxTerminalSpawnArgs('/repo', 'aiw launch', {
        cmd: 'konsole',
        getArgs: (cmd) => ['-e', 'bash', '-c', cmd],
      })
      expect(result.command).toBe('konsole')
      expect(result.args[0]).toBe('-e')
    })
  })

  describe('buildWSLTerminalSpawnArgs', () => {
    it('returns wt.exe command', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.command).toBe('wt.exe')
    })

    it('includes wsl.exe and bash chain', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.args[0]).toBe('wsl.exe')
      expect(result.args[1]).toBe('--')
      expect(result.args[2]).toBe('bash')
      expect(result.args[3]).toBe('-c')
    })

    it('includes cd and command with exec bash suffix', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      const bashCmd = result.args[4]
      expect(bashCmd).toContain("cd '/repo'")
      expect(bashCmd).toContain('aiw launch')
      expect(bashCmd).toContain('exec bash')
    })
  })
})
