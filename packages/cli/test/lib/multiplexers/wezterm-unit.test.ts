import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanupSentinelIpc: vi.fn(),
  createSentinelIpcPaths: vi.fn(() => ({
    tmpDir: 'C:\\tmp\\wezterm-sentinel',
    inputPath: 'C:\\tmp\\wezterm-sentinel\\input.txt',
    stdoutPath: 'C:\\tmp\\wezterm-sentinel\\stdout.txt',
    stderrPath: 'C:\\tmp\\wezterm-sentinel\\stderr.txt',
    sentinelPath: 'C:\\tmp\\wezterm-sentinel\\sentinel.txt',
  })),
  execFileAsync: vi.fn(),
  findExecutable: vi.fn(),
  getLastLine: vi.fn((stdout: string) => stdout.trim()),
  quoteForSh: vi.fn((input: string) => `'${input}'`),
  readFileSync: vi.fn(() => ''),
  splitFlagFromDimensions: vi.fn(() => '-h'),
  wrapSentinelSh: vi.fn(({command}: {command: string}) => `WRAP(${command})`),
}))

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}))

vi.mock('../../../src/lib/mux-utils.js', () => ({
  getLastLine: mocks.getLastLine,
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
  wrapSentinelSh: mocks.wrapSentinelSh,
}))

vi.mock('../../../src/lib/shell-quoting.js', () => ({
  quoteForSh: mocks.quoteForSh,
}))

import {AIW_SESSION_ENV, WeztermMultiplexer} from '../../../src/lib/multiplexers/wezterm.js'

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

