/**
 * Main pane driver — orchestrates launching CLI tools in visible panes.
 * Renamed from template's tmux-driver.ts. Single entry point: launchDriverInTmuxOrFallback().
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  getTmuxAvailability,
  quoteForSh,
  type TmuxSplitFlag,
} from './launchers/tmux-launcher.js'
import {createPaneLauncher, type PaneBackend, type PaneSplitDirection} from './pane-launcher.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from './sentinel-ipc.js'
import {execFileAsync, findExecutable} from './subprocess-utils.js'
import {toMsysPosixPath} from './tmux-primitives.js'

/**
 * Resolve a tool path from bash's perspective.
 * Used on Windows where the tmux backend runs commands in bash,
 * but findExecutable() returns Windows paths (.cmd/.exe) that bash can't execute.
 */
async function resolveToolForBash(toolName: string): Promise<string | null> {
  const bash = findExecutable('bash')
  if (!bash) return null
  const result = await execFileAsync(bash, ['-lc', `command -v ${toolName}`], {
    timeout: 3000,
    env: {...process.env, MSYS_NO_PATHCONV: '1'},
  })
  return result.exitCode === 0 ? result.stdout.trim() || null : null
}

export type DriverMode = 'exec' | 'repl'
export type TmuxSplitOption = TmuxSplitFlag | 'auto'

export interface DriverPreflightResult {
  available: boolean
  error?: string
}

export type DriverPreflight =
  (toolPath: string) => Promise<DriverPreflightResult> | DriverPreflightResult

export interface LaunchDriverOptions {
  toolName: string
  toolBin?: string | undefined
  mode?: DriverMode | undefined
  args?: string[] | undefined
  env?: Record<string, string> | undefined
  cwd?: string | undefined
  promptPath?: string | undefined
  splitFlag?: TmuxSplitOption | undefined
  splitTarget?: string | undefined
  autoClose?: boolean | undefined
  holdPane?: boolean | undefined
  holdMessage?: string | undefined
  allowExecFallback?: boolean | undefined
  preflight?: DriverPreflight | undefined
  timeoutMs?: number | undefined
}

export interface LaunchDriverResult {
  launched: boolean
  usedTmux: boolean
  backend: PaneBackend
  mode: DriverMode
  toolPath?: string | undefined
  paneId?: string | undefined
  sentinelPath?: string | undefined
  exitCode?: number | undefined
  stdout?: string | undefined
  reason?: string | undefined
  stderr?: string | undefined
}

function buildEnvPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${quoteForSh(value)}`)
    .join(' ')
}

function quoteForPowerShell(input: string): string {
  return `'${input.replaceAll("'", "''")}'`
}

function buildCommandArgs(
  args: string[],
  mode: DriverMode,
  promptPath?: string,
): string[] {
  if (mode !== 'repl' || !promptPath) return args

  if (process.platform === 'win32') {
    const absolutePromptPath = path.resolve(promptPath)
    const bootstrap = `Read startup instructions from this file path before taking action: ${absolutePromptPath}. Use that file as the initial context.`
    return [...args, bootstrap]
  }

  const promptText = fs.readFileSync(promptPath, 'utf-8')
  return [...args, promptText]
}

