/* eslint-disable import/order -- vi.mock must precede mocked module import */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {LaunchDependencies, LaunchRequest} from '../../src/capabilities/launch/contracts.js'
import {EXIT_CODES} from '../../src/types/exit-codes.js'

// --- Single barrel mock: replaces 11 separate module mocks ---

const platformMocks = vi.hoisted(() => ({
  checkVersionCompatibility: vi.fn(() => ({compatible: true, version: '1.2.3'})),
  configureTmuxSession: vi.fn(),
  detectMultiplexer: vi.fn(async () => null),
  ensureLspPatch: vi.fn(async () => {}),
  findExecutable: vi.fn((name: string) => `/usr/bin/${name}`),
  findToolPath: vi.fn((name: string) => `/usr/bin/${name}`),
  getClaudeCodeVersion: vi.fn(async () => '1.2.3'),
  launchTerminal: vi.fn(async () => ({success: true})),
  ProcessSpawnError: class ProcessSpawnError extends Error {
    exitCode = EXIT_CODES.ENVIRONMENT_ERROR

    constructor(message: string, public readonly code?: string) {
      super(message)
    }
  },
  quoteForSh: vi.fn((s: string) => `'${s}'`),
  readSentinelExitCode: vi.fn(() => 0),
  spawnProcess: vi.fn(async () => 0),
  waitForSentinelFile: vi.fn(async () => true),
}))

vi.mock('../../src/platform/launch.js', () => platformMocks)

import {executeLaunch} from '../../src/capabilities/launch/control-plane/execute-launch.js'

// --- TestDataBuilder helpers ---

