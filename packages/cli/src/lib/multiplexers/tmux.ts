/**
 * TmuxMultiplexer — unified tmux backend.
 * Consolidates TmuxLauncher + launchInTmuxSession + command building from pane-driver.
 */

import {execSync} from 'node:child_process'
import * as fs from 'node:fs'

import type {
  CreateSessionOptions,
  CreateSessionResult,
  Multiplexer,
  SplitPaneOptions,
  SplitPaneResult,
} from '../multiplexer.js'
import {cleanClaudeEnv, getLastLine, spawnAttached, splitFlagFromDimensions} from '../mux-utils.js'
import {isNonWindowsPlatform, isWindowsPlatform} from '../runtime/platform-adapter.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from '../runtime/sentinel-ipc.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {wrapSentinelSh} from '../sentinel-wrapper.js'
import {findBestSplit, listPanes} from '../tmux-pane-placement.js'
import {quoteForSh, toMsysPosixPath} from '../tmux-primitives.js'
import {buildShellCommand, buildTmuxRuntimeBootstrapCommands} from '../tmux-session.js'

type TmuxSplitFlag = '-h' | '-v'

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
export function withWindowsTmuxBootstrap(command: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return command
  const bootstrap = buildTmuxRuntimeBootstrapCommands(platform).join('; ')
  return `${bootstrap}; ${command}`
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

/** @internal */
export function buildTmuxSplitWindowArgs(params: { splitFlag: '-h' | '-v'; command: string; cwd?: string | undefined; splitTarget?: string | undefined }): string[] {
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
export function buildTmuxCreateSessionArgs(params: { sessionName: string; cwd: string; shellCommand: string; reattach?: boolean | undefined }): string[] {
  const args = ['new-session']
  if (params.reattach) args.push('-A')
  args.push('-c', params.cwd, '-s', params.sessionName, params.shellCommand)
  return args
}

export class TmuxMultiplexer implements Multiplexer {
  readonly backend = 'tmux' as const
  private readonly tmuxPath: string

  private constructor(tmuxPath: string) {
    this.tmuxPath = tmuxPath
  }

  static create(): null | TmuxMultiplexer {
    const tmuxPath = findExecutable('tmux')
    if (!tmuxPath) return null
    return new TmuxMultiplexer(tmuxPath)
  }

  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const {sessionName, reattach} = options

    if (!isNonWindowsPlatform()) {
      return {exitCode: -1, usedMux: false, reason: 'tmux not available on this platform'}
    }

    // Set default-terminal BEFORE session creation (batched into single invocation)
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
      cwd: process.cwd(),
      shellCommand,
      reattach,
    })

    return spawnAttached('tmux', args, cleanClaudeEnv(), this.backend)
  }

  isInsideSession(): boolean {
    return Boolean(process.env.TMUX)
  }

  async kill(paneId: string): Promise<void> {
    if (!paneId) return
    await execFileAsync(this.tmuxPath, ['kill-pane', '-t', paneId], {timeout: 3000})
  }

  async splitPane(options: SplitPaneOptions): Promise<SplitPaneResult> {
    const mode = options.mode ?? 'repl'
    const args = options.args ?? []
    const envVars = options.env ?? {}
    const cwd = options.cwd ?? process.cwd()

    // Resolve tool path
    const toolPath = findExecutable(options.toolName)
    if (!toolPath) {
      return {launched: false, backend: this.backend, reason: `${options.toolName} not found on PATH`}
    }

    // On Windows with tmux backend, resolve tool path from bash's perspective
    let effectiveToolPath = toolPath
    if (isWindowsPlatform()) {
      const bashPath = await resolveToolForBash(options.toolName)
      if (bashPath) {
        effectiveToolPath = bashPath
      } else {
        return {launched: false, backend: this.backend, reason: `${options.toolName} not found in bash PATH (required for tmux pane)`}
      }
    }

    // Sentinel IPC for exit code tracking
    const useSentinel = options.sentinel !== false
    const sentinel = useSentinel ? createSentinelIpcPaths(`aiwcli-pane-${options.toolName}`) : null

    // Inject COLORTERM=truecolor for tmux
    const effectiveEnvVars = {COLORTERM: 'truecolor', ...envVars}

    try {
      const promptText = mode === 'repl' && options.promptPath
        ? fs.readFileSync(options.promptPath, 'utf8')
        : undefined

      const baseCommand = buildShToolCommand({
        toolPath: effectiveToolPath,
        args,
        env: effectiveEnvVars,
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
          holdPane: Boolean(options.holdPane),
          holdMessage,
        })
      }

      // Resolve split direction
      const splitDirection = options.split ?? 'auto'
      let splitFlag: TmuxSplitFlag
      let splitTarget: string | undefined

      if (splitDirection === 'auto') {
        try {
          const resolved = await resolveAutoSplit(this.tmuxPath, options.splitTarget)
          splitFlag = resolved.splitFlag
          splitTarget = resolved.splitTarget
        } catch {
          splitFlag = '-h'
          splitTarget = options.splitTarget?.trim()
        }
      } else {
        splitFlag = splitDirection === 'v' ? '-v' : '-h'
        splitTarget = options.splitTarget?.trim()
      }

      // Build tmux split-window command
      const cwdPath = cwd ? (process.platform === 'win32' ? toMsysPosixPath(cwd) : cwd) : undefined
      const bootstrappedCommand = withWindowsTmuxBootstrap(paneCommand)
      const tmuxArgs = buildTmuxSplitWindowArgs({
        splitFlag,
        command: `bash -lc ${quoteForSh(bootstrappedCommand)}`,
        cwd: cwdPath,
        splitTarget,
      })

      const split = await execFileAsync(this.tmuxPath, tmuxArgs, {timeout: 5000})
      if (split.exitCode !== 0) {
        if (sentinel) cleanupSentinelIpc(sentinel)
        return {
          launched: false,
          backend: this.backend,
          reason: 'tmux split-window failed',
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

}
