/* eslint-disable import/order -- vi.mock must precede mocked module import */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {LaunchDependencies, LaunchRequest} from '../../src/capabilities/launch/contracts.js'
import {EXIT_CODES} from '../../src/types/exit-codes.js'

const envMocks = vi.hoisted(() => ({
  clearProcessNestingVars: vi.fn(),
  isCalledFromRepl: vi.fn(() => false),
}))

const sentinelMocks = vi.hoisted(() => ({
  cleanupSentinelIpc: vi.fn(),
  createSentinelIpcPaths: vi.fn(() => ({
    tmpDir: '/tmp/sentinel',
    inputPath: '/tmp/sentinel/input.txt',
    stdoutPath: '/tmp/sentinel/stdout.txt',
    stderrPath: '/tmp/sentinel/stderr.txt',
    sentinelPath: '/tmp/sentinel/sentinel.txt',
  })),
  readSentinelExitCode: vi.fn(() => 0),
  waitForSentinelFile: vi.fn(async () => true),
}))

const platformMocks = vi.hoisted(() => ({
  checkVersionCompatibility: vi.fn(() => ({compatible: true, version: '1.2.3'})),
  configureTmuxSession: vi.fn(),
  detectMultiplexer: vi.fn(async () => null),
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
  readSentinelExitCode: sentinelMocks.readSentinelExitCode,
  spawnProcess: vi.fn(async () => 0),
  REPL_NESTING_VARS: [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_SESSION_ID',
    'CODEX_THREAD_ID',
    'AIWCLI_INTERNAL_CALL',
  ],
  waitForSentinelFile: sentinelMocks.waitForSentinelFile,
}))

vi.mock('../../src/platform/launch.js', () => platformMocks)

vi.mock('../../src/lib/env-sanitizer.js', () => ({
  REPL_NESTING_VARS: platformMocks.REPL_NESTING_VARS,
  clearProcessNestingVars: envMocks.clearProcessNestingVars,
  isCalledFromRepl: envMocks.isCalledFromRepl,
}))

vi.mock('../../src/lib/runtime/sentinel-ipc.js', () => sentinelMocks)

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

import {executeLaunch} from '../../src/capabilities/launch/control-plane/execute-launch.js'

// --- TestDataBuilder helpers (copied from launch-unit.test.ts) ---

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

// --- Tests ---

describe('spawnInlineWithRetry (tested through executeLaunch)', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    platformMocks.spawnProcess.mockResolvedValue(0)
    platformMocks.detectMultiplexer.mockResolvedValue(null)
    platformMocks.launchTerminal.mockResolvedValue({success: true})
    sentinelMocks.waitForSentinelFile.mockResolvedValue(true)
    sentinelMocks.readSentinelExitCode.mockReturnValue(0)
    platformMocks.findExecutable.mockImplementation((name: string) => `/usr/bin/${name}`)
    platformMocks.findToolPath.mockImplementation((name: string) => `/usr/bin/${name}`)
    platformMocks.checkVersionCompatibility.mockReturnValue({compatible: true, version: '1.2.3'})
    platformMocks.getClaudeCodeVersion.mockResolvedValue('1.2.3')
    envMocks.isCalledFromRepl.mockReturnValue(false)
  })

  afterEach(() => {
    if (dateNowSpy) {
      dateNowSpy.mockRestore()
    }
  })

  describe('retry triggers when Devin exits quickly', () => {
    it('calls spawnProcess twice and returns exit code 0 on successful retry', async () => {
      // Mock Date.now: start=1000, after first spawn=1000+5000 (5s elapsed, < 10s threshold)
      let callCount = 0
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        // Calls 1-2 map to start: 1000, Calls 3+ map to elapsed check: 6000 (5s elapsed)
        return callCount <= 2 ? 1000 : 6000
      })

      // First actual spawn: exit 1 (quick failure), second: exit 0 (success)
      // But note: preflight warmup is the FIRST spawnProcess call (with ['--version'])
      // Then the actual spawn is the SECOND call, then the retry is the THIRD call
      platformMocks.spawnProcess
        .mockResolvedValueOnce(0)  // preflight warmup (--version)
        .mockResolvedValueOnce(1)  // first actual spawn (exits quickly with 1)
        .mockResolvedValueOnce(0)  // retry spawn (exits 0)

      const request = makeRequest({flags: {devin: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // spawnProcess called 3 times: warmup + first attempt + retry
      expect(platformMocks.spawnProcess).toHaveBeenCalledTimes(3)
      // Final exit code should be 0 (from the retry)
      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })

  describe('no retry when Devin runs long enough', () => {
    it('calls spawnProcess twice (warmup + actual) and returns exit code 1', async () => {
      // Mock Date.now: start=1000, after spawn=1000+15000 (15s elapsed, > 10s threshold)
      let callCount = 0
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        // Call 1: start timestamp, Call 2+: 16000 (15s elapsed, past threshold)
        return callCount <= 1 ? 1000 : 16000
      })

      platformMocks.spawnProcess
        .mockResolvedValueOnce(0)  // preflight warmup (--version)
        .mockResolvedValueOnce(1)  // actual spawn (ran long, exited 1)

      const request = makeRequest({flags: {devin: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // spawnProcess called 2 times: warmup + actual (no retry — ran long enough)
      expect(platformMocks.spawnProcess).toHaveBeenCalledTimes(2)
      // Exit code 1 (no retry because elapsed > 10s)
      expect(deps.host.exit).toHaveBeenCalledWith(1)
    })
  })

  describe('no retry for Claude mode', () => {
    it('calls spawnProcess once and returns exit code 1 even with quick exit', async () => {
      // Mock Date.now to simulate quick exit — but it shouldn't matter for claude mode
      let callCount = 0
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        return callCount <= 1 ? 1000 : 2000  // 1s elapsed (quick)
      })

      platformMocks.spawnProcess.mockResolvedValueOnce(1)  // actual spawn (exits 1 quickly)

      // Claude mode (default) — retryOnQuickExit is false
      const request = makeRequest({flags: {'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // spawnProcess called only once (no warmup, no retry for claude mode)
      expect(platformMocks.spawnProcess).toHaveBeenCalledTimes(1)
      // Exit code 1 forwarded directly
      expect(deps.host.exit).toHaveBeenCalledWith(1)
    })
  })

  describe('preflight warmup runs before retry-eligible commands', () => {
    it('calls spawnProcess with --version before the actual args for devin mode', async () => {
      // Date.now returning stable values (no retry needed for this test)
      let callCount = 0
      dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++
        return callCount <= 1 ? 1000 : 16000  // 15s elapsed — no retry
      })

      platformMocks.spawnProcess
        .mockResolvedValueOnce(0)  // preflight warmup (--version)
        .mockResolvedValueOnce(0)  // actual spawn

      const request = makeRequest({flags: {devin: true, 'no-tmux': true}})
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // First spawnProcess call should be the warmup with ['--version']
      expect(platformMocks.spawnProcess).toHaveBeenCalledTimes(2)
      const firstCall = platformMocks.spawnProcess.mock.calls[0]
      expect(firstCall[0]).toBe('devin')
      expect(firstCall[1]).toEqual(['--version'])
      // stdio: 'pipe' should be passed for the warmup
      expect(firstCall[2]).toEqual({stdio: 'pipe'})

      // Second spawnProcess call should be the actual devin args
      const secondCall = platformMocks.spawnProcess.mock.calls[1]
      expect(secondCall[0]).toBe('devin')
      expect(secondCall[1]).toContain('--permission-mode')
      expect(secondCall[1]).toContain('dangerous')
    })
  })
})
