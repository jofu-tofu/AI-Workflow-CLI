/**
 * TmuxMultiplexer — unified tmux backend.
 * Consolidates TmuxLauncher + launchInTmuxSession + command building from pane-driver.
 */

import {type ChildProcess, execSync, spawn} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import type {
  CreateSessionOptions,
  CreateSessionResult,
  Multiplexer,
  SplitPaneOptions,
  SplitPaneResult,
} from '../multiplexer.js'
import {
  isNonWindowsPlatform,
  isWindowsPlatform,
} from '../runtime/platform-adapter.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from '../runtime/sentinel-ipc.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {isNativeTmuxAvailable} from '../runtime/tmux-preflight.js'
import {findBestSplit, listPanes} from '../tmux-pane-placement.js'
import {quoteForSh, toMsysPosixPath} from '../tmux-primitives.js'
import {buildShellCommand, buildTmuxRuntimeBootstrapCommands} from '../tmux-session.js'

type TmuxSplitFlag = '-h' | '-v'

function getLastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.at(-1) ?? ''
}

function buildEnvPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${quoteForSh(value)}`)
    .join(' ')
}

function buildShToolCommand(params: {
  args: string[];
  env: Record<string, string>;
  mode: 'exec' | 'repl';
  promptPath?: string;
  toolPath: string;
}): string {
  const {toolPath, args, env, mode, promptPath} = params
  const envPrefix = buildEnvPrefix(env)
  const commandArgs = buildCommandArgs(args, mode, promptPath)
  const argPart = commandArgs.map((arg) => quoteForSh(arg)).join(' ')
  const base = [envPrefix, quoteForSh(toolPath), argPart]
    .filter(Boolean)
    .join(' ')

  if (mode === 'exec' && promptPath) {
    return `${base} < ${quoteForSh(promptPath)}`
  }

  return base
}

function buildCommandArgs(
  args: string[],
  mode: 'exec' | 'repl',
  promptPath?: string,
): string[] {
  if (mode !== 'repl' || !promptPath) return args
  const promptText = fs.readFileSync(promptPath, 'utf8')
  return [...args, promptText]
}

function wrapSentinelCommand(params: {
  autoClose: boolean;
  command: string;
  holdMessage: string;
  holdPane: boolean;
  sentinelPath: string;
}): string {
  const {command, sentinelPath, autoClose, holdPane, holdMessage} = params
  const base = `${command}; code=$?; printf '%s' "$code" > ${quoteForSh(sentinelPath)}`

  if (autoClose) {
    return `${base}; tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true; exit $code`
  }

  if (holdPane) {
    return `${base}; echo; echo ${quoteForSh(holdMessage)}; exec bash`
  }

  return `${base}; exit $code`
}

function withWindowsTmuxBootstrap(command: string): string {
  if (process.platform !== 'win32') return command
  const bootstrap = buildTmuxRuntimeBootstrapCommands(process.platform).join('; ')
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
          const CELL_ASPECT_RATIO = 2
          return {
            splitFlag: width >= height * CELL_ASPECT_RATIO ? '-h' : '-v',
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

function cleanTmuxEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = {...process.env, ...extra}
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_ENTRYPOINT']
  return env
}

function spawnAttached(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<CreateSessionResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, {stdio: 'inherit', env: env ?? process.env})
    } catch (error) {
      resolve({exitCode: -1, usedMux: false, reason: error instanceof Error ? error.message : String(error)})
      return
    }

    child.on('error', (error) => {
      resolve({exitCode: -1, usedMux: false, reason: error.message})
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({exitCode: 0, usedMux: true})
      } else {
        resolve({exitCode: code ?? 1, usedMux: false, reason: `tmux exited with code ${code ?? 1}`})
      }
    })
  })
}

export class TmuxMultiplexer implements Multiplexer {
  readonly backend = 'tmux' as const
  private readonly tmuxPath: string

  private constructor(tmuxPath: string) {
    this.tmuxPath = tmuxPath
  }

  static create(): TmuxMultiplexer | null {
    const tmuxPath = findExecutable('tmux')
    if (!tmuxPath) return null
    return new TmuxMultiplexer(tmuxPath)
  }

  isInsideSession(): boolean {
    return Boolean(process.env.TMUX)
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
      const baseCommand = buildShToolCommand({
        toolPath: effectiveToolPath,
        args,
        env: effectiveEnvVars,
        mode,
        ...(options.promptPath ? {promptPath: options.promptPath} : {}),
      })

      let paneCommand = baseCommand
      if (sentinel) {
        const holdMessage = options.holdMessage ?? '[aiwcli] Driver exited. Pane held open.'
        paneCommand = wrapSentinelCommand({
          command: baseCommand,
          sentinelPath: sentinel.sentinelPath,
          autoClose: Boolean(options.autoClose),
          holdPane: Boolean(options.holdPane) && !options.autoClose,
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
      const tmuxArgs = ['split-window', splitFlag, '-P', '-F', '#{pane_id}']
      if (cwd) {
        const cwdPath = process.platform === 'win32' ? toMsysPosixPath(cwd) : cwd
        tmuxArgs.push('-c', cwdPath)
      }

      if (splitTarget) tmuxArgs.push('-t', splitTarget)
      const bootstrappedCommand = withWindowsTmuxBootstrap(paneCommand)
      tmuxArgs.push(`bash -lc ${quoteForSh(bootstrappedCommand)}`)

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

  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const {sessionName, reattach} = options

    if (!isNonWindowsPlatform() || !isNativeTmuxAvailable()) {
      return {exitCode: -1, usedMux: false, reason: 'tmux not available'}
    }

    // Set default-terminal BEFORE session creation
    try {
      execSync('tmux start-server', {stdio: 'ignore', timeout: 3000})
      try {
        execSync('tmux set -g default-terminal "tmux-256color"', {stdio: 'ignore', timeout: 3000})
      } catch {
        execSync('tmux set -g default-terminal "screen-256color"', {stdio: 'ignore', timeout: 3000})
      }
    } catch { /* best-effort */ }

    const shellCommand = buildShellCommand({
      sessionName,
      toolPath: options.toolPath,
      toolArgs: options.toolArgs,
      promptText: options.promptText,
      enableMouse: options.enableMouse ?? true,
    })

    const args = ['new-session']
    if (reattach) args.push('-A')
    args.push('-c', process.cwd(), '-s', sessionName, shellCommand)

    return spawnAttached('tmux', args, cleanTmuxEnv())
  }

  async kill(paneId: string): Promise<void> {
    if (!paneId) return
    await execFileAsync(this.tmuxPath, ['kill-pane', '-t', paneId], {timeout: 3000})
  }
}
