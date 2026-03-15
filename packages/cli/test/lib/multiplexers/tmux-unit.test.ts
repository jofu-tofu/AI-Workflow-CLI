import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  buildShellCommand: vi.fn(),
  buildTmuxRuntimeBootstrapCommands: vi.fn(() => []),
  configureTmuxSession: vi.fn(),
  execFileAsync: vi.fn(),
  execSync: vi.fn(),
  findBestSplit: vi.fn(),
  findExecutable: vi.fn(),
  getLastLine: vi.fn((stdout: string) => stdout.trim()),
  isNonWindowsPlatform: vi.fn(() => true),
  isWindowsPlatform: vi.fn(() => false),
  listPanes: vi.fn(async () => []),
  quoteForSh: vi.fn((input: string) => `'${input}'`),
  readFileSync: vi.fn(() => 'prompt from file'),
  sanitizedProcessEnv: vi.fn(() => ({})),
  spawnAttached: vi.fn(async () => ({launched: true, exitCode: 0, backend: 'tmux'})),
  splitFlagFromDimensions: vi.fn(() => '-h'),
  toMsysPosixPath: vi.fn((input: string) => input),
  wrapSentinelSh: vi.fn(({command}: {command: string}) => `WRAP(${command})`),
}))

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}))

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
}))

vi.mock('../../../src/lib/env-sanitizer.js', () => ({
  REPL_NESTING_VARS: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_SESSION_ID', 'CODEX_THREAD_ID', 'AIWCLI_INTERNAL_CALL'],
  sanitizedProcessEnv: mocks.sanitizedProcessEnv,
}))

vi.mock('../../../src/lib/mux-utils.js', () => ({
  PANE_HOLD_MESSAGE: '[aiwcli] Driver exited. Pane held open.',
  getLastLine: mocks.getLastLine,
  spawnAttached: mocks.spawnAttached,
  splitFlagFromDimensions: mocks.splitFlagFromDimensions,
}))

