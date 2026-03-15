/**
 * TmuxMultiplexer — unified tmux backend.
 * Composes with BashAdapter for command building.
 * Owns: split direction resolution, tmux session config, Windows bootstrap.
 */

import {execSync} from 'node:child_process'
import * as fs from 'node:fs'

import {sanitizedProcessEnv} from '../env-sanitizer.js'
import type {
  CreateSessionOptions,
  LaunchResult,
  Multiplexer,
  ResolvedStrategy,
  SplitOptions,
  StrategyContext,
} from '../multiplexer.js'
import {PANE_HOLD_MESSAGE, getLastLine, spawnAttached, splitFlagFromDimensions} from '../mux-utils.js'
import {isNonWindowsPlatform, isWindowsPlatform} from '../runtime/platform-adapter.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {BashAdapter} from '../shell-adapters/bash-adapter.js'
import type {ShellAdapter} from '../shell-adapters/shell-adapter.js'
import {findBestSplit, listPanes, type TmuxSplitFlag} from '../tmux-pane-placement.js'
import {toMsysPosixPath} from '../tmux-primitives.js'
import {buildShellCommand, buildTmuxRuntimeBootstrapCommands, configureTmuxSession} from '../tmux-session.js'

/** @internal — translate unified SplitDirection to tmux flag. */
export function toTmuxSplitFlag(direction: 'horizontal' | 'vertical'): TmuxSplitFlag {
  return direction === 'horizontal' ? '-h' : '-v'
}

/** @internal */
export function withWindowsTmuxBootstrap(command: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return command
  const bootstrap = buildTmuxRuntimeBootstrapCommands(platform).join('; ')
  return `${bootstrap}; ${command}`
}

/** @internal */
export function buildTmuxSplitWindowArgs(params: { command: string; cwd?: string | undefined; splitFlag: '-h' | '-v'; splitTarget?: string | undefined }): string[] {
  const args = ['split-window', params.splitFlag, '-P', '-F', '#{pane_id}']
  if (params.cwd) {
    args.push('-c', params.cwd)
  }

  if (params.splitTarget) {
    args.push('-t', params.splitTarget)
  }

  args.push(params.command)
  return args
}

/** @internal */
export function buildTmuxCreateSessionArgs(params: { cwd: string; reattach?: boolean | undefined; sessionName: string; shellCommand: string; }): string[] {
  const args = ['new-session']
  if (params.reattach) args.push('-A')
  args.push('-c', params.cwd, '-s', params.sessionName, params.shellCommand)
  return args
}

async function resolveAutoSplit(
  tmuxPath: string,
  splitTarget?: string,
): Promise<{splitFlag: TmuxSplitFlag; splitTarget?: string}> {
  const explicitTarget = splitTarget?.trim()
  if (explicitTarget) {
    const size = await execFileAsync(
      tmuxPath,
      ['display-message', '-p', '-t', explicitTarget, '#{pane_width} #{pane_height}'],
      {timeout: 3000},
    )
    if (size.exitCode === 0) {
      const parts = size.stdout.trim().split(/\s+/)
      if (parts.length >= 2) {
        const width = Number.parseInt(parts[0] ?? '', 10)
        const height = Number.parseInt(parts[1] ?? '', 10)
        if (Number.isFinite(width) && Number.isFinite(height)) {
          return {
            splitFlag: splitFlagFromDimensions(width, height),
            splitTarget: explicitTarget,
          }
        }
      }
    }

    return {splitFlag: '-h', splitTarget: explicitTarget}
  }

  const panes = await listPanes(tmuxPath)
  const placement = findBestSplit(panes)
  if (!placement) return {splitFlag: '-h'}

  return {
    splitFlag: placement.splitFlag,
    splitTarget: placement.targetPane,
  }
}

export class TmuxMultiplexer implements Multiplexer {
  readonly backend = 'tmux' as const
  private readonly tmuxPath: string
  private readonly shell: ShellAdapter

  private constructor(tmuxPath: string) {
    this.tmuxPath = tmuxPath
    this.shell = new BashAdapter()
  }

  static create(): null | TmuxMultiplexer {
    const tmuxPath = findExecutable('tmux')
    if (!tmuxPath) return null
    return new TmuxMultiplexer(tmuxPath)
  }

