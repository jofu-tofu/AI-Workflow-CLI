import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {defaultShell} from '../../src/lib/terminal-strategy.js'
import {
  buildLinuxTerminalSpawnArgs,
  buildMacTerminalScriptContent,
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
    it('returns open command', () => {
      const result = buildMacTerminalSpawnArgs('/tmp/aiw.command')
      expect(result.command).toBe('open')
    })

    it('targets Terminal.app with the generated script', () => {
      const result = buildMacTerminalSpawnArgs('/tmp/aiw.command')
      expect(result.args).toEqual(['-a', 'Terminal', '/tmp/aiw.command'])
    })
  })

  describe('buildMacTerminalScriptContent', () => {
    it('wraps the launch in the requested login shell', () => {
      const result = buildMacTerminalScriptContent('/repo', 'aiw launch', '/bin/zsh')
      expect(result).toContain('#!/bin/sh')
      expect(result).toContain(`exec '/bin/zsh' -lc '`)
      expect(result).toContain('aiw launch')
    })

    it('keeps the working directory and login shell handoff in the script', () => {
      const result = buildMacTerminalScriptContent('/repo', 'echo "hello"', '/bin/zsh')
      expect(result).toContain('/repo')
      expect(result).toContain('echo "hello"')
      expect(result).toContain(`/bin/zsh`)
      expect(result).toContain('-l')
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
    const originalShell = process.env.SHELL

    beforeEach(() => {
      process.env.SHELL = '/bin/bash'
    })

    afterEach(() => {
      if (originalShell === undefined) {
        delete process.env.SHELL
      } else {
        process.env.SHELL = originalShell
      }
    })

    it('returns wt.exe command', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.command).toBe('wt.exe')
    })

    it('uses the default shell from $SHELL', () => {
      process.env.SHELL = '/usr/bin/zsh'
      const shell = defaultShell()
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.args[0]).toBe('wsl.exe')
      expect(result.args[1]).toBe('--')
      expect(result.args[2]).toBe(shell)
      expect(result.args[3]).toBe('-c')
    })

    it('includes wsl.exe and shell chain', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      expect(result.args[0]).toBe('wsl.exe')
      expect(result.args[1]).toBe('--')
      expect(result.args[2]).toBe('/bin/bash')
      expect(result.args[3]).toBe('-c')
    })

    it('includes cd and command with exec shell suffix', () => {
      const result = buildWSLTerminalSpawnArgs('/repo', 'aiw launch')
      const shellCmd = result.args[4]
      expect(shellCmd).toContain("cd '/repo'")
      expect(shellCmd).toContain('aiw launch')
      expect(shellCmd).toContain('exec /bin/bash')
    })
  })
})
