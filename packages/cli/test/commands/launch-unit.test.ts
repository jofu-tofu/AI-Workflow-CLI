import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'

import {EXIT_CODES} from '../../src/types/exit-codes.js'

const mocks = vi.hoisted(() => ({
  checkVersionCompatibility: vi.fn(() => ({compatible: true, version: '1.2.3'})),
  detectMultiplexer: vi.fn(),
  enableTmuxColors: vi.fn(),
  enableTmuxMouse: vi.fn(),
  ensureLspPatch: vi.fn(async () => {}),
  findExecutable: vi.fn((name: string) => `/usr/bin/${name}`),
  findToolPath: vi.fn((name: string) => `/usr/bin/${name}`),
  getClaudeCodeVersion: vi.fn(async () => '1.2.3'),
  launchTerminal: vi.fn(async () => ({success: true})),
  readSentinelExitCode: vi.fn(() => 0),
  spawnProcess: vi.fn(async () => 0),
  waitForSentinelFile: vi.fn(async () => true),
}))

vi.mock('../../src/lib/lsp-patch.js', () => ({
  ensureLspPatch: mocks.ensureLspPatch,
}))

vi.mock('../../src/lib/multiplexer.js', () => ({
  detectMultiplexer: mocks.detectMultiplexer,
}))

vi.mock('../../src/lib/runtime/sentinel-ipc.js', () => ({
  readSentinelExitCode: mocks.readSentinelExitCode,
  waitForSentinelFile: mocks.waitForSentinelFile,
}))

vi.mock('../../src/lib/runtime/subprocess-utils.js', () => ({
  findExecutable: mocks.findExecutable,
}))

vi.mock('../../src/lib/spawn.js', () => ({
  spawnProcess: mocks.spawnProcess,
}))

vi.mock('../../src/lib/terminal.js', () => ({
  launchTerminal: mocks.launchTerminal,
}))

vi.mock('../../src/lib/tmux-session.js', () => ({
  enableTmuxColors: mocks.enableTmuxColors,
  enableTmuxMouse: mocks.enableTmuxMouse,
  findToolPath: mocks.findToolPath,
}))

vi.mock('../../src/lib/version.js', () => ({
  checkVersionCompatibility: mocks.checkVersionCompatibility,
  getClaudeCodeVersion: mocks.getClaudeCodeVersion,
}))

import LaunchCommand from '../../src/commands/launch.js'

type LaunchFlags = {
  codex: boolean
  debug: boolean
  env?: string
  json: boolean
  new: boolean
  'no-tmux': boolean
  prompt?: string
  'prompt-file'?: string
  'prompt-path'?: string
  quiet: boolean
  split?: 'auto' | 'h' | 'v'
  'spawned-window': boolean
  'tmux-session'?: string
  wait: boolean
}

type TestCommand = LaunchCommand & {
  exit: (code?: number) => never
}

function makeFlags(overrides: Partial<LaunchFlags> = {}): LaunchFlags {
  return {
    codex: false,
    debug: false,
    env: undefined,
    json: false,
    new: false,
    'no-tmux': false,
    prompt: undefined,
    'prompt-file': undefined,
    'prompt-path': undefined,
    quiet: false,
    split: undefined,
    'spawned-window': false,
    'tmux-session': undefined,
    wait: false,
    ...overrides,
  }
}

function createMux(overrides: Partial<{
  backend: 'psmux' | 'tmux'
  createSession: (options: unknown) => Promise<{exitCode: number; reason?: string; usedMux: boolean}>
  isInsideSession: () => boolean
  kill: (paneId: string) => Promise<void>
  splitPane: (options: unknown) => Promise<{backend: 'psmux' | 'tmux'; launched: boolean; paneId?: string; reason?: string; sentinelPath?: string}>
}> = {}) {
  return {
    backend: 'tmux' as const,
    createSession: vi.fn(async () => ({exitCode: 0, usedMux: true})),
    isInsideSession: vi.fn(() => true),
    kill: vi.fn(async () => {}),
    splitPane: vi.fn(async () => ({backend: 'tmux' as const, launched: true, paneId: '%9'})),
    ...overrides,
  }
}

