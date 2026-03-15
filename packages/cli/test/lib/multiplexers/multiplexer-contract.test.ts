import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

/**
 * Contract tests for the Multiplexer interface.
 *
 * Verifies that TmuxMultiplexer, PsmuxMultiplexer, and WeztermMultiplexer
 * all conform to the same behavioral contract. Each backend gets its own
 * describe block with backend-specific mock setup, while the shared
 * contractAssertions() function runs identical assertions against each.
 */

/* ── Hoisted mocks (superset of all three backends' dependencies) ── */

const mocks = vi.hoisted(() => ({
  // Subprocess utilities
  execFileAsync: vi.fn(),
  execSync: vi.fn(),
  findExecutable: vi.fn(),

  // Mux utilities
  getLastLine: vi.fn((stdout: string) => stdout.trim()),
  sanitizedProcessEnv: vi.fn(() => ({})),
  spawnAttached: vi.fn(async () => ({launched: true, exitCode: 0, backend: 'test'})),
  splitFlagFromDimensions: vi.fn(() => '-h'),

  // Platform detection
  isNonWindowsPlatform: vi.fn(() => true),
  isWindowsPlatform: vi.fn(() => false),

  // Shell quoting (all backends)
  quoteForSh: vi.fn((input: string) => `'${input}'`),
  quoteForPowerShell: vi.fn((input: string) => `'${input}'`),
  toEncodedPowerShell: vi.fn((command: string) => `ENC(${command})`),

  // Sentinel wrappers (all backends)
  wrapSentinelSh: vi.fn(({command}: {command: string}) => `WRAP(${command})`),
  wrapSentinelPowerShell: vi.fn(({command}: {command: string}) => `WRAP(${command})`),

  // Mux-utils additions
  buildBootstrapPrompt: vi.fn((filePath: string) => `Read startup instructions from this file path before taking action: ${filePath}. Use that file as the initial context.`),

  // Tmux helpers
  buildShellCommand: vi.fn(() => 'bootstrap command'),
  buildTmuxRuntimeBootstrapCommands: vi.fn(() => []),
  configureTmuxSession: vi.fn(),
  findBestSplit: vi.fn(),
  listPanes: vi.fn(async () => []),
  toMsysPosixPath: vi.fn((input: string) => input),

  // Node built-in stubs
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn(),
  tmpdir: vi.fn(() => '/tmp'),
}))

/* ── Module mocks (file-scoped, covers all three backends) ── */

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}))

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
  writeFileSync: mocks.writeFileSync,
}))

vi.mock('node:os', () => ({
  tmpdir: mocks.tmpdir,
}))

vi.mock('../../../src/lib/env-sanitizer.js', () => ({
  REPL_NESTING_VARS: [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_SESSION_ID',
    'CODEX_THREAD_ID',
    'AIWCLI_INTERNAL_CALL',
  ],
  sanitizedProcessEnv: mocks.sanitizedProcessEnv,
}))

vi.mock('../../../src/lib/mux-utils.js', () => ({
  PANE_HOLD_MESSAGE: '[aiwcli] Driver exited. Pane held open.',
  buildBootstrapPrompt: mocks.buildBootstrapPrompt,
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
  wrapSentinelPowerShell: mocks.wrapSentinelPowerShell,
}))

