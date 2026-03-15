/**
 * WeztermMultiplexer — WezTerm backend for Windows.
 * Composes with BashAdapter for command building.
 * Owns: REPL-context gating (resolveStrategy), WezTerm pane management,
 * holdPane behavior, auto-close command.
 */

import * as fs from 'node:fs'

import type {
  CreateSessionOptions,
  LaunchResult,
  Multiplexer,
  ResolvedStrategy,
  SplitOptions,
  StrategyContext,
} from '../multiplexer.js'
import {PANE_HOLD_MESSAGE, getLastLine, splitFlagFromDimensions} from '../mux-utils.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {BashAdapter} from '../shell-adapters/bash-adapter.js'
import type {ShellAdapter} from '../shell-adapters/shell-adapter.js'

type WeztermSplitFlag = '--bottom' | '--right'

/** @internal — translate unified SplitDirection to wezterm flag. */
export function toWeztermSplitFlag(direction: 'horizontal' | 'vertical'): WeztermSplitFlag {
  return direction === 'horizontal' ? '--right' : '--bottom'
}

/** @internal */
export function buildWeztermSplitArgs(params: {
  bashPath?: string | undefined;
  command: string;
  cwd?: string | undefined;
  paneId?: string | undefined;
  splitFlag: WeztermSplitFlag;
}): string[] {
  const args = ['cli', 'split-pane', params.splitFlag]
  if (params.cwd) {
    args.push('--cwd', params.cwd)
  }
  if (params.paneId) {
    args.push('--pane-id', params.paneId)
  }
  // Use -c (not -lc): login shell profiles may exec another shell (e.g. zsh),
  // preventing the command from running. Tool paths are already absolute.
  args.push('--', params.bashPath ?? 'bash', '-c', params.command)
  return args
}

/** @internal */
export function buildWeztermSpawnArgs(params: {
  bashPath?: string | undefined;
  command: string;
  cwd?: string | undefined;
}): string[] {
  const args = ['cli', 'spawn', '--new-window']
  if (params.cwd) {
    args.push('--cwd', params.cwd)
  }
  args.push('--', params.bashPath ?? 'bash', '-c', params.command)
  return args
}

/** @internal */
export function buildWeztermKillArgs(paneId: string): string[] {
  return ['cli', 'kill-pane', '--pane-id', paneId]
}

/**
 * Resolve Git Bash path on Windows. WezTerm may resolve bare `bash` to
 * WSL's bash.exe instead of Git Bash.
 */
function resolveGitBash(): string | null {
  return findExecutable('bash')
}

interface WeztermPane {
  pane_id: number;
  size?: { cols: number; rows: number };
  tab_id?: number;
  window_id?: number;
}

async function resolveAutoSplit(
  weztermPath: string,
  currentPaneId?: string,
): Promise<WeztermSplitFlag> {
  try {
    const result = await execFileAsync(
      weztermPath,
      ['cli', 'list', '--format', 'json'],
      {timeout: 3000},
    )
    if (result.exitCode !== 0) return '--right'

    const panes: WeztermPane[] = JSON.parse(result.stdout)
    const targetId = currentPaneId ?? process.env.WEZTERM_PANE
    if (!targetId) return '--right'

    const pane = panes.find((p) => String(p.pane_id) === targetId)
    if (!pane?.size) return '--right'

    const muxFlag = splitFlagFromDimensions(pane.size.cols, pane.size.rows)
    return muxFlag === '-h' ? '--right' : '--bottom'
  } catch {
    return '--right'
  }
}

export class WeztermMultiplexer implements Multiplexer {
  readonly backend = 'wezterm' as const
  private readonly weztermPath: string
  private readonly shell: ShellAdapter

  private constructor(weztermPath: string) {
    this.weztermPath = weztermPath
    this.shell = new BashAdapter()
  }

  static create(): null | WeztermMultiplexer {
    if (!process.env.WEZTERM_PANE && process.env.TERM_PROGRAM !== 'WezTerm') return null
    const weztermPath = findExecutable('wezterm')
    if (!weztermPath) return null
    return new WeztermMultiplexer(weztermPath)
  }

  resolveStrategy(ctx: StrategyContext): ResolvedStrategy {
    if (ctx.disableMux) {
      return {strategy: 'inline', reason: 'Multiplexer disabled via --no-tmux'}
    }
    // REPL-context gating: only split when called from a REPL session.
    // From a shell (no REPL vars), launch inline.
    if (!ctx.calledFromRepl) {
      return {strategy: 'inline', reason: 'WezTerm shell — no REPL context, launching inline'}
    }
    return {strategy: 'split', reason: 'Inside WezTerm REPL — splitting pane'}
  }

