import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
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

vi.mock('../../../src/lib/env-sanitizer.js', () => ({
  REPL_NESTING_VARS: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_SESSION_ID', 'CODEX_THREAD_ID', 'AIWCLI_INTERNAL_CALL'],
}))

vi.mock('../../../src/lib/mux-utils.js', () => ({
  getLastLine: mocks.getLastLine,
  splitFlagFromDimensions: mocks.splitFlagFromDimensions,
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

vi.mock('../../../src/lib/tmux-primitives.js', () => ({
  toMsysPosixPath: vi.fn((input: string) => input),
}))

import {WeztermMultiplexer} from '../../../src/lib/multiplexers/wezterm.js'

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

const defaultSplitOptions = {
  toolName: 'claude',
  args: ['--dangerously-skip-permissions'],
  cwd: 'C:\\repo',
  env: {},
  mode: 'repl' as const,
  split: 'auto' as const,
  sentinelPath: 'C:\\tmp\\wezterm-sentinel\\sentinel.txt',
  holdPane: false,
  retryOnQuickExit: false,
}

describe('wezterm multiplexer unit', () => {
  let weztermPaneBackup: string | undefined
  let termProgramBackup: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    weztermPaneBackup = process.env.WEZTERM_PANE
    termProgramBackup = process.env.TERM_PROGRAM
    delete process.env.WEZTERM_PANE
    delete process.env.TERM_PROGRAM

    mocks.findExecutable.mockImplementation((name: string) => {
      if (name === 'wezterm') return 'C:\\tools\\wezterm.exe'
      if (name === 'claude') return 'C:\\tools\\claude.exe'
      if (name === 'bash') return 'C:\\Git\\bin\\bash.exe'
      return null
    })

    // Default arg-matching mock for execFileAsync — dispatches by command args
    // to avoid fragile sequential mockResolvedValueOnce ordering.
    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      // BashAdapter.resolveToolPath on win32: bash -lc 'command -v ...'
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      // wezterm cli list (for auto-split resolution)
      if (args?.includes('list')) return Promise.resolve(okExec(JSON.stringify([
        {pane_id: 5, size: {cols: 200, rows: 50}},
      ])))
      // wezterm cli split-pane
      if (args?.includes('split-pane')) return Promise.resolve(okExec('42\n'))
      // wezterm cli spawn
      if (args?.includes('spawn')) return Promise.resolve(okExec('99\n'))
      // wezterm cli kill-pane
      if (args?.includes('kill-pane')) return Promise.resolve(okExec())
      // Default
      return Promise.resolve(okExec())
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

  it('resolveStrategy returns split when calledFromRepl', () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()!
    expect(mux.resolveStrategy({calledFromRepl: true, platform: 'win32', disableMux: false}).strategy).toBe('split')
  })

  it('resolveStrategy returns inline when NOT calledFromRepl', () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()!
    expect(mux.resolveStrategy({calledFromRepl: false, platform: 'win32', disableMux: false}).strategy).toBe('inline')
  })

  it('resolveStrategy returns inline when disableMux is true', () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()!
    expect(mux.resolveStrategy({calledFromRepl: true, platform: 'win32', disableMux: true}).strategy).toBe('inline')
  })

  it('kill sends kill-pane command with handle', async () => {
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

  it('kill does nothing for empty handle', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()
    await mux!.kill('')
    expect(mocks.execFileAsync).not.toHaveBeenCalled()
  })

  it('split returns not found when tool executable is missing', async () => {
    process.env.WEZTERM_PANE = '0'
    mocks.findExecutable.mockImplementation((name: string) => name === 'wezterm' ? 'C:\\tools\\wezterm.exe' : null)
    const mux = WeztermMultiplexer.create()

    const result = await mux!.split(defaultSplitOptions)

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('claude not found on PATH')
  })

  it('split builds correct args and returns handle on success', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('list')) return Promise.resolve(okExec(JSON.stringify([
        {pane_id: 5, size: {cols: 200, rows: 50}},
      ])))
      if (args?.includes('split-pane')) return Promise.resolve(okExec('42\n'))
      return Promise.resolve(okExec())
    })

    const result = await mux!.split(defaultSplitOptions)

    expect(result.launched).toBe(true)
    expect(result.backend).toBe('wezterm')
    expect(result.handle).toBe('42')
  })

  it('split clears REPL nesting env vars in pane command', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('list')) return Promise.resolve(okExec(JSON.stringify([
        {pane_id: 5, size: {cols: 200, rows: 50}},
      ])))
      if (args?.includes('split-pane')) return Promise.resolve(okExec('42\n'))
      return Promise.resolve(okExec())
    })

    await mux!.split(defaultSplitOptions)

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    const bashCommand = splitCall?.[1]?.at(-1) as string
    expect(bashCommand).toContain('unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_SESSION_ID CODEX_THREAD_ID AIWCLI_INTERNAL_CALL;')
  })

  it('split uses explicit split direction horizontal → --right', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('split-pane')) return Promise.resolve(okExec('42\n'))
      return Promise.resolve(okExec())
    })

    await mux!.split({
      ...defaultSplitOptions,
      split: 'horizontal',
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[1]).toContain('--right')
  })

  it('split uses explicit split direction vertical → --bottom', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('split-pane')) return Promise.resolve(okExec('42\n'))
      return Promise.resolve(okExec())
    })

    await mux!.split({
      ...defaultSplitOptions,
      split: 'vertical',
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[1]).toContain('--bottom')
  })

  it('split returns failure when wezterm split-pane exits non-zero', async () => {
    process.env.WEZTERM_PANE = '5'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('list')) return Promise.resolve(okExec(JSON.stringify([])))
      if (args?.includes('split-pane')) return Promise.resolve({
        stdout: '',
        stderr: 'split failed',
        exitCode: 1,
        killed: false,
        signal: null,
      })
      return Promise.resolve(okExec())
    })

    const result = await mux!.split(defaultSplitOptions)

    expect(result.launched).toBe(false)
    expect(result.reason).toBe('wezterm split-pane failed')
  })

  it('createSession spawns a new window and returns success', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('spawn')) return Promise.resolve(okExec('99\n'))
      return Promise.resolve(okExec())
    })

    const result = await mux!.createSession({
      sessionName: 'aiw-test',
      toolPath: '/usr/bin/claude',
      toolArgs: ['--dangerously-skip-permissions'],
      promptText: 'hello',
      cwd: 'C:\\repo',
      reattach: false,
    })

    expect(result.launched).toBe(true)
    expect(result.exitCode).toBe(0)

    const spawnCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(spawnCall?.[1]).toContain('spawn')
    expect(spawnCall?.[1]).toContain('--new-window')
  })

  it('createSession returns failure when wezterm spawn fails', async () => {
    process.env.WEZTERM_PANE = '0'
    const mux = WeztermMultiplexer.create()

    mocks.execFileAsync.mockImplementation((_file: string, args?: string[]) => {
      if (args?.[0] === '-lc') return Promise.resolve(okExec('/usr/bin/claude'))
      if (args?.includes('spawn')) return Promise.resolve({
        stdout: '',
        stderr: 'spawn error',
        exitCode: 1,
        killed: false,
        signal: null,
      })
      return Promise.resolve(okExec())
    })

    const result = await mux!.createSession({
      sessionName: 'aiw-test',
      toolPath: '/usr/bin/claude',
      toolArgs: [],
      cwd: 'C:\\repo',
      reattach: false,
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('wezterm spawn failed')
  })
})
