/**
 * PsmuxMultiplexer — unified psmux (Windows ConPTY) backend.
 * Composes with PowerShellAdapter for command building.
 * Owns: version checking, session readiness polling, bootstrap defaults.
 */

import {existsSync, readdirSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {sanitizedProcessEnv} from '../env-sanitizer.js'
import type {
  CreateSessionOptions,
  LaunchResult,
  Multiplexer,
  ResolvedStrategy,
  SplitOptions,
  StrategyContext,
} from '../multiplexer.js'
import {getLastLine, spawnAttached, splitFlagFromDimensions} from '../mux-utils.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {PowerShellAdapter} from '../shell-adapters/powershell-adapter.js'
import type {ShellAdapter} from '../shell-adapters/shell-adapter.js'
import {quoteForPowerShell} from '../shell-quoting.js'

/** @internal */
export interface PsmuxVersion {
  major: number
  minor: number
  patch: number
}

const MIN_VERSION: PsmuxVersion = {major: 0, minor: 4, patch: 0}
const ATTACH_RETRY_DELAY_MS = 200
const SESSION_READY_BACKOFF_MS = [50, 100, 150, 250] as const
const PSMUX_TERMINAL_OVERRIDES = ',*:Ss@:Se@:Cs@:Cr@'

/** @internal */
export function meetsMinVersion(v: PsmuxVersion): boolean {
  if (v.major > MIN_VERSION.major) return true
  if (v.major < MIN_VERSION.major) return false
  if (v.minor > MIN_VERSION.minor) return true
  if (v.minor < MIN_VERSION.minor) return false
  return v.patch >= MIN_VERSION.patch
}

/** @internal */
export function parseVersionString(stdout: string): null | PsmuxVersion {
  const match = stdout.trim().match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

type PsmuxSplitFlag = '-h' | '-v'

/** @internal — translate unified SplitDirection to psmux flag. */
export function toPsmuxSplitFlag(direction: 'horizontal' | 'vertical'): PsmuxSplitFlag {
  return direction === 'horizontal' ? '-h' : '-v'
}

/** @internal */
export function buildCreateSessionArgs(params: { cwd: string; encodedCommand: string; sessionName: string; }): string[] {
  return ['new-session', '-d', '-c', params.cwd, '-s', params.sessionName, params.encodedCommand]
}

/** @internal */
export function buildSplitWindowArgs(params: { cwd?: string; encodedCommand: string; splitFlag: '-h' | '-v'; splitTarget?: string | undefined }): string[] {
  const args = ['split-window', params.splitFlag, '-P', '-F', '#{pane_id}']
  if (params.cwd) {
    args.push('-c', params.cwd)
  }

  if (params.splitTarget?.trim()) {
    args.push('-t', params.splitTarget.trim())
  }

  args.push(params.encodedCommand)
  return args
}

/** @internal */
export function buildAttachArgs(sessionName: string): string[] {
  return ['attach', '-t', sessionName]
}

export class PsmuxMultiplexer implements Multiplexer {
  readonly backend = 'psmux' as const
  private readonly psmuxPath: string
  private readonly shell: ShellAdapter

  private constructor(psmuxPath: string) {
    this.psmuxPath = psmuxPath
    this.shell = new PowerShellAdapter()
  }

  static async create(): Promise<null | PsmuxMultiplexer> {
    if (process.platform !== 'win32') return null

    const psmuxPath = findExecutable('psmux') ?? findPsmuxInWinget()
    if (!psmuxPath) return null

    const result = await execFileAsync(psmuxPath, ['-V'], {timeout: 3000})
    if (result.exitCode !== 0) return null

    const version = parseVersionString(result.stdout)
    if (!version) return null

    if (!meetsMinVersion(version)) return null

    return new PsmuxMultiplexer(psmuxPath)
  }

  resolveStrategy(ctx: StrategyContext): ResolvedStrategy {
    if (ctx.disableMux) {
      return {strategy: 'inline', reason: 'Multiplexer disabled via --no-tmux'}
    }
    if (Boolean(process.env.PSMUX_PANE)) {
      return {strategy: 'split', reason: 'Inside psmux session'}
    }
    return {strategy: 'create-session', reason: 'Outside psmux — will create new session'}
  }

  async createSession(options: CreateSessionOptions): Promise<LaunchResult> {
    const {sessionName, reattach, enableMouse = true, cwd} = options

    let promptFilePath: string | undefined
    if (options.promptText) {
      promptFilePath = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
      writeFileSync(promptFilePath, options.promptText, {encoding: 'utf8', mode: 0o600})
    }

    const shellCommand = buildPsmuxShellCommand(this.shell, options, promptFilePath)

    // Inject PSMUX_PANE=1 for inside-session detection + nesting cleanup
    const nestingCleanup = this.shell.buildNestingCleanup()
    const commandWithEnv = `$env:PSMUX_PANE='1'; ${nestingCleanup} ${shellCommand}`

    const psmuxArgs = buildCreateSessionArgs({
      sessionName,
      cwd,
      encodedCommand: this.shell.encodeForExecution(commandWithEnv),
    })

    if (reattach) {
      const exists = await this.hasSession(sessionName)
      if (!exists) {
        const detachedCreate = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
        if (detachedCreate.exitCode !== 0) {
          const stderr = detachedCreate.stderr.trim()
          return {
            launched: false,
            exitCode: detachedCreate.exitCode ?? 1,
            backend: this.backend,
            reason: stderr ? `psmux new-session failed: ${stderr}` : 'psmux new-session failed',
          }
        }
      }
    } else {
      const detachedCreate = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
      if (detachedCreate.exitCode !== 0) {
        const stderr = detachedCreate.stderr.trim()
        return {
          launched: false,
          exitCode: detachedCreate.exitCode ?? 1,
          backend: this.backend,
          reason: stderr ? `psmux new-session failed: ${stderr}` : 'psmux new-session failed',
        }
      }
    }

    const ready = await this.waitForSessionReady(sessionName)
    if (!ready) {
      return {
        launched: false,
        exitCode: 1,
        backend: this.backend,
        reason: `psmux session '${sessionName}' not ready for attach`,
      }
    }

    await this.applyBootstrapDefaults(enableMouse)

    const attachArgs = buildAttachArgs(sessionName)
    const env = sanitizedProcessEnv()

    const firstAttach = await spawnAttached(this.psmuxPath, attachArgs, env, this.backend)
    if (firstAttach.launched || (firstAttach.exitCode !== undefined && firstAttach.exitCode !== 1)) return firstAttach

    await waitMs(ATTACH_RETRY_DELAY_MS)

    const secondAttach = await spawnAttached(this.psmuxPath, attachArgs, env, this.backend)
    if (secondAttach.launched || (secondAttach.exitCode !== undefined && secondAttach.exitCode !== 1)) return secondAttach

    return {
      ...secondAttach,
      reason: 'psmux attach failed after retry (auth/session readiness race)',
      launched: false,
    }
  }

  async kill(handle: string): Promise<void> {
    if (!handle) return
    await execFileAsync(this.psmuxPath, ['kill-pane', '-t', handle], {timeout: 3000})
  }

  async split(options: SplitOptions): Promise<LaunchResult> {
    const {toolName, args, env, cwd, mode, sentinelPath} = options

    const nativePath = findExecutable(toolName)
    if (!nativePath) {
      return {launched: false, backend: this.backend, reason: `${toolName} not found on PATH`}
    }

    try {
      const baseCommand = this.shell.buildToolCommand({
        toolPath: nativePath,
        args,
        env,
        mode,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      const holdMessage = '[aiwcli] Driver exited. Pane held open.'
      const wrappedCommand = this.shell.wrapSentinel({
        command: baseCommand,
        sentinelPath,
        autoClose: false,
        holdPane: false,
        holdMessage,
      })

      const effectiveCommand = this.shell.encodeForExecution(wrappedCommand)

      // Resolve split direction
      const splitDirection = options.split
      let splitFlag: PsmuxSplitFlag
      if (splitDirection === 'auto') {
        splitFlag = await this.resolveAutoSplit()
      } else {
        splitFlag = toPsmuxSplitFlag(splitDirection)
      }

      await this.applyBootstrapDefaults()

      const psmuxArgs = buildSplitWindowArgs({
        splitFlag,
        encodedCommand: effectiveCommand,
        cwd,
      })

      const split = await execFileAsync(this.psmuxPath, psmuxArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        return {
          launched: false,
          backend: this.backend,
          reason: 'psmux split-window failed',
        }
      }

      const handle = getLastLine(split.stdout) || undefined
      return {
        launched: true,
        backend: this.backend,
        handle,
        sentinelPath,
      }
    } catch (error) {
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

/** @internal */
export function buildPsmuxBootstrapCommands(enableMouse = true): string[][] {
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

/** @internal */
export function buildPsmuxShellCommand(shell: ShellAdapter, opts: CreateSessionOptions, promptFilePath?: string): string {
  const {toolPath, toolArgs} = opts

  const cmdParts: string[] = []
  cmdParts.push(`& ${shell.quote(toolPath)}`)

  for (const arg of toolArgs) {
    cmdParts.push(shell.quote(arg))
  }

  if (promptFilePath) {
    const formatted = process.platform === 'win32'
      ? promptFilePath.replaceAll('\\', '/')
      : promptFilePath
    const bootstrap = `Read startup instructions from this file path before taking action: ${formatted}. Use that file as the initial context.`
    cmdParts.push(shell.quote(bootstrap))
  }

  return cmdParts.join(' ')
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