vi.mock('../../../src/lib/runtime/platform-adapter.js', () => ({
  isNonWindowsPlatform: mocks.isNonWindowsPlatform,
  isWindowsPlatform: mocks.isWindowsPlatform,
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

vi.mock('../../../src/lib/tmux-pane-placement.js', () => ({
  findBestSplit: mocks.findBestSplit,
  listPanes: mocks.listPanes,
}))

vi.mock('../../../src/lib/tmux-primitives.js', () => ({
  quoteForSh: mocks.quoteForSh,
  toMsysPosixPath: mocks.toMsysPosixPath,
}))

vi.mock('../../../src/lib/tmux-session.js', () => ({
  buildShellCommand: mocks.buildShellCommand,
  buildTmuxRuntimeBootstrapCommands: mocks.buildTmuxRuntimeBootstrapCommands,
  configureTmuxSession: mocks.configureTmuxSession,
}))

import {TmuxMultiplexer} from '../../../src/lib/multiplexers/tmux.js'

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
  cwd: '/repo',
  env: {},
  mode: 'repl' as const,
  split: 'auto' as const,
  sentinelPath: '/tmp/tmux-sentinel/sentinel.txt',
  holdPane: false,
  retryOnQuickExit: false,
}

describe('tmux multiplexer unit', () => {
  let platformSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findExecutable.mockImplementation((name: string) => name === 'tmux' ? '/usr/bin/tmux' : '/usr/bin/claude')
    mocks.execFileAsync.mockResolvedValue(okExec('%42\n'))
    mocks.findBestSplit.mockReturnValue({splitFlag: '-h', targetPane: '%1'})
    mocks.listPanes.mockResolvedValue([{paneId: '%1', width: 200, height: 80, active: true}])
    mocks.buildShellCommand.mockReturnValue('bootstrap command')
    mocks.isNonWindowsPlatform.mockReturnValue(true)
    mocks.isWindowsPlatform.mockReturnValue(false)
  })

  afterEach(() => {
    platformSpy?.mockRestore()
    platformSpy = undefined
    delete process.env.TMUX
  })

  it('create returns null when tmux executable is missing', () => {
    mocks.findExecutable.mockReturnValueOnce(null)
    expect(TmuxMultiplexer.create()).toBeNull()
  })

  it('create returns a tmux multiplexer when tmux exists', () => {
    const mux = TmuxMultiplexer.create()
    expect(mux).not.toBeNull()
    expect(mux?.backend).toBe('tmux')
  })

  it('resolveStrategy returns split when TMUX is set', () => {
    const mux = TmuxMultiplexer.create()!
    process.env.TMUX = '/tmp/tmux-1/default'
    expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).toBe('split')
  })

  it('resolveStrategy returns create-session when TMUX is not set', () => {
    const mux = TmuxMultiplexer.create()!
    delete process.env.TMUX
    expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).toBe('create-session')
  })

  it('resolveStrategy returns inline when disableMux is true', () => {
    const mux = TmuxMultiplexer.create()!
    expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: true}).strategy).toBe('inline')
  })

  it('kill sends kill-pane command with handle', async () => {
    const mux = TmuxMultiplexer.create()!
    await mux.kill('%9')
    expect(mocks.execFileAsync).toHaveBeenCalledWith('/usr/bin/tmux', ['kill-pane', '-t', '%9'], {timeout: 3000})
  })

  it('createSession returns unavailable when tmux is not usable on platform', async () => {
    mocks.isNonWindowsPlatform.mockReturnValueOnce(false)
    const mux = TmuxMultiplexer.create()!

    const result = await mux.createSession({
      sessionName: 'aiw-test',
      reattach: false,
      toolPath: '/usr/bin/claude',
      toolArgs: ['--dangerously-skip-permissions'],
      cwd: '/repo',
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('tmux not available')
    expect(mocks.spawnAttached).not.toHaveBeenCalled()
  })

  it('createSession spawns attached tmux session', async () => {
    const mux = TmuxMultiplexer.create()!

    const result = await mux.createSession({
      sessionName: 'aiw-main',
      reattach: true,
      toolPath: '/usr/bin/claude',
      toolArgs: ['--dangerously-skip-permissions'],
      promptText: 'hello',
      enableMouse: true,
      cwd: '/repo',
    })

    expect(mocks.spawnAttached).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['new-session']),
      expect.any(Object),
      'tmux',
    )
    expect(result.launched).toBe(true)
  })

  it('split returns failure when tool is not found on PATH', async () => {
    mocks.findExecutable.mockImplementation((name: string) => name === 'tmux' ? '/usr/bin/tmux' : null)
    const mux = TmuxMultiplexer.create()!

    const result = await mux.split(defaultSplitOptions)

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('claude not found on PATH')
  })

  it('split launches successfully with auto split and sentinel wrapping', async () => {
    const mux = TmuxMultiplexer.create()!

    const result = await mux.split({
      ...defaultSplitOptions,
      env: {FOO: 'bar'},
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[0]).toBe('/usr/bin/tmux')
    expect(splitCall?.[1]).toEqual(
      expect.arrayContaining(['split-window', '-h', '-P', '-F', '#{pane_id}', '-c', '/repo', '-t', '%1']),
    )
    expect(mocks.wrapSentinelSh).toHaveBeenCalled()
    expect(result.launched).toBe(true)
    expect(result.backend).toBe('tmux')
    expect(result.sentinelPath).toBe('/tmp/tmux-sentinel/sentinel.txt')
  })

  it('split returns failure when tmux split-window fails', async () => {
    const mux = TmuxMultiplexer.create()!
    // First call may be for auto-split dimension query or tmux split itself.
    // Set all future calls to return a failure to ensure the split-window call fails.
    mocks.execFileAsync.mockResolvedValue({
      stdout: '',
      stderr: 'split failed',
      exitCode: 1,
      killed: false,
      signal: null,
    })

    const result = await mux.split({
      ...defaultSplitOptions,
      split: 'horizontal',
    })

    expect(result.launched).toBe(false)
  })

  it('split on Windows resolves tool path via bash and converts cwd path', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.isWindowsPlatform.mockReturnValue(true)
    mocks.findExecutable.mockImplementation((name: string) => {
      if (name === 'tmux') return 'C:\\tmux\\tmux.exe'
      if (name === 'bash') return 'C:\\Program Files\\Git\\bin\\bash.exe'
      if (name === 'claude') return 'C:\\tools\\claude.exe'
      return null
    })
    mocks.execFileAsync
      .mockResolvedValueOnce(okExec('/usr/bin/claude\n'))
      .mockResolvedValueOnce(okExec('%77\n'))
    mocks.toMsysPosixPath.mockReturnValue('/c/repo')
    mocks.buildTmuxRuntimeBootstrapCommands.mockReturnValue(['prep one', 'prep two'])

    const mux = TmuxMultiplexer.create()!
    const result = await mux.split({
      ...defaultSplitOptions,
      split: 'horizontal',
      cwd: 'C:\\repo',
    })

    const splitCallArgs = mocks.execFileAsync.mock.calls.at(-1)?.[1] as string[]
    expect(splitCallArgs).toEqual(expect.arrayContaining(['-c', '/c/repo']))
    expect(splitCallArgs.at(-1)).toContain('prep one; prep two;')
    expect(result.launched).toBe(true)
  })
})
