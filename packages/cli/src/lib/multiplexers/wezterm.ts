/**
 * WeztermMultiplexer — WezTerm backend for Windows.
 * Uses `wezterm cli` subcommands (split-pane, spawn, kill-pane, list).
 * Preferred over psmux when running inside a WezTerm terminal (WEZTERM_PANE or TERM_PROGRAM env var).
 * Panes run commands via `bash -lc "command"` (Git Bash), same shell strategy as TmuxMultiplexer.
 */

import * as fs from 'node:fs'

import type {
  CreateSessionOptions,
  CreateSessionResult,
  Multiplexer,
  SplitPaneOptions,
  SplitPaneResult,
} from '../multiplexer.js'
import {getLastLine, splitFlagFromDimensions} from '../mux-utils.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from '../runtime/sentinel-ipc.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {wrapSentinelSh} from '../sentinel-wrapper.js'
import {quoteForSh} from '../shell-quoting.js'

/**
 * Env var injected by createSession()/splitPane() so isInsideSession()
 * can distinguish an AIW-managed WezTerm session from a plain WezTerm window.
 * WEZTERM_PANE is always set by WezTerm for every child process, so it cannot
 * be used to detect AIW sessions (unlike tmux's TMUX or psmux's PSMUX_PANE).
 */
export const AIW_SESSION_ENV = 'AIW_MUX_SESSION'

type WeztermSplitFlag = '--bottom' | '--right'

