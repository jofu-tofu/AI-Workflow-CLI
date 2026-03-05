import path from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanupSentinelIpc: vi.fn(),
  cleanClaudeEnv: vi.fn(() => ({AIWCLI_INTERNAL_CALL: 'true'})),
  createSentinelIpcPaths: vi.fn(() => ({
    tmpDir: 'C:\\tmp\\psmux-sentinel',
    inputPath: 'C:\\tmp\\psmux-sentinel\\input.txt',
    stdoutPath: 'C:\\tmp\\psmux-sentinel\\stdout.txt',
    stderrPath: 'C:\\tmp\\psmux-sentinel\\stderr.txt',
    sentinelPath: 'C:\\tmp\\psmux-sentinel\\sentinel.txt',
  })),
  execFileAsync: vi.fn(),
  existsSync: vi.fn(() => false),
  findExecutable: vi.fn(),
  getLastLine: vi.fn((stdout: string) => stdout.trim()),
  quoteForPowerShell: vi.fn((input: string) => `'${input}'`),
  readdirSync: vi.fn(() => []),
  spawnAttached: vi.fn(async () => ({exitCode: 0, usedMux: true})),
  splitFlagFromDimensions: vi.fn(() => '-h'),
  tmpdir: vi.fn(() => 'C:\\tmp'),
  toEncodedPowerShell: vi.fn((command: string) => `ENC(${command})`),
  wrapSentinelPowerShell: vi.fn(({command}: {command: string}) => `WRAP(${command})`),
  writeFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
  writeFileSync: mocks.writeFileSync,
}))

vi.mock('node:os', () => ({
  tmpdir: mocks.tmpdir,
}))

vi.mock('../../../src/lib/mux-utils.js', () => ({
  cleanClaudeEnv: mocks.cleanClaudeEnv,
  getLastLine: mocks.getLastLine,
  spawnAttached: mocks.spawnAttached,
  splitFlagFromDimensions: mocks.splitFlagFromDimensions,
}))

vi.mock('../../../src/lib/runtime/sentinel-ipc.js', () => ({
  cleanupSentinelIpc: mocks.cleanupSentinelIpc,
  createSentinelIpcPaths: mocks.createSentinelIpcPaths,
}))

vi.mock('../../../src/lib/runtime/subprocess-utils.js', () => ({
  execFileAsync: mocks.execFileAsync,
  findExecutable: mocks.findExecutable,
}))

vi.mock('../../../src/lib/sentinel-wrapper.js', () => ({
  wrapSentinelPowerShell: mocks.wrapSentinelPowerShell,
}))

vi.mock('../../../src/lib/shell-quoting.js', () => ({
  quoteForPowerShell: mocks.quoteForPowerShell,
  toEncodedPowerShell: mocks.toEncodedPowerShell,
}))

import {PsmuxMultiplexer} from '../../../src/lib/multiplexers/psmux.js'

function okExec(stdout = ''): {
  exitCode: number
  killed: boolean
  signal: null
  stderr: string
  stdout: string
} {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    killed: false,
    signal: null,
  }
}

