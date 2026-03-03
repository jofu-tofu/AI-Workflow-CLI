/**
 * Main pane driver — orchestrates launching CLI tools in visible panes.
 * Renamed from template's tmux-driver.ts. Single entry point: launchDriverInTmuxOrFallback().
 */

import * as fs from 'node:fs'
import path from 'node:path'

import {
  getTmuxAvailability,
  quoteForSh,
  type TmuxSplitFlag,
} from './launchers/tmux-launcher.js'
import {createPaneLauncher, type PaneBackend, type PaneSplitDirection} from './pane-launcher.js'
import {applyTmuxLaunchEnv, isWindowsPlatform, shouldUseShell} from './runtime/platform-adapter.js'
import {cleanupSentinelIpc, createSentinelIpcPaths} from './runtime/sentinel-ipc.js'
import {execFileAsync, findExecutable} from './runtime/subprocess-utils.js'
import {preflightWindowsTmux, type WindowsTmuxPreflight} from './runtime/tmux-preflight.js'
import {toMsysPosixPath} from './tmux-primitives.js'

/**
 * Resolve a tool path from bash's perspective.
 * Used on Windows where the tmux backend runs commands in bash,
 * but findExecutable() returns Windows paths (.cmd/.exe) that bash can't execute.
 */
async function resolveToolForBash(toolName: string): Promise<null | string> {
  const bash = findExecutable('bash')
  if (!bash) return null
  const result = await execFileAsync(bash, ['-lc', `command -v ${toolName}`], {
    timeout: 3000,
    env: {...process.env, MSYS_NO_PATHCONV: '1'},
  })
  return result.exitCode === 0 ? result.stdout.trim() || null : null
}

export type DriverMode = 'exec' | 'repl'
export type TmuxSplitOption = 'auto' | TmuxSplitFlag

export interface DriverPreflightResult {
  available: boolean
  error?: string
}

export type DriverPreflight =
  (toolPath: string) => DriverPreflightResult | Promise<DriverPreflightResult>

export interface LaunchDriverOptions {
  allowExecFallback?: boolean | undefined
  args?: string[] | undefined
  autoClose?: boolean | undefined
  cwd?: string | undefined
  env?: Record<string, string> | undefined
  holdMessage?: string | undefined
  holdPane?: boolean | undefined
  mode?: DriverMode | undefined
  preflight?: DriverPreflight | undefined
  promptPath?: string | undefined
  splitFlag?: TmuxSplitOption | undefined
  splitTarget?: string | undefined
  timeoutMs?: number | undefined
  toolBin?: string | undefined
  toolName: string
}

export interface LaunchDriverResult {
  backend: PaneBackend
  exitCode?: number | undefined
  launched: boolean
  mode: DriverMode
  paneId?: string | undefined
  reason?: string | undefined
  sentinelPath?: string | undefined
  stderr?: string | undefined
  stdout?: string | undefined
  toolPath?: string | undefined
  usedTmux: boolean
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

  if (isWindowsPlatform()) {
    const absolutePromptPath = path.resolve(promptPath)
    const bootstrap = `Read startup instructions from this file path before taking action: ${absolutePromptPath}. Use that file as the initial context.`
    return [...args, bootstrap]
  }

  const promptText = fs.readFileSync(promptPath, 'utf8')
  return [...args, promptText]
}