  async kill(handle: string): Promise<void> {
    if (!handle) return
    await execFileAsync(this.weztermPath, buildWeztermKillArgs(handle), {timeout: 3000})
  }

  async split(options: SplitOptions): Promise<LaunchResult> {
    const {toolName, args, env, cwd, mode, sentinelPath} = options

    // Resolve tool path
    const nativePath = findExecutable(toolName)
    if (!nativePath) {
      return {launched: false, backend: this.backend, reason: `${toolName} not found on PATH`}
    }

    const effectiveToolPath = await this.shell.resolveToolPath(toolName, nativePath)
    if (!effectiveToolPath) {
      return {launched: false, backend: this.backend, reason: `${toolName} not found in bash PATH (required for wezterm pane)`}
    }

    try {
      const promptText = mode === 'repl' && options.promptPath
        ? fs.readFileSync(options.promptPath, 'utf8')
        : undefined

      let baseCommand = this.shell.buildToolCommand({
        toolPath: effectiveToolPath,
        args,
        env,
        mode,
        promptText,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      if (options.retryOnQuickExit) {
        baseCommand = this.shell.wrapQuickExitRetry(baseCommand, this.shell.quote(effectiveToolPath))
      }

      const gitBash = process.platform === 'win32' ? resolveGitBash() ?? undefined : undefined

      // WezTerm always holds pane and uses auto-close via wezterm kill-pane
      const holdMessage = PANE_HOLD_MESSAGE
      let paneCommand = this.shell.wrapSentinel({
        command: baseCommand,
        sentinelPath,
        autoClose: false,
        autoCloseCommand: `wezterm cli kill-pane --pane-id $WEZTERM_PANE >/dev/null 2>&1 || true`,
        holdPane: true,
        holdMessage,
      })

      // Prepend nesting cleanup (PATH fix + unset REPL vars)
      paneCommand = `${this.shell.buildNestingCleanup()} ${paneCommand}`

      // Resolve split direction
      const splitDirection = options.split
      let splitFlag: WeztermSplitFlag

      if (splitDirection === 'auto') {
        splitFlag = await resolveAutoSplit(this.weztermPath)
      } else {
        splitFlag = toWeztermSplitFlag(splitDirection)
      }

      const weztermArgs = buildWeztermSplitArgs({
        splitFlag,
        command: paneCommand,
        cwd,
        paneId: process.env.WEZTERM_PANE,
        bashPath: gitBash,
      })

      const split = await execFileAsync(this.weztermPath, weztermArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        return {
          launched: false,
          backend: this.backend,
          reason: 'wezterm split-pane failed',
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

  async createSession(options: CreateSessionOptions): Promise<LaunchResult> {
    const {toolPath, toolArgs, cwd} = options

    // On Windows, resolve tool path from bash's perspective
    let effectiveToolPath = toolPath
    if (process.platform === 'win32') {
      const toolName = toolPath.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? toolPath
      const bashPath = await this.shell.resolveToolPath(toolName, toolPath)
      if (bashPath) {
        effectiveToolPath = bashPath
      }
    }

    const baseCommand = this.shell.buildToolCommand({
      toolPath: effectiveToolPath,
      args: toolArgs,
      env: {},
      mode: 'repl',
      promptText: options.promptText,
    })

    // Prepend nesting cleanup
    const spawnCommand = `${this.shell.buildNestingCleanup()} ${baseCommand}`

    const weztermArgs = buildWeztermSpawnArgs({
      command: spawnCommand,
      cwd,
      bashPath: process.platform === 'win32' ? resolveGitBash() ?? undefined : undefined,
    })

    try {
      const result = await execFileAsync(this.weztermPath, weztermArgs, {timeout: 5000})
      if (result.exitCode !== 0) {
        return {
          launched: false,
          exitCode: result.exitCode,
          backend: this.backend,
          reason: `wezterm spawn failed: ${result.stderr.trim() || 'unknown error'}`,
        }
      }

      return {launched: true, exitCode: 0, backend: this.backend}
    } catch (error) {
      return {
        launched: false,
        exitCode: -1,
        backend: this.backend,
        reason: `wezterm spawn failed: ${String(error)}`,
      }
    }
  }
}
