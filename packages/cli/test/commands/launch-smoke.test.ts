/* eslint-disable import/order -- vi.mock must precede mocked module import */
import {beforeEach, describe, expect, it, vi} from 'vitest'
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

function createMux(overrides: Partial<{
  backend: string
  createSession: (options: unknown) => Promise<{backend: string; exitCode?: number; launched: boolean; reason?: string}>
  kill: (handle: string) => Promise<void>
  resolveStrategy: (ctx: unknown) => {reason: string; strategy: string}
  split: (options: unknown) => Promise<{backend: string; exitCode?: number; handle?: string; launched: boolean; reason?: string; sentinelPath?: string}>
}> = {}) {
  return {
    backend: 'tmux' as const,
    createSession: vi.fn(async () => ({launched: true, exitCode: 0, backend: 'tmux'})),
    kill: vi.fn(async () => {}),
    resolveStrategy: vi.fn(() => ({strategy: 'split', reason: 'Inside tmux session'})),
    split: vi.fn(async () => ({backend: 'tmux' as const, launched: true, handle: '%9', sentinelPath: '/tmp/sentinel/sentinel.txt'})),
    ...overrides,
  }
}

// --- Tests ---

describe('executeLaunch smoke tests', () => {
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

  describe('full split pane flow with prompt', () => {
    it('materializes prompt file, calls mux.split with correct args, and logs success', async () => {
      const mux = createMux({
        resolveStrategy: vi.fn(() => ({strategy: 'split', reason: 'Inside tmux session'})),
        split: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: true,
          handle: '%42',
          sentinelPath: '/tmp/sentinel/sentinel.txt',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest({
        flags: {prompt: 'fix all linting errors', env: '{"FOO":"bar"}'},
      })
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // Prompt file materialized via PromptFileManager (which calls writeFileSync)
      // The PromptFileManager constructs a path from tempDir, now(), and pid
      // Verify mux.split was called
      expect(mux.split).toHaveBeenCalledTimes(1)
      const splitCall = mux.split.mock.calls[0][0] as Record<string, unknown>
      // Prompt path should be passed through the split request
      expect(splitCall.promptPath).toBeDefined()
      // Env vars should be passed through
      expect(splitCall.env).toEqual({FOO: 'bar'})
      // Sentinel path should be passed
      expect(splitCall.sentinelPath).toBeDefined()
      // cwd should be forwarded
      expect(splitCall.cwd).toBe('/test/project')

      // Success message logged
      const infoMessages = deps.host.logInfo.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
      expect(infoMessages).toContain('tmux pane')
      expect(infoMessages).toContain('%42')

      // Should return normally (no exit called for successful split without --wait)
      expect(deps.host.exit).not.toHaveBeenCalled()
    })
  })

  describe('full session flow with version check', () => {
    it('runs version check, generates session name, creates session, and forwards exit code', async () => {
      const mux = createMux({
        resolveStrategy: vi.fn(() => ({strategy: 'create-session', reason: 'Outside tmux'})),
        createSession: vi.fn(async () => ({launched: true, exitCode: 3, backend: 'tmux'})),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      // Claude mode (default) — version check should run
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // Version check ran
      expect(platformMocks.getClaudeCodeVersion).toHaveBeenCalledTimes(1)
      expect(platformMocks.checkVersionCompatibility).toHaveBeenCalledTimes(1)

      // Debug lines for version check
      const debugMessages = deps.host.debug.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
      expect(debugMessages).toContain('Claude Code version: 1.2.3')
      expect(debugMessages).toContain('Compatibility status: compatible')

      // Session created with correct params
      expect(mux.createSession).toHaveBeenCalledTimes(1)
      const sessionCall = mux.createSession.mock.calls[0][0] as Record<string, unknown>
      expect(sessionCall.toolPath).toBe('/usr/bin/claude')
      expect(sessionCall.cwd).toBe('/test/project')
      // Session name should be generated (contains aiw- prefix)
      expect(sessionCall.sessionName).toMatch(/^aiw-/)

      // Exit code forwarded from session result
      expect(deps.host.exit).toHaveBeenCalledWith(3)
    })
  })

  describe('full inline fallback cascade', () => {
    it('attempts split first, warns on failure, then falls back to inline spawn', async () => {
      const mux = createMux({
        resolveStrategy: vi.fn(() => ({strategy: 'split', reason: 'Inside tmux session'})),
        split: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: false,
          reason: 'tmux pane creation failed',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      platformMocks.spawnProcess.mockResolvedValueOnce(5)
      const request = makeRequest()
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // Split was attempted
      expect(mux.split).toHaveBeenCalledTimes(1)

      // Warning logged about split failure
      expect(deps.host.logWarning).toHaveBeenCalledWith(
        expect.stringContaining('Pane split failed'),
      )

      // Inline spawn called as fallback
      expect(platformMocks.spawnProcess).toHaveBeenCalled()
      // The inline args should include the claude base args
      const spawnCalls = platformMocks.spawnProcess.mock.calls
      const lastCall = spawnCalls.at(-1)
      expect(lastCall[0]).toBe('claude')
      expect(lastCall[1]).toContain('--dangerously-skip-permissions')

      // Exit code from inline spawn forwarded
      expect(deps.host.exit).toHaveBeenCalledWith(5)
    })
  })

  describe('devin mode with prompt-path through split', () => {
    it('includes --prompt-file in toolArgs, sets retryOnQuickExit, and creates sentinel', async () => {
      const mux = createMux({
        resolveStrategy: vi.fn(() => ({strategy: 'split', reason: 'Inside tmux session'})),
        split: vi.fn(async () => ({
          backend: 'tmux' as const,
          launched: true,
          handle: '%55',
          sentinelPath: '/tmp/sentinel/sentinel.txt',
        })),
      })
      platformMocks.detectMultiplexer.mockResolvedValueOnce(mux)
      const request = makeRequest({
        flags: {devin: true, 'prompt-path': '/my/prompt.md'},
      })
      const deps = makeDeps()

      await executeLaunch(request, deps)

      expect(mux.split).toHaveBeenCalledTimes(1)
      const splitCall = mux.split.mock.calls[0][0] as Record<string, unknown>

      // toolArgs should include --prompt-file with the prompt path
      const toolArgs = splitCall.args as string[]
      expect(toolArgs).toContain('--prompt-file')
      expect(toolArgs).toContain('/my/prompt.md')

      // retryOnQuickExit should be true for devin mode
      expect(splitCall.retryOnQuickExit).toBe(true)

      // Sentinel created (sentinelPath should be set)
      expect(splitCall.sentinelPath).toBeDefined()

      // Version check should NOT run (skipVersionCheck is true for devin)
      expect(platformMocks.getClaudeCodeVersion).not.toHaveBeenCalled()
    })
  })

  describe('codex mode on Windows', () => {
    it('includes shell_type bash arg, skips LSP patch, and spawns inline', async () => {
      platformMocks.detectMultiplexer.mockResolvedValueOnce(null)
      platformMocks.spawnProcess.mockResolvedValueOnce(0)
      const request = makeRequest({
        platform: 'win32',
        flags: {codex: true},
      })
      const deps = makeDeps()

      await executeLaunch(request, deps)

      // LSP patch NOT called (skipVersionCheck is true for codex, needsLspPatch is false)
      expect(platformMocks.ensureLspPatch).not.toHaveBeenCalled()

      // Version check NOT called (skipVersionCheck is true for codex)
      expect(platformMocks.getClaudeCodeVersion).not.toHaveBeenCalled()

      // spawnProcess called with codex args including shell_type=bash on win32
      expect(platformMocks.spawnProcess).toHaveBeenCalled()
      const spawnCalls = platformMocks.spawnProcess.mock.calls
      const lastCall = spawnCalls.at(-1)
      expect(lastCall[0]).toBe('codex')
      const args = lastCall[1] as string[]
      expect(args).toContain('-c')
      expect(args).toContain('shell_type="bash"')

      // Inline spawn (exit called with spawn result)
      expect(deps.host.exit).toHaveBeenCalledWith(0)
    })
  })
})