function buildShToolCommand(
  toolPath: string,
  args: string[],
  env: Record<string, string>,
  mode: DriverMode,
  promptPath?: string,
): string {
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

function buildPowerShellToolCommand(
  toolPath: string,
  args: string[],
  env: Record<string, string>,
  mode: DriverMode,
  promptPath?: string,
): string {
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

function wrapPaneCommand(
  backend: PaneBackend,
  command: string,
  sentinelPath: string,
  autoClose: boolean,
  holdPane: boolean,
  holdMessage: string,
): string {
  if (backend === 'tmux') {
    // On Windows, convert sentinel path to POSIX for bash redirections.
    // MSYS2 bash maps /c/Users/.../file to C:\Users\...\file on disk,
    // so Node.js reads the same physical file via its original Windows path.
    const safePath = process.platform === 'win32'
      ? toMsysPosixPath(sentinelPath) : sentinelPath
    const base = `${command}; code=$?; printf '%s' "$code" > ${quoteForSh(safePath)}`

    if (autoClose) {
      return `${base}; tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true; exit $code`
    }

    if (holdPane) {
      return `${base}; echo; echo ${quoteForSh(holdMessage)}; exec bash`
    }

    return `${base}; exit $code`
  }

  const base = `${command}; $code = $LASTEXITCODE; Set-Content -Path ${quoteForPowerShell(sentinelPath)} -Value $code -NoNewline`

  if (holdPane && !autoClose) {
    return `${base}; Write-Host ''; Write-Host ${quoteForPowerShell(holdMessage)}; Read-Host -Prompt 'Press Enter to close' | Out-Null`
  }

  return `${base}; exit $code`
}

function mapSplitDirection(splitFlag: TmuxSplitOption | undefined): PaneSplitDirection {
  if (splitFlag === 'auto') return 'auto'
  if (splitFlag === '-v') return 'v'
  return 'h'
}

export function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function resolveToolPath(toolName: string, toolBin?: string): string | null {
  const bin = toolBin?.trim() || toolName
  return findExecutable(bin)
}

function buildCommandForBackend(
  backend: PaneBackend,
  toolPath: string,
  args: string[],
  envVars: Record<string, string>,
  mode: DriverMode,
  promptPath?: string,
): string {
  if (backend === 'tmux') {
    return buildShToolCommand(toolPath, args, envVars, mode, promptPath)
  }

  return buildPowerShellToolCommand(toolPath, args, envVars, mode, promptPath)
}

export async function launchDriverInTmuxOrFallback(
  options: LaunchDriverOptions,
): Promise<LaunchDriverResult> {
  const mode = options.mode ?? 'exec'
  const args = options.args ?? []
  const envVars = options.env ?? {}
  const timeoutMs = options.timeoutMs ?? 0
  const toolPath = resolveToolPath(options.toolName, options.toolBin)

  if (!toolPath) {
    return {
      launched: false,
      usedTmux: false,
      backend: 'exec',
      mode,
      reason: `${options.toolBin ?? options.toolName} not found on PATH`,
    }
  }

  if (options.preflight) {
    const preflight = await options.preflight(toolPath)
    if (!preflight.available) {
      return {
        launched: false,
        usedTmux: false,
        backend: 'exec',
        mode,
        toolPath,
        reason: preflight.error ?? 'driver preflight failed',
      }
    }
  }

  if (options.promptPath && !fs.existsSync(options.promptPath)) {
    return {
      launched: false,
      usedTmux: false,
      backend: 'exec',
      mode,
      toolPath,
      reason: `prompt file not found: ${options.promptPath}`,
    }
  }

  const paneLauncher = await createPaneLauncher({requireTmuxSession: true})
  if (paneLauncher) {
    // On Windows with tmux backend, resolve tool path from bash's perspective.
    // findExecutable() returns Windows paths (.cmd/.exe) that bash can't execute.
    let effectiveToolPath = toolPath
    if (process.platform === 'win32' && paneLauncher.backend === 'tmux') {
      const bashPath = await resolveToolForBash(options.toolName)
      if (bashPath) {
        effectiveToolPath = bashPath
      } else {
        return {
          launched: false,
          usedTmux: false,
          backend: paneLauncher.backend,
          mode,
          toolPath,
          reason: `${options.toolName} not found in bash PATH (required for tmux pane)`,
        }
      }
    }

    const sentinel = createSentinelIpcPaths(`aiwcli-pane-${options.toolName}`)

    // When launching via tmux, inject COLORTERM so CLI tools know truecolor is available.
    // Outside tmux, mintty sets this; tmux does not propagate it into panes.
    const effectiveEnvVars = paneLauncher.backend === 'tmux'
      ? {COLORTERM: 'truecolor', ...envVars}
      : envVars

    try {
      const baseCommand = buildCommandForBackend(
        paneLauncher.backend,
        effectiveToolPath,
        args,
        effectiveEnvVars,
        mode,
        options.promptPath,
      )

      const holdMessage = options.holdMessage ?? '[aiwcli] Driver exited. Pane held open.'
      const paneCommand = wrapPaneCommand(
        paneLauncher.backend,
        baseCommand,
        sentinel.sentinelPath,
        Boolean(options.autoClose),
        Boolean(options.holdPane) && !options.autoClose,
        holdMessage,
      )

      const paneResult = await paneLauncher.launch({
        command: paneCommand,
        splitDirection: mapSplitDirection(options.splitFlag),
        splitTarget: options.splitTarget,
        cwd: options.cwd,
      })

      if (!paneResult.launched) {
        cleanupSentinelIpc(sentinel)
        return {
          launched: false,
          usedTmux: paneLauncher.backend === 'tmux',
          backend: paneLauncher.backend,
          mode,
          toolPath,
          reason: paneResult.reason ?? 'pane launch failed',
          stderr: paneResult.stderr,
        }
      }

      return {
        launched: true,
        usedTmux: paneLauncher.backend === 'tmux',
        backend: paneLauncher.backend,
        mode,
        toolPath,
        paneId: paneResult.paneId,
        sentinelPath: sentinel.sentinelPath,
      }
    } catch (error) {
      cleanupSentinelIpc(sentinel)
      return {
        launched: false,
        usedTmux: paneLauncher.backend === 'tmux',
        backend: paneLauncher.backend,
        mode,
        toolPath,
        reason: `pane launch failed: ${String(error)}`,
      }
    }
  }

  if (options.allowExecFallback) {
    const commandArgs = buildCommandArgs(args, mode, options.promptPath)
    const input = mode === 'exec' && options.promptPath
      ? fs.readFileSync(options.promptPath, 'utf-8')
      : undefined

    const result = await execFileAsync(toolPath, commandArgs, {
      input,
      timeout: timeoutMs,
      env: {...process.env, ...envVars},
      shell: process.platform === 'win32',
    })

    return {
      launched: true,
      usedTmux: false,
      backend: 'exec',
      mode,
      toolPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      reason: result.exitCode === 0 ? undefined : `fallback exec exited ${result.exitCode}`,
    }
  }

  const tmux = getTmuxAvailability({requireSessionEnv: true})
  return {
    launched: false,
    usedTmux: false,
    backend: 'exec',
    mode,
    toolPath,
    reason: `${tmux.reason ?? 'no available pane launcher'}; fallback disabled`,
  }
}

export {getTmuxAvailability, normalizeSplitFlag, quoteForSh, type TmuxAvailability, type TmuxSplitFlag} from './launchers/tmux-launcher.js'