describe('psmux multiplexer unit', () => {
  let platformSpy: ReturnType<typeof vi.spyOn> | undefined
  let localAppDataBackup: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    localAppDataBackup = process.env.LOCALAPPDATA
    delete process.env.LOCALAPPDATA

    mocks.findExecutable.mockImplementation((name: string) => {
      if (name === 'psmux') return 'C:\\tools\\psmux.exe'
      if (name === 'claude') return 'C:\\tools\\claude.exe'
      return null
    })
    mocks.execFileAsync.mockResolvedValue(okExec('psmux 0.4.2\n'))
  })

  afterEach(() => {
    platformSpy?.mockRestore()
    platformSpy = undefined
    if (localAppDataBackup === undefined) {
      delete process.env.LOCALAPPDATA
    } else {
      process.env.LOCALAPPDATA = localAppDataBackup
    }
    delete process.env.PSMUX_PANE
  })

  it('create returns null on non-Windows platforms', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    const mux = await PsmuxMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('create returns null when version probe fails', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execFileAsync.mockResolvedValueOnce({
      stdout: '',
      stderr: 'failed',
      exitCode: 1,
      killed: false,
      signal: null,
    })

    const mux = await PsmuxMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('create returns null when psmux version is too old', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execFileAsync.mockResolvedValueOnce(okExec('psmux 0.3.9\n'))

    const mux = await PsmuxMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('create accepts version 0.4.0+ and returns backend instance', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execFileAsync.mockResolvedValueOnce(okExec('psmux 0.4.1\n'))

    const mux = await PsmuxMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.backend).toBe('psmux')
  })

  it('create falls back to winget package directory when psmux is not on PATH', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    process.env.LOCALAPPDATA = 'C:\\Users\\me\\AppData\\Local'
    mocks.findExecutable.mockReturnValueOnce(null)
    mocks.existsSync.mockImplementation((candidate: string) => {
      return candidate.includes('Packages') || candidate.endsWith('psmux.exe')
    })
    mocks.readdirSync.mockReturnValueOnce(['marlocarlo.psmux_1.0.0_x64__abc'])
    mocks.execFileAsync.mockResolvedValueOnce(okExec('psmux 0.4.5\n'))

    const mux = await PsmuxMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.backend).toBe('psmux')
  })

  it('isInsideSession reflects PSMUX_PANE env variable', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()
    expect(mux).not.toBeNull()

    process.env.PSMUX_PANE = '1'
    expect(mux?.isInsideSession()).toBe(true)

    delete process.env.PSMUX_PANE
    expect(mux?.isInsideSession()).toBe(false)
  })

  it('kill sends kill-pane command with pane id', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()
    await mux!.kill('%12')

    expect(mocks.execFileAsync).toHaveBeenCalledWith('C:\\tools\\psmux.exe', ['kill-pane', '-t', '%12'], {timeout: 3000})
  })

  it('splitPane returns not found when tool executable is missing', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.findExecutable.mockImplementation((name: string) => name === 'psmux' ? 'C:\\tools\\psmux.exe' : null)
    const mux = await PsmuxMultiplexer.create()

    const result = await mux!.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('claude not found on PATH')
  })

  it('splitPane auto mode chooses split flag from current pane dimensions', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()
    mocks.execFileAsync
      .mockResolvedValueOnce(okExec('220 90\n'))
      .mockResolvedValueOnce(okExec('%22\n'))
    mocks.splitFlagFromDimensions.mockReturnValueOnce('-h')

    const result = await mux!.splitPane({
      toolName: 'claude',
      args: [],
      split: 'auto',
      cwd: 'C:\\repo',
    })

    expect(mocks.splitFlagFromDimensions).toHaveBeenCalledWith(220, 90)
    const splitArgs = mocks.execFileAsync.mock.calls.at(-1)?.[1] as string[]
    expect(splitArgs).toEqual(expect.arrayContaining(['split-window', '-h', '-c', 'C:\\repo']))
    expect(result.launched).toBe(true)
  })

  it('splitPane repl mode with promptPath injects startup bootstrap argument', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()
    mocks.execFileAsync
      .mockResolvedValueOnce(okExec('220 90\n'))
      .mockResolvedValueOnce(okExec('%31\n'))

    await mux!.splitPane({
      toolName: 'claude',
      args: ['--yolo'],
      split: 'auto',
      promptPath: '.\\prompt.md',
      env: {FOO: 'bar'},
    })

    const encodedInput = mocks.toEncodedPowerShell.mock.calls.at(-1)?.[0] as string
    expect(encodedInput).toContain("$env:FOO='bar'")
    expect(encodedInput).toContain(`Read startup instructions from this file path before taking action: ${path.resolve('.\\prompt.md')}. Use that file as the initial context.`)
  })

  it('createSession injects PSMUX_PANE and builds reattach new-session command', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()

    await mux!.createSession({
      sessionName: 'aiw-main',
      reattach: true,
      toolPath: 'C:\\tools\\claude.exe',
      toolArgs: ['--dangerously-skip-permissions'],
      promptText: 'hello from test',
      enableMouse: true,
    })

    expect(mocks.writeFileSync).toHaveBeenCalled()
    const encodedInput = mocks.toEncodedPowerShell.mock.calls.at(-1)?.[0] as string
    expect(encodedInput).toContain("$env:PSMUX_PANE='1';")
    expect(mocks.spawnAttached).toHaveBeenCalledWith(
      'C:\\tools\\psmux.exe',
      expect.arrayContaining(['new-session', '-A', '-c', process.cwd(), '-s', 'aiw-main']),
      {AIWCLI_INTERNAL_CALL: 'true'},
      'psmux',
    )
  })

  it('createSession runs bootstrap set-option commands', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const mux = await PsmuxMultiplexer.create()
    mocks.execFileAsync.mockResolvedValue(okExec())

    await mux!.createSession({
      sessionName: 'aiw-main',
      toolPath: 'C:\\tools\\claude.exe',
      toolArgs: [],
      reattach: false,
      enableMouse: true,
    })

    expect(mocks.execFileAsync).toHaveBeenCalledWith('C:\\tools\\psmux.exe', ['set-option', '-g', 'mouse', 'on'], {timeout: 3000})
    expect(mocks.execFileAsync).toHaveBeenCalledWith('C:\\tools\\psmux.exe', ['set-option', '-g', 'history-limit', '50000'], {timeout: 3000})
  })
})