  resolveStrategy(ctx: StrategyContext): ResolvedStrategy {
    if (ctx.disableMux) {
      return {strategy: 'inline', reason: 'Multiplexer disabled via --no-tmux'}
    }
    if (Boolean(process.env.TMUX)) {
      return {strategy: 'split', reason: 'Inside tmux session'}
    }
    return {strategy: 'create-session', reason: 'Outside tmux — will create new session'}
  }

  async createSession(options: CreateSessionOptions): Promise<LaunchResult> {
    const {sessionName, reattach, cwd} = options

    if (!isNonWindowsPlatform()) {
      return {launched: false, exitCode: -1, backend: this.backend, reason: 'tmux not available on this platform'}
    }

    // Set default-terminal BEFORE session creation
    try {
      execSync(
        String.raw`tmux start-server \; set -g default-terminal "tmux-256color"`,
        {stdio: 'ignore', timeout: 3000},
      )
    } catch {
      try {
        execSync(
          String.raw`tmux start-server \; set -g default-terminal "screen-256color"`,
          {stdio: 'ignore', timeout: 3000},
        )
      } catch { /* best-effort */ }
    }

    const shellCommand = buildShellCommand({
      sessionName,
      toolPath: options.toolPath,
      toolArgs: options.toolArgs,
      promptText: options.promptText,
      enableMouse: options.enableMouse ?? true,
    })

    const args = buildTmuxCreateSessionArgs({
      sessionName,
      cwd,
      shellCommand,
      reattach,
    })

    return spawnAttached('tmux', args, sanitizedProcessEnv(), this.backend)
  }

  async kill(handle: string): Promise<void> {
    if (!handle) return
    await execFileAsync(this.tmuxPath, ['kill-pane', '-t', handle], {timeout: 3000})
  }

  async split(options: SplitOptions): Promise<LaunchResult> {
    const {toolName, args, env, cwd, mode, sentinelPath} = options

    // Configure tmux session defaults (mouse, scrollback, color)
    configureTmuxSession()

    // Resolve tool path
    const nativePath = findExecutable(toolName)
    if (!nativePath) {
      return {launched: false, backend: this.backend, reason: `${toolName} not found on PATH`}
    }

    const effectiveToolPath = await this.shell.resolveToolPath(toolName, nativePath)
    if (!effectiveToolPath) {
      return {launched: false, backend: this.backend, reason: `${toolName} not found in bash PATH (required for tmux pane)`}
    }

    // Inject COLORTERM=truecolor for tmux
    const effectiveEnv = {COLORTERM: 'truecolor', ...env}

    try {
      const promptText = mode === 'repl' && options.promptPath
        ? fs.readFileSync(options.promptPath, 'utf8')
        : undefined

      let baseCommand = this.shell.buildToolCommand({
        toolPath: effectiveToolPath,
        args,
        env: effectiveEnv,
        mode,
        promptText,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      if (options.retryOnQuickExit) {
        baseCommand = this.shell.wrapQuickExitRetry(baseCommand, this.shell.quote(effectiveToolPath))
      }

      const holdMessage = PANE_HOLD_MESSAGE
      const paneCommand = this.shell.wrapSentinel({
        command: baseCommand,
        sentinelPath,
        autoClose: false,
        holdPane: false,
        holdMessage,
      })

      // Resolve split direction
      const splitDirection = options.split
      let splitFlag: TmuxSplitFlag
      let splitTarget: string | undefined

      if (splitDirection === 'auto') {
        try {
          const resolved = await resolveAutoSplit(this.tmuxPath)
          splitFlag = resolved.splitFlag
          splitTarget = resolved.splitTarget
        } catch {
          splitFlag = '-h'
        }
      } else {
        splitFlag = toTmuxSplitFlag(splitDirection)
      }

      // Build tmux split-window command
      const cwdPath = isWindowsPlatform() ? toMsysPosixPath(cwd) : cwd
      const bootstrappedCommand = withWindowsTmuxBootstrap(paneCommand)
      const tmuxArgs = buildTmuxSplitWindowArgs({
        splitFlag,
        command: `bash -lc ${this.shell.quote(bootstrappedCommand)}`,
        cwd: cwdPath,
        splitTarget,
      })

      const split = await execFileAsync(this.tmuxPath, tmuxArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        return {
          launched: false,
          backend: this.backend,
          reason: 'tmux split-window failed',
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
}
