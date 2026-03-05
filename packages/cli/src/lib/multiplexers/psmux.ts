/**
 * PsmuxMultiplexer — unified psmux (Windows ConPTY) backend.
 * Consolidates PsmuxLauncher + launchInPsmuxSession + command building from pane-driver.
 */

import {existsSync, readdirSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import type {
  CreateSessionOptions,
  CreateSessionResult,
  Multiplexer,
  SplitPaneOptions,
  SplitPaneResult,
} from '../multiplexer.js'
import {cleanClaudeEnv, getLastLine, spawnAttached, splitFlagFromDimensions} from '../mux-utils.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from '../runtime/sentinel-ipc.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {wrapSentinelPowerShell} from '../sentinel-wrapper.js'
import {quoteForPowerShell, toEncodedPowerShell} from '../shell-quoting.js'

interface PsmuxVersion {
  major: number
  minor: number
  patch: number
}

const MIN_VERSION: PsmuxVersion = {major: 0, minor: 4, patch: 0}
const ATTACH_RETRY_DELAY_MS = 200
const SESSION_READY_BACKOFF_MS = [50, 100, 150, 250] as const
const PSMUX_TERMINAL_OVERRIDES = ',*:Ss@:Se@:Cs@:Cr@'

function meetsMinVersion(v: PsmuxVersion): boolean {
  if (v.major > MIN_VERSION.major) return true
  if (v.major < MIN_VERSION.major) return false
  if (v.minor > MIN_VERSION.minor) return true
  if (v.minor < MIN_VERSION.minor) return false
  return v.patch >= MIN_VERSION.patch
}

type PsmuxSplitFlag = '-h' | '-v'

function buildCommandArgs(
  args: string[],
  mode: 'exec' | 'repl',
  promptPath?: string,
): string[] {
  if (mode !== 'repl' || !promptPath) return args

  const absolutePromptPath = path.resolve(promptPath)
  const bootstrap = `Read startup instructions from this file path before taking action: ${formatPromptPathForBootstrap(absolutePromptPath)}. Use that file as the initial context.`
  return [...args, bootstrap]
}

function buildPowerShellToolCommand(params: {
  args: string[];
  env: Record<string, string>;
  mode: 'exec' | 'repl';
  promptPath?: string;
  toolPath: string;
}): string {
  const {toolPath, args, env, mode, promptPath} = params
  const envPrefix = Object.entries(env)
    .map(([key, value]) => `$env:${key}=${quoteForPowerShell(value)}`)
    .join('; ')

  const commandArgs = buildCommandArgs(args, mode, promptPath)
  const argArray = commandArgs.map((arg) => quoteForPowerShell(arg)).join(', ')
  const invocation = `& ${quoteForPowerShell(toolPath)}${argArray ? ` @(${argArray})` : ''}`

  const body = mode === 'exec' && promptPath
    ? `Get-Content -Raw -Path ${quoteForPowerShell(promptPath)} | ${invocation}`
    : invocation

  return [envPrefix, body].filter(Boolean).join('; ')
}

export class PsmuxMultiplexer implements Multiplexer {
  readonly backend = 'psmux' as const
  private readonly psmuxPath: string

  private constructor(psmuxPath: string) {
    this.psmuxPath = psmuxPath
  }

  /**
   * Check if psmux is installed and meets version requirements.
   * Checks PATH first, then probes the winget install directory
   * (winget install doesn't always add packages to PATH).
   * Returns a PsmuxMultiplexer instance or null.
   */
  static async create(): Promise<null | PsmuxMultiplexer> {
    if (process.platform !== 'win32') return null

    const psmuxPath = findExecutable('psmux') ?? findPsmuxInWinget()
    if (!psmuxPath) return null

    const result = await execFileAsync(psmuxPath, ['-V'], {timeout: 3000})
    if (result.exitCode !== 0) return null

    const match = result.stdout.trim().match(/(\d+)\.(\d+)\.(\d+)/)
    if (!match) return null

    const version: PsmuxVersion = {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    }

    if (!meetsMinVersion(version)) return null

    return new PsmuxMultiplexer(psmuxPath)
  }

  /**
   * Create a new psmux session.
   * Injects PSMUX_PANE=1 into the PowerShell command so child processes
   * can detect they're inside a psmux session.
   */
  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const {sessionName, reattach, enableMouse = true} = options

    let promptFilePath: string | undefined
    if (options.promptText) {
      promptFilePath = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
      writeFileSync(promptFilePath, options.promptText, {encoding: 'utf8', mode: 0o600})
    }

    // Build the PowerShell command to run inside the psmux session
    const shellCommand = buildPsmuxShellCommand(options, promptFilePath)

    // Inject PSMUX_PANE=1 for inside-session detection
    const commandWithEnv = `$env:PSMUX_PANE='1'; ${shellCommand}`

    const psmuxArgs = ['new-session', '-d',
      '-c', process.cwd(),
      '-s', sessionName,
      toEncodedPowerShell(commandWithEnv),
    ]

    if (reattach) {
      const exists = await this.hasSession(sessionName)
      if (!exists) {
        const detachedCreate = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
        if (detachedCreate.exitCode !== 0) {
          const stderr = detachedCreate.stderr.trim()
          return {
            exitCode: detachedCreate.exitCode ?? 1,
            usedMux: false,
            reason: stderr ? `psmux new-session failed: ${stderr}` : 'psmux new-session failed',
          }
        }
      }
    } else {
      const detachedCreate = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
      if (detachedCreate.exitCode !== 0) {
        const stderr = detachedCreate.stderr.trim()
        return {
          exitCode: detachedCreate.exitCode ?? 1,
          usedMux: false,
          reason: stderr ? `psmux new-session failed: ${stderr}` : 'psmux new-session failed',
        }
      }
    }

    const ready = await this.waitForSessionReady(sessionName)
    if (!ready) {
      return {
        exitCode: 1,
        usedMux: false,
        reason: `psmux session '${sessionName}' not ready for attach`,
      }
    }

    await this.applyBootstrapDefaults(enableMouse)

    const attachArgs = ['attach', '-t', sessionName]
    const env = cleanClaudeEnv()

    const firstAttach = await spawnAttached(this.psmuxPath, attachArgs, env, this.backend)
    if (firstAttach.usedMux || firstAttach.exitCode !== 1) return firstAttach

    await waitMs(ATTACH_RETRY_DELAY_MS)

    const secondAttach = await spawnAttached(this.psmuxPath, attachArgs, env, this.backend)
    if (secondAttach.usedMux || secondAttach.exitCode !== 1) return secondAttach

    return {
      ...secondAttach,
      reason: 'psmux attach failed after retry (auth/session readiness race)',
      usedMux: false,
    }
  }

  /**
   * Detect if we're inside a psmux session we created.
   * Uses PSMUX_PANE env var that we inject in createSession().
   */
  isInsideSession(): boolean {
    return Boolean(process.env.PSMUX_PANE)
  }

  async kill(paneId: string): Promise<void> {
    if (!paneId) return
    await execFileAsync(this.psmuxPath, ['kill-pane', '-t', paneId], {timeout: 3000})
  }

  async splitPane(options: SplitPaneOptions): Promise<SplitPaneResult> {
    const mode = options.mode ?? 'repl'
    const args = options.args ?? []
    const envVars = options.env ?? {}
    const cwd = options.cwd ?? process.cwd()

    // Resolve tool path — psmux uses native Windows paths directly
    const toolPath = findExecutable(options.toolName)
    if (!toolPath) {
      return {launched: false, backend: this.backend, reason: `${options.toolName} not found on PATH`}
    }

    // Sentinel IPC
    const useSentinel = options.sentinel !== false
    const sentinel = useSentinel ? createSentinelIpcPaths(`aiwcli-pane-${options.toolName}`) : null

    try {
      const baseCommand = buildPowerShellToolCommand({
        toolPath,
        args,
        env: envVars,
        mode,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      let paneCommand = baseCommand
      if (sentinel) {
        const holdMessage = options.holdMessage ?? '[aiwcli] Driver exited. Pane held open.'
        paneCommand = wrapSentinelPowerShell({
          command: baseCommand,
          sentinelPath: sentinel.sentinelPath,
          autoClose: Boolean(options.autoClose),
          holdPane: Boolean(options.holdPane),
          holdMessage,
        })
      }

      // Wrap in PowerShell using -EncodedCommand to avoid double-quote expansion issues
      const effectivePaneCommand = toEncodedPowerShell(paneCommand)

      // Resolve split direction
      const splitDirection = options.split ?? 'auto'
      let splitFlag: PsmuxSplitFlag
      if (splitDirection === 'auto') {
        splitFlag = await this.resolveAutoSplit()
      } else {
        splitFlag = splitDirection === 'v' ? '-v' : '-h'
      }

      await this.applyBootstrapDefaults()

      // Build psmux split-window command
      const psmuxArgs = ['split-window', splitFlag, '-P', '-F', '#{pane_id}']
      if (cwd) {
        psmuxArgs.push('-c', cwd)
      }

      if (options.splitTarget?.trim()) {
        psmuxArgs.push('-t', options.splitTarget.trim())
      }

      psmuxArgs.push(effectivePaneCommand)

      const split = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        if (sentinel) cleanupSentinelIpc(sentinel)
        return {
          launched: false,
          backend: this.backend,
          reason: 'psmux split-window failed',
          stderr: split.stderr.trim() || undefined,
        }
      }

      const paneId = getLastLine(split.stdout) || undefined
      return {
        launched: true,
        backend: this.backend,
        paneId,
        sentinelPath: sentinel?.sentinelPath,
      }
    } catch (error) {
      if (sentinel) cleanupSentinelIpc(sentinel)
      return {
        launched: false,
        backend: this.backend,
        reason: `pane launch failed: ${String(error)}`,
      }
    }
  }

  private async applyBootstrapDefaults(enableMouse = true): Promise<void> {
    await runBootstrapCommands(this.psmuxPath, buildPsmuxBootstrapCommands(enableMouse))
  }

  private async hasSession(sessionName: string): Promise<boolean> {
    try {
      const result = await execFileAsync(
        this.psmuxPath,
        ['has-session', '-t', sessionName],
        {timeout: 3000},
      )
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  private async resolveAutoSplit(): Promise<PsmuxSplitFlag> {
    try {
      const size = await execFileAsync(
        this.psmuxPath,
        ['display-message', '-p', '#{pane_width} #{pane_height}'],
        {timeout: 3000},
      )
      if (size.exitCode !== 0) return '-h'

      const parts = size.stdout.trim().split(/\s+/)
      if (parts.length < 2) return '-h'

      const width = Number.parseInt(parts[0] ?? '', 10)
      const height = Number.parseInt(parts[1] ?? '', 10)
      if (!Number.isFinite(width) || !Number.isFinite(height)) return '-h'

      return splitFlagFromDimensions(width, height)
    } catch {
      return '-h'
    }
  }

  private async waitForSessionReady(sessionName: string): Promise<boolean> {
    if (await this.hasSession(sessionName)) return true

    const poll = async (index: number): Promise<boolean> => {
      const backoffMs = SESSION_READY_BACKOFF_MS[index]
      if (backoffMs === undefined) return false

      await waitMs(backoffMs)
      if (await this.hasSession(sessionName)) return true
      return poll(index + 1)
    }

    return poll(0)
  }
}

// Probe winget package dir for psmux.exe.
// winget install drops the binary under %LOCALAPPDATA%/Microsoft/WinGet/Packages/
// but does not always add it to PATH.
function findPsmuxInWinget(): null | string {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null

  const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(packagesDir)) return null

  try {
    const entries = readdirSync(packagesDir)
    const psmuxDir = entries.find((e) => e.startsWith('marlocarlo.psmux'))
    if (!psmuxDir) return null

    const candidate = path.join(packagesDir, psmuxDir, 'psmux.exe')
    return existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

function buildPsmuxBootstrapCommands(enableMouse = true): string[][] {
  const commands: string[][] = []
  if (enableMouse) {
    commands.push(['set-option', '-g', 'mouse', 'on'])
  }

  commands.push(
    ['set-option', '-g', 'history-limit', '50000'],
    ['set-option', '-g', 'cursor-blink', 'off'],
    ['set-option', '-g', 'cursor-style', 'block'],
    ['set-option', '-g', 'status-interval', '0'],
    ['set-option', '-g', 'terminal-overrides', PSMUX_TERMINAL_OVERRIDES],
  )
  return commands
}

function buildPsmuxShellCommand(opts: CreateSessionOptions, promptFilePath?: string): string {
  const {toolPath, toolArgs} = opts

  const cmdParts: string[] = []
  cmdParts.push(`& ${quoteForPowerShell(toolPath)}`)

  for (const arg of toolArgs) {
    cmdParts.push(quoteForPowerShell(arg))
  }

  if (promptFilePath) {
    const bootstrap = `Read startup instructions from this file path before taking action: ${formatPromptPathForBootstrap(promptFilePath)}. Use that file as the initial context.`
    cmdParts.push(quoteForPowerShell(bootstrap))
  }

  return cmdParts.join(' ')
}

function formatPromptPathForBootstrap(promptPath: string): string {
  if (process.platform !== 'win32') return promptPath
  return promptPath.replaceAll('\\', '/')
}

async function runBootstrapCommands(psmuxPath: string, commands: string[][], index = 0): Promise<void> {
  const command = commands[index]
  if (!command) return

  try {
    await execFileAsync(psmuxPath, command, {timeout: 3000})
  } catch {
    // Best effort only.
  }

  await runBootstrapCommands(psmuxPath, commands, index + 1)
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