vi.mock('../../../src/lib/shell-quoting.js', () => ({
  quoteForSh: mocks.quoteForSh,
  quoteForPowerShell: mocks.quoteForPowerShell,
  toEncodedPowerShell: mocks.toEncodedPowerShell,
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

/* ── Imports (after mocks) ── */

import type {CreateSessionOptions, Multiplexer, SplitOptions} from '../../../src/lib/multiplexer.js'
import {PsmuxMultiplexer} from '../../../src/lib/multiplexers/psmux.js'
import {TmuxMultiplexer} from '../../../src/lib/multiplexers/tmux.js'
import {WeztermMultiplexer} from '../../../src/lib/multiplexers/wezterm.js'

/* ── Helpers ── */

function okExec(stdout = ''): {
  exitCode: number
  killed: boolean
  signal: null
  stderr: string
  stdout: string
} {
  return {stdout, stderr: '', exitCode: 0, killed: false, signal: null}
}

const splitOptions: SplitOptions = {
  toolName: 'claude',
  args: ['--dangerously-skip-permissions'],
  cwd: '/repo',
  env: {},
  mode: 'repl',
  split: 'horizontal',
  sentinelPath: '/tmp/sentinel.txt',
  holdPane: false,
  retryOnQuickExit: false,
}

const sessionOptions: CreateSessionOptions = {
  sessionName: 'aiw-contract-test',
  toolPath: '/usr/bin/claude',
  toolArgs: ['--dangerously-skip-permissions'],
  cwd: '/repo',
  reattach: false,
}

/* ── Shared contract assertions ── */

interface ContractSetup {
  setupSplitSuccess: () => void
  setupSplitMissingTool: () => void
  setupCreateSessionSuccess: () => void
}

/**
 * Registers identical it() tests for any Multiplexer implementation.
 * Called inside each backend's describe block so beforeEach scoping applies.
 */
function contractAssertions(getMux: () => Multiplexer, setup: ContractSetup) {
  it('backend property is a non-empty string', () => {
    const mux = getMux()
    expect(typeof mux.backend).toBe('string')
    expect(mux.backend.length).toBeGreaterThan(0)
  })

  it('resolveStrategy with disableMux=true returns strategy=inline', () => {
    const result = getMux().resolveStrategy({
      calledFromRepl: false,
      platform: 'linux',
      disableMux: true,
    })
    expect(result.strategy).toBe('inline')
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('split returns LaunchResult with backend matching .backend', async () => {
    setup.setupSplitSuccess()
    const mux = getMux()
    const result = await mux.split(splitOptions)
    expect(result.launched).toBe(true)
    expect(result.backend).toBe(mux.backend)
  })

  it('split returns launched=false when tool not on PATH', async () => {
    setup.setupSplitMissingTool()
    const result = await getMux().split(splitOptions)
    expect(result.launched).toBe(false)
    expect(result.backend).toBe(getMux().backend)
  })

  it('kill with empty string is a no-op', async () => {
    mocks.execFileAsync.mockClear()
    await getMux().kill('')
    expect(mocks.execFileAsync).not.toHaveBeenCalled()
  })

  it('createSession returns LaunchResult with backend matching .backend', async () => {
    setup.setupCreateSessionSuccess()
    const mux = getMux()
    const result = await mux.createSession(sessionOptions)
    expect(result.backend).toBe(mux.backend)
  })
}

/* ── Per-backend test suites ── */

describe('multiplexer contract', () => {
  describe('TmuxMultiplexer', () => {
    let mux: Multiplexer

    beforeEach(() => {
      vi.clearAllMocks()
      mocks.findExecutable.mockImplementation((name: string) =>
        name === 'tmux' ? '/usr/bin/tmux' : '/usr/bin/claude',
      )
      mocks.execFileAsync.mockResolvedValue(okExec('%42\n'))
      mocks.findBestSplit.mockReturnValue({splitFlag: '-h', targetPane: '%1'})
      mocks.listPanes.mockResolvedValue([{paneId: '%1', width: 200, height: 80, active: true}])
      mocks.buildShellCommand.mockReturnValue('bootstrap command')
      mocks.isNonWindowsPlatform.mockReturnValue(true)
      mocks.isWindowsPlatform.mockReturnValue(false)
      mocks.spawnAttached.mockResolvedValue({launched: true, exitCode: 0, backend: 'tmux'})

      const instance = TmuxMultiplexer.create()
      expect(instance).not.toBeNull()
      mux = instance!
    })

    afterEach(() => {
      delete process.env.TMUX
    })

    contractAssertions(() => mux, {
      setupSplitSuccess() {
        // beforeEach already configures mocks for split success
      },
      setupSplitMissingTool() {
        mocks.findExecutable.mockImplementation((name: string) =>
          name === 'tmux' ? '/usr/bin/tmux' : null,
        )
      },
      setupCreateSessionSuccess() {
        // beforeEach already configures mocks for createSession success
      },
    })
  })

  describe('PsmuxMultiplexer', () => {
    let mux: Multiplexer
    let platformSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      vi.clearAllMocks()
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.findExecutable.mockImplementation((name: string) =>
        name === 'psmux' ? 'C:\\tools\\psmux.exe' : 'C:\\tools\\claude.exe',
      )
      mocks.execFileAsync.mockResolvedValue(okExec('psmux 0.4.2\n'))
      mocks.spawnAttached.mockResolvedValue({launched: true, exitCode: 0, backend: 'psmux'})

      const instance = await PsmuxMultiplexer.create()
      expect(instance).not.toBeNull()
      mux = instance!

      // Reset to general-purpose success after create()'s version check
      mocks.execFileAsync.mockResolvedValue(okExec('%42\n'))
    })

    afterEach(() => {
      platformSpy.mockRestore()
      delete process.env.PSMUX_PANE
    })

    contractAssertions(() => mux, {
      setupSplitSuccess() {
        // beforeEach already configures mocks for split success
      },
      setupSplitMissingTool() {
        mocks.findExecutable.mockImplementation((name: string) =>
          name === 'psmux' ? 'C:\\tools\\psmux.exe' : null,
        )
      },
      setupCreateSessionSuccess() {
        // beforeEach already configures mocks for createSession success
      },
    })
  })

  describe('WeztermMultiplexer', () => {
    let mux: Multiplexer
    let weztermPaneBackup: string | undefined
    let termProgramBackup: string | undefined

    beforeEach(() => {
      vi.clearAllMocks()
      weztermPaneBackup = process.env.WEZTERM_PANE
      termProgramBackup = process.env.TERM_PROGRAM
      process.env.WEZTERM_PANE = '0'

      mocks.findExecutable.mockImplementation((name: string) => {
        if (name === 'wezterm') return '/usr/bin/wezterm'
        if (name === 'claude') return '/usr/bin/claude'
        if (name === 'bash') return '/usr/bin/bash'
        return null
      })
      mocks.execFileAsync.mockResolvedValue(okExec('42\n'))

      const instance = WeztermMultiplexer.create()
      expect(instance).not.toBeNull()
      mux = instance!
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

    contractAssertions(() => mux, {
      setupSplitSuccess() {
        // beforeEach already configures mocks for split success;
        // resolveToolPath + split-pane both handled by default mockResolvedValue
      },
      setupSplitMissingTool() {
        mocks.findExecutable.mockImplementation((name: string) =>
          name === 'wezterm' ? '/usr/bin/wezterm' : null,
        )
      },
      setupCreateSessionSuccess() {
        // beforeEach already configures mocks for createSession success
      },
    })
  })
})