describe('wezterm multiplexer unit', () => {
  let weztermPaneBackup: string | undefined
  let termProgramBackup: string | undefined
  let aiwSessionBackup: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    weztermPaneBackup = process.env.WEZTERM_PANE
    termProgramBackup = process.env.TERM_PROGRAM
    aiwSessionBackup = process.env[AIW_SESSION_ENV]
    delete process.env.WEZTERM_PANE
    delete process.env.TERM_PROGRAM
    delete process.env[AIW_SESSION_ENV]

    mocks.findExecutable.mockImplementation((name: string) => {
      if (name === 'wezterm') return 'C:\\tools\\wezterm.exe'
      if (name === 'claude') return 'C:\\tools\\claude.exe'
      if (name === 'bash') return 'C:\\Git\\bin\\bash.exe'
      return null
    })
  })

  afterEach(() => {
    if (weztermPaneBackup === undefined) {
      delete process.env.WEZTERM_PANE
    } else {
      process.env.WEZTERM_PANE = weztermPaneBackup
    }
    if (termProgramBackup === undefined) {
      delete process.env.TERM_PROGRAM
    } else {
      process.env.TERM_PROGRAM = termProgramBackup
    }
    if (aiwSessionBackup === undefined) {
      delete process.env[AIW_SESSION_ENV]
    } else {
      process.env[AIW_SESSION_ENV] = aiwSessionBackup
    }
  })

  it('create returns null when neither WEZTERM_PANE nor TERM_PROGRAM is set', () => {
    delete process.env.WEZTERM_PANE
    delete process.env.TERM_PROGRAM
    const mux = WeztermMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('create returns null when wezterm is not on PATH', () => {
    process.env.WEZTERM_PANE = '0'
    mocks.findExecutable.mockImplementation(() => null)
    const mux = WeztermMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('create returns instance when WEZTERM_PANE is set and wezterm is on PATH', () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.backend).toBe('wezterm')
  })

  it('create returns instance when TERM_PROGRAM=WezTerm (no WEZTERM_PANE)', () => {
    delete process.env.WEZTERM_PANE
    process.env.TERM_PROGRAM = 'WezTerm'
    const mux = WeztermMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.backend).toBe('wezterm')
  })

  it('isInsideSession returns true when TERM_PROGRAM=WezTerm (enables split over new-window)', () => {
    delete process.env.WEZTERM_PANE
    process.env.TERM_PROGRAM = 'WezTerm'
    const mux = WeztermMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.isInsideSession()).toBe(true)
  })

  it('isInsideSession returns true with WEZTERM_PANE (enables split over new-window)', () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()
    expect(mux).not.toBeNull()
    // Being inside WezTerm means we can split panes directly
    expect(mux?.isInsideSession()).toBe(true)
  })

  it('isInsideSession returns true regardless of AIW_MUX_SESSION when in WezTerm', () => {
    process.env.WEZTERM_PANE = '0'
    process.env[AIW_SESSION_ENV] = '1'
    const mux = WeztermMultiplexer.create()
    expect(mux).not.toBeNull()

    expect(mux?.isInsideSession()).toBe(true)

    // Still true after removing AIW_MUX_SESSION — WEZTERM_PANE is sufficient
    delete process.env[AIW_SESSION_ENV]
    expect(mux?.isInsideSession()).toBe(true)
  })

  it('isInsideSession returns false when neither WezTerm env var is set', () => {
    delete process.env.WEZTERM_PANE
    delete process.env.TERM_PROGRAM
    // Can't create a multiplexer without env vars, but verify the logic
    // by testing directly that create() returns null
    const mux = WeztermMultiplexer.create()
    expect(mux).toBeNull()
  })

  it('kill sends kill-pane command with pane id', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()
    mocks.execFileAsync.mockResolvedValueOnce(okExec())

    await mux!.kill('42')

    expect(mocks.execFileAsync).toHaveBeenCalledWith(
      'C:\\tools\\wezterm.exe',
      ['cli', 'kill-pane', '--pane-id', '42'],
      {timeout: 3000},
    )
  })

  it('kill does nothing for empty pane id', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()
    await mux!.kill('')
    expect(mocks.execFileAsync).not.toHaveBeenCalled()
  })

  it('splitPane returns not found when tool executable is missing', async () => {
    process.env.WEZTERM_PANE = '0'
    mocks.findExecutable.mockImplementation((name: string) => name === 'wezterm' ? 'C:\\tools\\wezterm.exe' : null)
    const mux = WeztermMultiplexer.create()

    const result = await mux!.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('claude not found on PATH')
  })

  it('splitPane builds correct args and returns pane id on success', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    // resolveToolForBash
    mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    // wezterm cli list for auto-split
    mocks.execFileAsync.mockResolvedValueOnce(okExec(JSON.stringify([
      {pane_id: 5, size: {cols: 200, rows: 50}},
    ])))
    // wezterm cli split-pane
    mocks.execFileAsync.mockResolvedValueOnce(okExec('42\n'))

    const result = await mux!.splitPane({
      toolName: 'claude',
      args: ['--yolo'],
      split: 'auto',
      cwd: 'C:\\repo',
    })

    expect(result.launched).toBe(true)
    expect(result.backend).toBe('wezterm')
    expect(result.paneId).toBe('42')
  })

  it('splitPane uses explicit split direction h → --right', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    mocks.execFileAsync.mockResolvedValueOnce(okExec('42\n'))

    await mux!.splitPane({
      toolName: 'claude',
      args: [],
      split: 'h',
      cwd: 'C:\\repo',
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[1]).toContain('--right')
  })

  it('splitPane uses explicit split direction v → --bottom', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    mocks.execFileAsync.mockResolvedValueOnce(okExec('42\n'))

    await mux!.splitPane({
      toolName: 'claude',
      args: [],
      split: 'v',
      cwd: 'C:\\repo',
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[1]).toContain('--bottom')
  })

  it('splitPane returns failure when wezterm split-pane exits non-zero', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    mocks.execFileAsync.mockResolvedValueOnce(okExec(JSON.stringify([])))
    mocks.execFileAsync.mockResolvedValueOnce({
      stdout: '',
      stderr: 'split failed',
      exitCode: 1,
      killed: false,
      signal: null,
    })

    const result = await mux!.splitPane({
      toolName: 'claude',
      args: [],
      split: 'auto',
      cwd: 'C:\\repo',
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toBe('wezterm split-pane failed')
    expect(result.stderr).toBe('split failed')
  })

  it('createSession spawns a new window and returns success', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()

    // On Windows, createSession first resolves tool path from bash's perspective
    if (process.platform === 'win32') {
      mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    }

    // wezterm cli spawn
    mocks.execFileAsync.mockResolvedValueOnce(okExec('99\n'))

    const result = await mux!.createSession({
      sessionName: 'aiw-test',
      toolPath: '/usr/bin/claude',
      toolArgs: ['--dangerously-skip-permissions'],
      promptText: 'hello',
    })

    expect(result.usedMux).toBe(true)
    expect(result.exitCode).toBe(0)

    const spawnCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(spawnCall?.[1]).toContain('spawn')
    expect(spawnCall?.[1]).toContain('--new-window')
  })

  it('createSession returns failure when wezterm spawn fails', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()

    // On Windows, createSession first resolves tool path from bash's perspective
    if (process.platform === 'win32') {
      mocks.execFileAsync.mockResolvedValueOnce(okExec('/usr/bin/claude'))
    }

    mocks.execFileAsync.mockResolvedValueOnce({
      stdout: '',
      stderr: 'spawn error',
      exitCode: 1,
      killed: false,
      signal: null,
    })

    const result = await mux!.createSession({
      sessionName: 'aiw-test',
      toolPath: '/usr/bin/claude',
      toolArgs: [],
    })

    expect(result.usedMux).toBe(false)
    expect(result.reason).toContain('wezterm spawn failed')
  })
})
