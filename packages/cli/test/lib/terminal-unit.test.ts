import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanClaudeEnv: vi.fn(() => ({AIWCLI_INTERNAL_CALL: 'true'})),
  detectPowerShell: vi.fn(() => 'pwsh'),
  escapeSingleQuotedPath: vi.fn((value: string) => value),
  existsSync: vi.fn(() => true),
  findAvailableLinuxTerminal: vi.fn(() => ({
    cmd: 'gnome-terminal',
    getArgs: (command: string) => ['--', 'bash', '-c', `${command}; exec bash`],
  })),
  findMsysBash: vi.fn(() => 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'),
  isCommandAvailable: vi.fn(() => true),
  isWSL: vi.fn(() => false),
  isWindowsPlatform: vi.fn((platform?: NodeJS.Platform) => platform === 'win32'),
  resolveWindowsTerminalStrategy: vi.fn(() => ['windows-terminal']),
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
}))

vi.mock('../../src/lib/mux-utils.js', () => ({
  cleanClaudeEnv: mocks.cleanClaudeEnv,
}))

vi.mock('../../src/lib/runtime/executable-policy.js', () => ({
  isCommandAvailable: mocks.isCommandAvailable,
}))

vi.mock('../../src/lib/runtime/platform-adapter.js', () => ({
  isWindowsPlatform: mocks.isWindowsPlatform,
}))

vi.mock('../../src/lib/runtime/tmux-preflight.js', () => ({
  findMsysBash: mocks.findMsysBash,
}))

vi.mock('../../src/lib/shell-quoting.js', () => ({
  escapeSingleQuotedPath: mocks.escapeSingleQuotedPath,
}))

vi.mock('../../src/lib/terminal-strategy.js', () => ({
  detectPowerShell: mocks.detectPowerShell,
  findAvailableLinuxTerminal: mocks.findAvailableLinuxTerminal,
  isWSL: mocks.isWSL,
  resolveWindowsTerminalStrategy: mocks.resolveWindowsTerminalStrategy,
}))

import {launchTerminal} from '../../src/lib/terminal.js'

function queueSpawnResults(results: Array<Error | null>): void {
  mocks.spawn.mockImplementation(() => {
    const error = results.shift() ?? null
    const handlers: {error?: (err: Error) => void} = {}

    const child = {
      on: vi.fn((event: string, callback: (err: Error) => void) => {
        if (event === 'error') handlers.error = callback
        return child
      }),
      unref: vi.fn(() => {
        if (error && handlers.error) handlers.error(error)
      }),
    }

    return child
  })
}

describe('terminal unit', () => {
  let platformSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    queueSpawnResults([null, null, null])
    mocks.resolveWindowsTerminalStrategy.mockReturnValue(['windows-terminal'])
    mocks.findAvailableLinuxTerminal.mockReturnValue({
      cmd: 'gnome-terminal',
      getArgs: (command: string) => ['--', 'bash', '-c', `${command}; exec bash`],
    })
    mocks.isWSL.mockReturnValue(false)
  })

  afterEach(() => {
    platformSpy?.mockRestore()
    platformSpy = undefined
  })

  it('launches macOS Terminal.app through osascript', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    const result = await launchTerminal({
      cwd: '/repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['-e', expect.stringContaining('tell application "Terminal"')]),
      expect.objectContaining({detached: true, env: {AIWCLI_INTERNAL_CALL: 'true'}, stdio: 'ignore'}),
    )
  })

  it('launches Windows Terminal with PowerShell strategy by default', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['windows-terminal'])
    mocks.detectPowerShell.mockReturnValueOnce('pwsh')

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt',
      ['-d', 'C:\\repo', 'pwsh', '-NoExit', '-Command', 'aiw launch'],
      expect.objectContaining({detached: true, env: {AIWCLI_INTERNAL_CALL: 'true'}, stdio: 'ignore'}),
    )
  })

  it('supports mintty strategy on Windows', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['mintty'])
    mocks.findMsysBash.mockReturnValueOnce('C:\\Program Files\\Git\\usr\\bin\\bash.exe')
    mocks.existsSync.mockReturnValueOnce(true)

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
      windowsShellPreference: 'mintty',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn.mock.calls[0]?.[0]).toContain('mintty.exe')
  })

  it('supports git-bash in Windows Terminal strategy', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['git-bash-in-wt'])
    mocks.findMsysBash.mockReturnValueOnce('C:\\Program Files\\Git\\usr\\bin\\bash.exe')

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
      windowsShellPreference: 'git-bash',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt',
      expect.arrayContaining(['-d', 'C:\\repo', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', '-lc']),
      expect.objectContaining({detached: true}),
    )
  })

  it('falls back to PowerShell when an earlier Windows strategy fails', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['windows-terminal', 'powershell-fallback'])
    queueSpawnResults([new Error('wt failed'), null])

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    expect(mocks.spawn.mock.calls[1]?.[0]).toBe('pwsh')
  })

  it('returns failure when all Windows terminal strategies fail', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['windows-terminal'])
    queueSpawnResults([new Error('wt failed')])

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('all available strategies')
  })

  it('launches Linux terminal when available', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    mocks.isWSL.mockReturnValueOnce(false)
    mocks.findAvailableLinuxTerminal.mockReturnValueOnce({
      cmd: 'gnome-terminal',
      getArgs: (command: string) => ['--', 'bash', '-c', `${command}; exec bash`],
    })

    const result = await launchTerminal({
      cwd: '/repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'gnome-terminal',
      ['--', 'bash', '-c', "cd '/repo' && aiw launch; exec bash"],
      expect.objectContaining({detached: true}),
    )
  })

  it('returns clear error when Linux has no supported terminal emulator', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    mocks.isWSL.mockReturnValueOnce(false)
    mocks.findAvailableLinuxTerminal.mockReturnValueOnce(null)

    const result = await launchTerminal({
      cwd: '/repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No supported terminal emulator found')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('detects WSL and launches via wt.exe when available', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    mocks.isWSL.mockReturnValueOnce(true)
    queueSpawnResults([null])

    const result = await launchTerminal({
      cwd: '/repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['wsl.exe', '--', 'bash', '-c', "cd '/repo' && aiw launch; exec bash"],
      expect.objectContaining({detached: true}),
    )
  })

  it('falls back to Linux terminal when WSL wt.exe launch fails', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    mocks.isWSL.mockReturnValueOnce(true)
    mocks.findAvailableLinuxTerminal.mockReturnValueOnce({
      cmd: 'xterm',
      getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`],
    })
    queueSpawnResults([new Error('wt failed'), null])

    const result = await launchTerminal({
      cwd: '/repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    expect(mocks.spawn.mock.calls[0]?.[0]).toBe('wt.exe')
    expect(mocks.spawn.mock.calls[1]?.[0]).toBe('xterm')
  })

  it('supports explicit powershell-fallback strategy on Windows', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.resolveWindowsTerminalStrategy.mockReturnValueOnce(['powershell-fallback'])
    mocks.detectPowerShell.mockReturnValueOnce('powershell')

    const result = await launchTerminal({
      cwd: 'C:\\repo',
      command: 'aiw launch',
    })

    expect(result.success).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-Command', expect.stringContaining('Start-Process powershell')]),
      expect.objectContaining({detached: true}),
    )
  })
})