/** @internal */
export function buildEnvPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${quoteForSh(value)}`)
    .join(' ')
}

/** @internal */
export function buildShToolCommand(params: {
  args: string[];
  env: Record<string, string>;
  mode: 'exec' | 'repl';
  promptPath?: string;
  promptText?: string | undefined;
  toolPath: string;
}): string {
  const {toolPath, args, env, mode, promptPath, promptText} = params
  const envPrefix = buildEnvPrefix(env)
  const commandArgs = buildCommandArgs(args, mode, promptText)
  const argPart = commandArgs.map((arg) => quoteForSh(arg)).join(' ')
  const base = [envPrefix, quoteForSh(toolPath), argPart]
    .filter(Boolean)
    .join(' ')

  if (mode === 'exec' && promptPath) {
    return `${base} < ${quoteForSh(promptPath)}`
  }

  return base
}

/** @internal */
export function buildCommandArgs(
  args: string[],
  mode: 'exec' | 'repl',
  promptText?: string,
): string[] {
  if (mode !== 'repl' || promptText === undefined) return args
  return [...args, promptText]
}

/** @internal */
export function buildWeztermSplitArgs(params: {
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
  args.push('--', 'bash', '-lc', params.command)
  return args
}

/** @internal */
export function buildWeztermSpawnArgs(params: {
  command: string;
  cwd?: string | undefined;
}): string[] {
  const args = ['cli', 'spawn', '--new-window']
  if (params.cwd) {
    args.push('--cwd', params.cwd)
  }
  args.push('--', 'bash', '-lc', params.command)
  return args
}

/** @internal */
export function buildWeztermKillArgs(paneId: string): string[] {
  return ['cli', 'kill-pane', '--pane-id', paneId]
}

/** @internal */
export function weztermSplitFlagFromDirection(direction: 'h' | 'v'): WeztermSplitFlag {
  return direction === 'h' ? '--right' : '--bottom'
}

async function resolveToolForBash(toolName: string): Promise<null | string> {
  const bash = findExecutable('bash')
  if (!bash) return null
  const result = await execFileAsync(bash, ['-lc', `command -v ${toolName}`], {
    timeout: 3000,
    env: {...process.env, MSYS_NO_PATHCONV: '1'},
  })
  return result.exitCode === 0 ? result.stdout.trim() || null : null
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

  private constructor(weztermPath: string) {
    this.weztermPath = weztermPath
  }

  static create(): null | WeztermMultiplexer {
    // WEZTERM_PANE is only set in panes created via `wezterm cli`;
    // TERM_PROGRAM is always set by WezTerm for all child processes.
    if (!process.env.WEZTERM_PANE && process.env.TERM_PROGRAM !== 'WezTerm') return null
    const weztermPath = findExecutable('wezterm')
    if (!weztermPath) return null
    return new WeztermMultiplexer(weztermPath)
  }

  isInsideSession(): boolean {
    // WEZTERM_PANE is always set by WezTerm for every child process,
    // so we check for AIW_MUX_SESSION instead — only set by createSession()/splitPane().
    return Boolean(process.env[AIW_SESSION_ENV])
  }

  async kill(paneId: string): Promise<void> {
    if (!paneId) return
    await execFileAsync(this.weztermPath, buildWeztermKillArgs(paneId), {timeout: 3000})
  }

  async splitPane(options: SplitPaneOptions): Promise<SplitPaneResult> {
    const mode = options.mode ?? 'repl'
    const args = options.args ?? []
    const envVars = {[AIW_SESSION_ENV]: '1', ...(options.env ?? {})}
    const cwd = options.cwd ?? process.cwd()

    // Resolve tool path — on Windows, resolve from bash's perspective
    const toolPath = findExecutable(options.toolName)
    if (!toolPath) {
      return {launched: false, backend: this.backend, reason: `${options.toolName} not found on PATH`}
    }

    let effectiveToolPath = toolPath
    if (process.platform === 'win32') {
      const bashPath = await resolveToolForBash(options.toolName)
      if (bashPath) {
        effectiveToolPath = bashPath
      } else {
        return {launched: false, backend: this.backend, reason: `${options.toolName} not found in bash PATH (required for wezterm pane)`}
      }
    }

    // Sentinel IPC for exit code tracking
    const useSentinel = options.sentinel !== false
    const sentinel = useSentinel ? createSentinelIpcPaths(`aiwcli-pane-${options.toolName}`) : null

    try {
      const promptText = mode === 'repl' && options.promptPath
        ? fs.readFileSync(options.promptPath, 'utf8')
        : undefined

      const baseCommand = buildShToolCommand({
        toolPath: effectiveToolPath,
        args,
        env: envVars,
        mode,
        promptText,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      let paneCommand = baseCommand
      if (sentinel) {
        const holdMessage = options.holdMessage ?? '[aiwcli] Driver exited. Pane held open.'
        paneCommand = wrapSentinelSh({
          command: baseCommand,
          sentinelPath: sentinel.sentinelPath,
          autoClose: Boolean(options.autoClose),
          autoCloseCommand: `wezterm cli kill-pane --pane-id $WEZTERM_PANE >/dev/null 2>&1 || true`,
          holdPane: Boolean(options.holdPane),
          holdMessage,
        })
      }

      // Resolve split direction
      const splitDirection = options.split ?? 'auto'
      let splitFlag: WeztermSplitFlag

      if (splitDirection === 'auto') {
        splitFlag = await resolveAutoSplit(this.weztermPath, options.splitTarget)
      } else {
        splitFlag = weztermSplitFlagFromDirection(splitDirection === 'v' ? 'v' : 'h')
      }

      const weztermArgs = buildWeztermSplitArgs({
        splitFlag,
        command: paneCommand,
        cwd,
        paneId: options.splitTarget?.trim() || process.env.WEZTERM_PANE,
      })

      const split = await execFileAsync(this.weztermPath, weztermArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        if (sentinel) cleanupSentinelIpc(sentinel)
        return {
          launched: false,
          backend: this.backend,
          reason: 'wezterm split-pane failed',
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

  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const {toolPath, toolArgs} = options

    // On Windows, resolve tool path from bash's perspective (same as splitPane).
    let effectiveToolPath = toolPath
    if (process.platform === 'win32') {
      const toolName = toolPath.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? toolPath
      const bashPath = await resolveToolForBash(toolName)
      if (bashPath) {
        effectiveToolPath = bashPath
      }
      // If bash resolution fails, fall through with the original path —
      // MSYS bash can often handle Windows paths.
    }

    const baseCommand = buildShToolCommand({
      toolPath: effectiveToolPath,
      args: toolArgs,
      env: {[AIW_SESSION_ENV]: '1'},
      mode: 'repl',
      promptText: options.promptText,
    })

    const weztermArgs = buildWeztermSpawnArgs({
      command: baseCommand,
      cwd: process.cwd(),
    })

    try {
      const result = await execFileAsync(this.weztermPath, weztermArgs, {timeout: 5000})
      if (result.exitCode !== 0) {
        return {
          exitCode: result.exitCode,
          usedMux: false,
          reason: `wezterm spawn failed: ${result.stderr.trim() || 'unknown error'}`,
        }
      }

      return {exitCode: 0, usedMux: true}
    } catch (error) {
      return {
        exitCode: -1,
        usedMux: false,
        reason: `wezterm spawn failed: ${String(error)}`,
      }
    }
  }
}