function buildShToolCommand(params: {
  toolPath: string;
  args: string[];
  env: Record<string, string>;
  mode: DriverMode;
  promptPath?: string;
}): string {
  const { toolPath, args, env, mode, promptPath } = params
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

function buildPowerShellToolCommand(params: {
  toolPath: string;
  args: string[];
  env: Record<string, string>;
  mode: DriverMode;
  promptPath?: string;
}): string {
  const { toolPath, args, env, mode, promptPath } = params
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

function wrapPaneCommand(params: {
  backend: PaneBackend;
  command: string;
  sentinelPath: string;
  autoClose: boolean;
  holdPane: boolean;
  holdMessage: string;
}): string {
  const { backend, command, sentinelPath, autoClose, holdPane, holdMessage } = params
  if (backend === 'tmux') {
    // On Windows, convert sentinel path to POSIX for bash redirections.
    // MSYS2 bash maps /c/Users/.../file to C:\Users\...\file on disk,
    // so Node.js reads the same physical file via its original Windows path.
    const safePath = isWindowsPlatform()
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

export function resolveToolPath(toolName: string, toolBin?: string): null | string {
  const bin = toolBin?.trim() || toolName
  return findExecutable(bin)
}

export function buildTmuxLaunchEnv(
  envVars: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  return applyTmuxLaunchEnv(envVars, platform)
}

export function getWindowsTmuxPreflightFailureReason(
  backend: PaneBackend,
  platform: NodeJS.Platform = process.platform,
  preflight: () => WindowsTmuxPreflight = preflightWindowsTmux,
): null | string {
  if (backend !== 'tmux' || !isWindowsPlatform(platform)) return null
  const result = preflight()
  if (result.available) return null
  return result.reason ?? 'Windows tmux preflight failed'
}

export function withWindowsTmuxWinpty(
  command: string,
  backend: PaneBackend,
  platform: NodeJS.Platform = process.platform,
): string {
  if (backend !== 'tmux' || !isWindowsPlatform(platform)) return command
  return `winpty bash -lc ${quoteForSh(command)}`
}

function buildCommandForBackend(params: {
  backend: PaneBackend;
  toolPath: string;
  args: string[];
  envVars: Record<string, string>;
  mode: DriverMode;
  promptPath?: string;
}): string {
  const { backend, toolPath, args, envVars, mode, promptPath } = params
  if (backend === 'tmux') {
    return buildShToolCommand({ toolPath, args, env: envVars, mode, promptPath })
  }

  return buildPowerShellToolCommand({ toolPath, args, env: envVars, mode, promptPath })
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
    const windowsTmuxPreflightError = getWindowsTmuxPreflightFailureReason(paneLauncher.backend)
    if (windowsTmuxPreflightError) {
      return {
        launched: false,
        usedTmux: false,
        backend: paneLauncher.backend,
        mode,
        toolPath,
        reason: windowsTmuxPreflightError,
      }
    }

    // On Windows with tmux backend, resolve tool path from bash's perspective.
    // findExecutable() returns Windows paths (.cmd/.exe) that bash can't execute.
    let effectiveToolPath = toolPath
    if (isWindowsPlatform() && paneLauncher.backend === 'tmux') {
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

    // Tmux does not always propagate COLORTERM into panes.
    // On winpty, avoid advertising truecolor because it causes palette corruption.
    const effectiveEnvVars = paneLauncher.backend === 'tmux'
      ? buildTmuxLaunchEnv(envVars)
      : envVars

    try {
      const baseCommand = buildCommandForBackend({
        backend: paneLauncher.backend,
        toolPath: effectiveToolPath,
        args,
        envVars: effectiveEnvVars,
        mode,
        promptPath: options.promptPath,
      })
      const effectiveBaseCommand = withWindowsTmuxWinpty(baseCommand, paneLauncher.backend)

      const holdMessage = options.holdMessage ?? '[aiwcli] Driver exited. Pane held open.'
      const paneCommand = wrapPaneCommand({
        backend: paneLauncher.backend,
        command: effectiveBaseCommand,
        sentinelPath: sentinel.sentinelPath,
        autoClose: Boolean(options.autoClose),
        holdPane: Boolean(options.holdPane) && !options.autoClose,
        holdMessage,
      })

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
      ? fs.readFileSync(options.promptPath, 'utf8')
      : undefined

    const result = await execFileAsync(toolPath, commandArgs, {
      input,
      timeout: timeoutMs,
      env: {...process.env, ...envVars},
      shell: shouldUseShell(),
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