function makeFlags(overrides: Partial<LaunchRequest['flags']> = {}): LaunchRequest['flags'] {
  return {
    codex: false,
    devin: false,
    env: undefined,
    json: false,
    new: false,
    'no-tmux': false,
    prompt: undefined,
    'prompt-file': undefined,
    'prompt-path': undefined,
    'spawned-window': false,
    split: undefined,
    'tmux-session': undefined,
    wait: false,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<LaunchRequest> & {flags?: Partial<LaunchRequest['flags']>} = {}): LaunchRequest {
  const {flags: flagOverrides, ...rest} = overrides
  return {
    cwd: '/test/project',
    flags: makeFlags(flagOverrides),
    interactiveTty: true,
    platform: 'linux',
    readPromptFile: vi.fn(() => undefined),
    ...rest,
  }
}

interface TestHost {
  debug: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  log: ReturnType<typeof vi.fn>
  logInfo: ReturnType<typeof vi.fn>
  logWarning: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
}

function makeDeps(overrides: Partial<LaunchDependencies> = {}): LaunchDependencies & {host: TestHost} {
  const host: TestHost = {
    debug: vi.fn(),
    error: vi.fn((message: string, options?: {exit?: number}) => {
      const err = new Error(typeof message === 'string' ? message : String(message)) as Error & {exitCode?: number}
      err.exitCode = options?.exit
      throw err
    }) as unknown as ReturnType<typeof vi.fn>,
    exit: vi.fn(),
    log: vi.fn(),
    logInfo: vi.fn(),
    logWarning: vi.fn(),
    warn: vi.fn(),
  }
  return {
    host,
    now: () => 1000000,
    pid: 12345,
    tempDir: '/tmp/test',
    writePromptFile: vi.fn(),
    ...overrides,
  }
}

function createMux(overrides: Partial<{
  backend: 'psmux' | 'tmux'
  createSession: (options: unknown) => Promise<{exitCode: number; reason?: string; usedMux: boolean}>
  isInsideSession: () => boolean
  kill: (paneId: string) => Promise<void>
  splitPane: (options: unknown) => Promise<{backend: 'psmux' | 'tmux'; exitCode?: number; launched: boolean; paneId?: string; reason?: string; sentinelPath?: string}>
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

// --- Tests ---

describe('executeLaunch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformMocks.spawnProcess.mockResolvedValue(0)
    platformMocks.detectMultiplexer.mockResolvedValue(null)
    platformMocks.launchTerminal.mockResolvedValue({success: true})
    platformMocks.waitForSentinelFile.mockResolvedValue(true)
    platformMocks.readSentinelExitCode.mockReturnValue(0)
    platformMocks.findExecutable.mockImplementation((name: string) => `/usr/bin/${name}`)
    platformMocks.findToolPath.mockImplementation((name: string) => `/usr/bin/${name}`)
    platformMocks.checkVersionCompatibility.mockReturnValue({compatible: true, version: '1.2.3'})
    platformMocks.getClaudeCodeVersion.mockResolvedValue('1.2.3')
  })

  describe('Windows prelaunch patching', () => {
    it('runs the LSP patch for Claude launches on Windows', async () => {
      const request = makeRequest({platform: 'win32', flags: {'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(platformMocks.ensureLspPatch).toHaveBeenCalledTimes(1)
    })

    it('skips the LSP patch for Devin launches on Windows', async () => {
      const request = makeRequest({platform: 'win32', flags: {devin: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(platformMocks.ensureLspPatch).not.toHaveBeenCalled()
    })

    it('skips the LSP patch for Codex launches on Windows', async () => {
      const request = makeRequest({platform: 'win32', flags: {codex: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(platformMocks.ensureLspPatch).not.toHaveBeenCalled()
    })
  })

  describe('inline spawn (no multiplexer)', () => {
    it('exits 0 when --no-tmux bypasses mux detection', async () => {
      const request = makeRequest({flags: {'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
      expect(deps.host.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('--no-tmux'),
      )
    })

    it('exits 0 when no multiplexer is available', async () => {
      platformMocks.detectMultiplexer.mockResolvedValueOnce(null)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('forwards spawn exit code to host.exit', async () => {
      platformMocks.spawnProcess.mockResolvedValueOnce(42)
      const request = makeRequest({flags: {'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(42)
    })

    it('mentions non-interactive terminal when tty is false', async () => {
      const request = makeRequest({interactiveTty: false})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Non-interactive terminal'),
      )
    })
  })

  describe('codex mode', () => {
    it('exits with spawn exit code when --codex --no-tmux is set', async () => {
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest({flags: {codex: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })

  describe('devin mode', () => {
    it('exits with spawn exit code when --devin --no-tmux is set', async () => {
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest({flags: {devin: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })

  describe('split pane (inside mux session)', () => {
    it('reports successful pane launch via logInfo', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({backend: 'tmux' as const, launched: true, paneId: '%22'})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const infoMessages = deps.host.logInfo.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
      expect(infoMessages).toContain('tmux pane')
      expect(infoMessages).toContain('%22')
    })

    it('falls back to inline spawn and warns when splitPane fails', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({backend: 'tmux' as const, launched: false, reason: 'split failed'})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.logWarning).toHaveBeenCalledWith(
        expect.stringContaining('Pane split failed'),
      )
      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('includes prompt text in inline fallback after split failure', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({backend: 'tmux' as const, launched: false, reason: 'err'})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest({flags: {prompt: 'fix this'}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })

  describe('create session (outside mux session)', () => {
    it('exits 0 when createSession reports usedMux with exitCode 0', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => false),
        createSession: vi.fn(async () => ({exitCode: 0, usedMux: true})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('forwards mux session exit code to host.exit', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => false),
        createSession: vi.fn(async () => ({exitCode: 7, usedMux: true})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(7)
    })

    it('falls back to inline spawn when createSession reports usedMux=false', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => false),
        createSession: vi.fn(async () => ({exitCode: -1, usedMux: false, reason: 'tmux not available'})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('shows psmux recovery hint for attach-failed createSession fallback', async () => {
      const mux = createMux({
        backend: 'psmux',
        isInsideSession: vi.fn(() => false),
        createSession: vi.fn(async () => ({
          exitCode: 1,
          usedMux: false,
          reason: 'psmux attach failed after retry (auth/session readiness race)',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const warningText = deps.host.logWarning.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
      expect(warningText).toContain('Recovery: run "psmux kill-server" and relaunch if this persists.')
    })

    it('warns about unavailable mux when reason contains "not found"', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => false),
        createSession: vi.fn(async () => ({
          exitCode: 1,
          usedMux: false,
          reason: 'tmux not found',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const warningText = deps.host.logWarning.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
      expect(warningText).toContain('unavailable')
    })

    it('warns when tool path not found on PATH', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => false),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.findToolPath.mockReturnValueOnce(null)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const warningText = deps.host.logWarning.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
      expect(warningText).toContain('not found on PATH')
    })
  })

  describe('--new terminal launch', () => {
    it('logs success message on successful terminal launch', async () => {
      platformMocks.launchTerminal.mockResolvedValueOnce({success: true})
      const request = makeRequest({flags: {new: true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.log).toHaveBeenCalledWith(
        expect.stringContaining('New terminal launched'),
      )
    })

    it('calls host.error on failed terminal launch', async () => {
      platformMocks.launchTerminal.mockResolvedValueOnce({success: false, error: 'no terminal emulator'})
      const request = makeRequest({flags: {new: true}})
      const deps = makeDeps()

      await expect(executeLaunch(request, deps)).rejects.toThrow()
      expect(deps.host.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to launch new terminal'),
        expect.objectContaining({exit: EXIT_CODES.GENERAL_ERROR}),
      )
    })
  })

  describe('--wait mode', () => {
    it('exits with sentinel exit code when --wait is set and pane launches', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: true,
          paneId: '%77',
          sentinelPath: '/tmp/sentinel.txt',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.waitForSentinelFile.mockResolvedValueOnce(true)
      platformMocks.readSentinelExitCode.mockReturnValueOnce(23)
      const request = makeRequest({flags: {wait: true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(23)
    })
  })

  describe('--json mode', () => {
    it('emits valid JSON with launched and backend fields', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: true,
          paneId: '%88',
          sentinelPath: '/tmp/sentinel.txt',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest({flags: {json: true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const logged = deps.host.log.mock.calls[0]?.[0]
      expect(typeof logged).toBe('string')
      const parsed = JSON.parse(String(logged))
      expect(parsed).toEqual(expect.objectContaining({
        launched: true,
        backend: 'tmux',
        paneId: '%88',
      }))
      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('includes exit code in JSON when combined with --wait', async () => {
      const mux = createMux({
        isInsideSession: vi.fn(() => true),
        splitPane: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: true,
          paneId: '%89',
          sentinelPath: '/tmp/sentinel.txt',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.waitForSentinelFile.mockResolvedValueOnce(true)
      platformMocks.readSentinelExitCode.mockReturnValueOnce(9)
      const request = makeRequest({flags: {json: true, wait: true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      const payload = JSON.parse(String(deps.host.log.mock.calls[0]?.[0]))
      expect(payload.exitCode).toBe(9)
      expect(deps.host.exit).toHaveBeenCalledWith(9)
    })
  })

  describe('--env validation', () => {
    it('calls host.error with INVALID_USAGE for malformed --env JSON', async () => {
      const request = makeRequest({flags: {env: '{not-valid-json'}})
      const deps = makeDeps()

      await expect(executeLaunch(request, deps)).rejects.toMatchObject({
        message: '--env must be a valid JSON object string',
        exitCode: EXIT_CODES.INVALID_USAGE,
      })
      expect(deps.host.error).toHaveBeenCalled()
    })
  })

  describe('prompt resolution', () => {
    it('reads prompt from --prompt-file and passes to inline spawn', async () => {
      const request = makeRequest({
        flags: {'no-tmux': true, 'prompt-file': '/tmp/prompt.md'},
        readPromptFile: vi.fn(() => 'prompt from file'),
      })
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })

    it('passes --prompt text to inline spawn', async () => {
      const request = makeRequest({
        flags: {'no-tmux': true, prompt: 'fix this bug'},
      })
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })

  describe('error handling', () => {
    it('calls host.error with ENVIRONMENT_ERROR for ProcessSpawnError', async () => {
      platformMocks.spawnProcess.mockRejectedValueOnce(
        new platformMocks.ProcessSpawnError('Command not found: claude'),
      )
      const request = makeRequest({flags: {'no-tmux': true}})
      const deps = makeDeps()

      await expect(executeLaunch(request, deps)).rejects.toThrow()
      expect(deps.host.error).toHaveBeenCalledWith(
        'Command not found: claude',
        expect.objectContaining({exit: EXIT_CODES.ENVIRONMENT_ERROR}),
      )
    })

    it('calls host.error with GENERAL_ERROR for unexpected errors', async () => {
      platformMocks.spawnProcess.mockRejectedValueOnce(new Error('something unexpected'))
      const request = makeRequest({flags: {'no-tmux': true}})
      const deps = makeDeps()

      await expect(executeLaunch(request, deps)).rejects.toThrow()
      expect(deps.host.error).toHaveBeenCalledWith(
        'Unexpected launch failure.',
        expect.objectContaining({exit: EXIT_CODES.GENERAL_ERROR}),
      )
    })
  })
})
