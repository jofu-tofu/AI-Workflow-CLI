import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  buildShellCommand: vi.fn(),
  buildTmuxRuntimeBootstrapCommands: vi.fn(() => []),
  cleanupSentinelIpc: vi.fn(),
  cleanClaudeEnv: vi.fn(() => ({})),
  createSentinelIpcPaths: vi.fn(() => ({
    tmpDir: '/tmp/tmux-sentinel',
    inputPath: '/tmp/tmux-sentinel/input.txt',
    stdoutPath: '/tmp/tmux-sentinel/stdout.txt',
    stderrPath: '/tmp/tmux-sentinel/stderr.txt',
    sentinelPath: '/tmp/tmux-sentinel/sentinel.txt',
  })),
  execFileAsync: vi.fn(),
  execSync: vi.fn(),
  findBestSplit: vi.fn(),
  findExecutable: vi.fn(),
  getLastLine: vi.fn((stdout: string) => stdout.trim()),
  isNativeTmuxAvailable: vi.fn(() => true),
  isNonWindowsPlatform: vi.fn(() => true),
  isWindowsPlatform: vi.fn(() => false),
  listPanes: vi.fn(async () => []),
  quoteForSh: vi.fn((input: string) => `'${input}'`),
  readFileSync: vi.fn(() => 'prompt from file'),
  spawnAttached: vi.fn(async () => ({exitCode: 0, usedMux: true})),
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

vi.mock('../../../src/lib/mux-utils.js', () => ({
  cleanClaudeEnv: mocks.cleanClaudeEnv,
  getLastLine: mocks.getLastLine,
  spawnAttached: mocks.spawnAttached,
  splitFlagFromDimensions: mocks.splitFlagFromDimensions,
}))

vi.mock('../../../src/lib/runtime/platform-adapter.js', () => ({
  isNonWindowsPlatform: mocks.isNonWindowsPlatform,
  isWindowsPlatform: mocks.isWindowsPlatform,
}))

vi.mock('../../../src/lib/runtime/sentinel-ipc.js', () => ({
  cleanupSentinelIpc: mocks.cleanupSentinelIpc,
  createSentinelIpcPaths: mocks.createSentinelIpcPaths,
}))

vi.mock('../../../src/lib/runtime/subprocess-utils.js', () => ({
  execFileAsync: mocks.execFileAsync,
  findExecutable: mocks.findExecutable,
}))

vi.mock('../../../src/lib/runtime/tmux-preflight.js', () => ({
  isNativeTmuxAvailable: mocks.isNativeTmuxAvailable,
}))

vi.mock('../../../src/lib/sentinel-wrapper.js', () => ({
  wrapSentinelSh: mocks.wrapSentinelSh,
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
    mocks.isNativeTmuxAvailable.mockReturnValue(true)
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

  it('isInsideSession reflects TMUX environment variable', () => {
    const mux = TmuxMultiplexer.create()
    expect(mux).not.toBeNull()

    process.env.TMUX = '/tmp/tmux-1/default'
    expect(mux?.isInsideSession()).toBe(true)

    delete process.env.TMUX
    expect(mux?.isInsideSession()).toBe(false)
  })

  it('kill sends kill-pane command with pane id', async () => {
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
    })

    expect(result.usedMux).toBe(false)
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
    })

    expect(mocks.spawnAttached).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['new-session']),
      expect.any(Object),
      'tmux',
    )
    expect(result).toEqual({exitCode: 0, usedMux: true})
  })

  it('splitPane returns failure when tool is not found on PATH', async () => {
    mocks.findExecutable.mockImplementation((name: string) => name === 'tmux' ? '/usr/bin/tmux' : null)
    const mux = TmuxMultiplexer.create()!

    const result = await mux.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toContain('claude not found on PATH')
  })

  it('splitPane launches successfully with auto split and sentinel wrapping', async () => {
    const mux = TmuxMultiplexer.create()!
    mocks.execFileAsync.mockResolvedValueOnce(okExec('%12\n'))

    const result = await mux.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
      split: 'auto',
      env: {FOO: 'bar'},
      cwd: '/repo',
    })

    const splitCall = mocks.execFileAsync.mock.calls.at(-1)
    expect(splitCall?.[0]).toBe('/usr/bin/tmux')
    expect(splitCall?.[1]).toEqual(
      expect.arrayContaining(['split-window', '-h', '-P', '-F', '#{pane_id}', '-c', '/repo', '-t', '%1']),
    )
    expect(mocks.wrapSentinelSh).toHaveBeenCalled()
    expect(result).toEqual({
      launched: true,
      backend: 'tmux',
      paneId: '%12',
      sentinelPath: '/tmp/tmux-sentinel/sentinel.txt',
    })
  })

  it('splitPane cleanup runs when tmux split-window fails', async () => {
    const mux = TmuxMultiplexer.create()!
    mocks.execFileAsync.mockResolvedValueOnce({
      stdout: '',
      stderr: 'split failed',
      exitCode: 1,
      killed: false,
      signal: null,
    })

    const result = await mux.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
      split: 'h',
    })

    expect(result.launched).toBe(false)
    expect(result.reason).toBe('tmux split-window failed')
    expect(result.stderr).toBe('split failed')
    expect(mocks.cleanupSentinelIpc).toHaveBeenCalledWith(expect.objectContaining({tmpDir: '/tmp/tmux-sentinel'}))
  })

  it('splitPane uses splitTarget dimensions to resolve auto split direction', async () => {
    const mux = TmuxMultiplexer.create()!
    mocks.execFileAsync
      .mockResolvedValueOnce(okExec('120 90\n'))
      .mockResolvedValueOnce(okExec('%55\n'))
    mocks.splitFlagFromDimensions.mockReturnValueOnce('-v')

    const result = await mux.splitPane({
      toolName: 'claude',
      args: [],
      split: 'auto',
      splitTarget: ' %9 ',
    })

    expect(mocks.splitFlagFromDimensions).toHaveBeenCalledWith(120, 90)
    const splitWindowArgs = mocks.execFileAsync.mock.calls.at(-1)?.[1] as string[]
    expect(splitWindowArgs).toEqual(expect.arrayContaining(['split-window', '-v', '-t', '%9']))
    expect(result.launched).toBe(true)
  })

  it('splitPane on Windows resolves tool path via bash and converts cwd path', async () => {
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
    const result = await mux.splitPane({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
      split: 'h',
      cwd: 'C:\\repo',
      sentinel: false,
    })

    const splitCallArgs = mocks.execFileAsync.mock.calls.at(-1)?.[1] as string[]
    expect(splitCallArgs).toEqual(expect.arrayContaining(['-c', '/c/repo']))
    expect(splitCallArgs.at(-1)).toContain('prep one; prep two;')
    expect(result.launched).toBe(true)
  })
})