function createCommand(flags: LaunchFlags): {
  command: TestCommand
  spies: {
    error: ReturnType<typeof vi.spyOn>
    exit: ReturnType<typeof vi.spyOn>
    log: ReturnType<typeof vi.spyOn>
    logWarning: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
  }
} {
  const command = new LaunchCommand([], {} as never) as TestCommand
  vi.spyOn(command as LaunchCommand, 'parse').mockResolvedValue({flags} as never)
  vi.spyOn(command as LaunchCommand, 'debug').mockImplementation(() => {})
  vi.spyOn(command as LaunchCommand, 'logInfo').mockImplementation(() => {})
  const logWarning = vi.spyOn(command as LaunchCommand, 'logWarning').mockImplementation(() => {})
  const log = vi.spyOn(command as LaunchCommand, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(command as LaunchCommand, 'warn').mockImplementation(() => {})
  const exit = vi.spyOn(command, 'exit').mockImplementation(() => undefined as never)
  const error = vi.spyOn(command as LaunchCommand, 'error').mockImplementation((message: string, options?: {exit?: number}) => {
    const err = new Error(message) as Error & {exitCode?: number}
    err.exitCode = options?.exit
    throw err
  })

  return {command, spies: {error, exit, log, logWarning, warn}}
}

describe('launch command unit', () => {
  let tempDir: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.spawnProcess.mockResolvedValue(0)
    mocks.detectMultiplexer.mockResolvedValue(null)
    mocks.launchTerminal.mockResolvedValue({success: true})
    mocks.waitForSentinelFile.mockResolvedValue(true)
    mocks.readSentinelExitCode.mockReturnValue(0)
    mocks.findExecutable.mockImplementation((name: string) => `/usr/bin/${name}`)
    mocks.findToolPath.mockImplementation((name: string) => `/usr/bin/${name}`)
  })

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, {recursive: true, force: true})
      tempDir = undefined
    }
  })

  it('launches inline when --no-tmux is set', async () => {
    const {command, spies} = createCommand(makeFlags({'no-tmux': true}))

    await command.run()

    expect(mocks.detectMultiplexer).not.toHaveBeenCalled()
    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions'])
    expect(spies.exit).toHaveBeenCalledWith(0)
  })

  it('launches inline when no multiplexer is available', async () => {
    const {command, spies} = createCommand(makeFlags())
    mocks.detectMultiplexer.mockResolvedValueOnce(null)

    await command.run()

    expect(mocks.detectMultiplexer).toHaveBeenCalled()
    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions'])
    expect(spies.exit).toHaveBeenCalledWith(0)
  })

  it('splits pane when inside active multiplexer session', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({backend: 'tmux', launched: true, paneId: '%22'})),
    })
    const {command} = createCommand(makeFlags())
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)

    await command.run()

    expect(mocks.enableTmuxMouse).toHaveBeenCalled()
    expect(mocks.enableTmuxColors).toHaveBeenCalled()
    expect(mux.splitPane).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'claude',
      args: ['--dangerously-skip-permissions'],
      split: 'auto',
      sentinel: false,
    }))
    expect(mocks.spawnProcess).not.toHaveBeenCalled()
  })

  it('falls back to inline launch when splitPane fails', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({backend: 'tmux', launched: false, reason: 'split failed'})),
    })
    const {command} = createCommand(makeFlags({prompt: 'fix this'}))
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)

    await command.run()

    expect(mux.splitPane).toHaveBeenCalled()
    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions', 'fix this'])
  })

  it('creates a new mux session when outside an existing session', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => false),
      createSession: vi.fn(async () => ({exitCode: 0, usedMux: true})),
    })
    const {command, spies} = createCommand(makeFlags())
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)

    await command.run()

    expect(mux.createSession).toHaveBeenCalledWith(expect.objectContaining({
      toolPath: '/usr/bin/claude',
      toolArgs: ['--dangerously-skip-permissions'],
      reattach: false,
    }))
    expect(mocks.spawnProcess).not.toHaveBeenCalled()
    expect(spies.exit).toHaveBeenCalledWith(0)
  })

  it('falls back to inline launch when createSession reports usedMux=false', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => false),
      createSession: vi.fn(async () => ({exitCode: -1, usedMux: false, reason: 'tmux not available'})),
    })
    const {command, spies} = createCommand(makeFlags())
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)

    await command.run()

    expect(mux.createSession).toHaveBeenCalled()
    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions'])
    expect(spies.exit).toHaveBeenCalledWith(0)
  })

  it('shows psmux recovery hint for attach-failed createSession fallback', async () => {
    const mux = createMux({
      backend: 'psmux',
      isInsideSession: vi.fn(() => false),
      createSession: vi.fn(async () => ({exitCode: 1, usedMux: false, reason: 'psmux attach failed after retry (auth/session readiness race)'})),
    })
    const {command, spies} = createCommand(makeFlags())
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)

    await command.run()

    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions'])
    const warningText = spies.logWarning.mock.calls.map((call) => String(call[0])).join('\n')
    expect(warningText).toContain('Recovery: run "psmux kill-server" and relaunch if this persists.')
  })

  it('uses codex executable and codex args when --codex is set', async () => {
    const {command} = createCommand(makeFlags({codex: true, 'no-tmux': true}))

    await command.run()

    const expectedCodexArgs = process.platform === 'win32'
      ? ['-c', 'shell_type="bash"', '--yolo']
      : ['--yolo']
    expect(mocks.spawnProcess).toHaveBeenCalledWith('codex', expectedCodexArgs)
    expect(mocks.getClaudeCodeVersion).not.toHaveBeenCalled()
  })

  it('handles --new by launching a new terminal window', async () => {
    const {command} = createCommand(makeFlags({new: true}))

    await command.run()

    expect(mocks.launchTerminal).toHaveBeenCalledWith(expect.objectContaining({
      cwd: process.cwd(),
      command: expect.stringContaining('aiw'),
    }))
    expect(mocks.spawnProcess).not.toHaveBeenCalled()
    expect(mocks.detectMultiplexer).not.toHaveBeenCalled()
  })

  it('waits on sentinel and exits with pane exit code when --wait is set', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({
        backend: 'tmux',
        launched: true,
        paneId: '%77',
        sentinelPath: '/tmp/sentinel.txt',
      })),
    })
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)
    mocks.waitForSentinelFile.mockResolvedValueOnce(true)
    mocks.readSentinelExitCode.mockReturnValueOnce(23)
    const {command, spies} = createCommand(makeFlags({wait: true}))

    await command.run()

    expect(mocks.waitForSentinelFile).toHaveBeenCalledWith('/tmp/sentinel.txt', 14_400_000)
    expect(mocks.readSentinelExitCode).toHaveBeenCalledWith('/tmp/sentinel.txt', 1)
    expect(spies.exit).toHaveBeenCalledWith(23)
  })

  it('emits JSON output in --json mode', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({
        backend: 'tmux',
        launched: true,
        paneId: '%88',
        sentinelPath: '/tmp/sentinel.txt',
      })),
    })
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)
    const {command, spies} = createCommand(makeFlags({json: true}))

    await command.run()

    const logged = spies.log.mock.calls[0]?.[0]
    expect(typeof logged).toBe('string')
    expect(JSON.parse(String(logged))).toEqual({
      launched: true,
      backend: 'tmux',
      paneId: '%88',
      sentinelPath: '/tmp/sentinel.txt',
      exitCode: null,
      reason: null,
    })
    expect(spies.exit).toHaveBeenCalledWith(0)
  })

  it('supports --json with --wait by reading sentinel exit code', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({
        backend: 'tmux',
        launched: true,
        paneId: '%89',
        sentinelPath: '/tmp/sentinel.txt',
      })),
    })
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)
    mocks.waitForSentinelFile.mockResolvedValueOnce(true)
    mocks.readSentinelExitCode.mockReturnValueOnce(9)
    const {command, spies} = createCommand(makeFlags({json: true, wait: true}))

    await command.run()

    const payload = JSON.parse(String(spies.log.mock.calls[0]?.[0]))
    expect(payload.exitCode).toBe(9)
    expect(spies.exit).toHaveBeenCalledWith(9)
  })

  it('resolves prompt from --prompt-file and passes it inline', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'aiw-launch-test-'))
    const promptPath = path.join(tempDir, 'prompt.md')
    writeFileSync(promptPath, 'prompt from file\n', 'utf8')
    const {command} = createCommand(makeFlags({'no-tmux': true, 'prompt-file': promptPath}))

    await command.run()

    expect(mocks.spawnProcess).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions', 'prompt from file'])
  })

  it('passes --split and parsed --env values into splitPane', async () => {
    const mux = createMux({
      isInsideSession: vi.fn(() => true),
      splitPane: vi.fn(async () => ({backend: 'tmux', launched: true, paneId: '%90'})),
    })
    mocks.detectMultiplexer.mockResolvedValueOnce(mux)
    const {command} = createCommand(makeFlags({
      split: 'h',
      env: '{"FOO":"bar","BAZ":"1"}',
    }))

    await command.run()

    expect(mux.splitPane).toHaveBeenCalledWith(expect.objectContaining({
      split: 'h',
      env: {FOO: 'bar', BAZ: '1'},
    }))
  })

  it('throws invalid usage when --env JSON is invalid', async () => {
    const {command, spies} = createCommand(makeFlags({env: '{not-valid-json'}))

    await expect(command.run()).rejects.toMatchObject({
      message: '--env must be a valid JSON object string',
      exitCode: EXIT_CODES.INVALID_USAGE,
    })
    expect(spies.error).toHaveBeenCalled()
    expect(mocks.spawnProcess).not.toHaveBeenCalled()
  })
})
