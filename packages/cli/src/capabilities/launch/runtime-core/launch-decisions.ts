/**
 * Pure decision functions extracted from execute-launch.ts.
 * No side effects — all functions are deterministic string/config transforms.
 */

import path from 'node:path'

import type {LaunchResult} from '../../../platform/launch.js'
import type {
  InlineFallbackContext,
  JsonLaunchResult,
  LaunchFlags,
  SessionRequestParams,
  SplitRequestParams,
  ToolConfig,
  ToolMode,
} from '../contracts.js'
import {buildUniqueSessionName, sanitizeSessionName} from './launch-options.js'

export const QUICK_EXIT_THRESHOLD_MS = 10_000

/**
 * Return the debug message for tool mode, or undefined if none (claude has no special message).
 */
export function resolveToolModeDebugMessage(toolMode: ToolMode): string | undefined {
  if (toolMode === 'codex') return 'Launching Codex with --yolo flag'
  if (toolMode === 'devin') return 'Launching Devin with --permission-mode dangerous'
  return undefined
}

/**
 * Format version check results into debug lines and an optional warning.
 */
export function formatVersionCheckMessages(versionCheck: {
  compatible: boolean
  version?: null | string
  warning?: string
}): {debugLines: string[]; warning?: string | undefined} {
  return {
    debugLines: [
      `Claude Code version: ${versionCheck.version ?? 'unknown'}`,
      `Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`,
    ],
    ...(versionCheck.warning ? {warning: versionCheck.warning} : {}),
  }
}

/**
 * Format the success message after a split pane launch.
 */
export function formatSplitSuccessMessage(backend: string, handle?: string): string {
  if (handle) {
    return `Launched in ${backend} pane: ${handle}`
  }

  return `Launched in ${backend}`
}

/**
 * Format the info message when launching in a session.
 */
export function formatSessionLaunchMessage(backend: string, sessionName: string, reattach: boolean): string {
  if (reattach) {
    return `Launching in ${backend} session: ${sessionName} (reuse/attach)`
  }

  return `Launching in new ${backend} session: ${sessionName}`
}

function buildCodexArgs(platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return ['--yolo']
  return ['-c', 'shell_type="bash"', '--yolo']
}

function buildDevinArgs(): string[] {
  return ['--permission-mode', 'dangerous']
}

/**
 * Determine which CLI tool to launch and its configuration.
 */
export function resolveToolConfig(
  flags: Pick<LaunchFlags, 'codex' | 'devin'>,
  platform: NodeJS.Platform,
): ToolConfig {
  if (flags.devin) {
    return {
      cliCommand: 'devin',
      cliArgs: buildDevinArgs(),
      launchFlag: '--devin',
      toolMode: 'devin',
      retryOnQuickExit: true,
      needsLspPatch: false,
      skipVersionCheck: true,
    }
  }

  if (flags.codex) {
    return {
      cliCommand: 'codex',
      cliArgs: buildCodexArgs(platform),
      launchFlag: '--codex',
      toolMode: 'codex',
      retryOnQuickExit: false,
      needsLspPatch: false,
      skipVersionCheck: true,
    }
  }

  return {
    cliCommand: 'claude',
    cliArgs: ['--dangerously-skip-permissions'],
    launchFlag: '',
    toolMode: 'claude',
    retryOnQuickExit: false,
    needsLspPatch: platform === 'win32',
    skipVersionCheck: false,
  }
}

/**
 * Decide the informational message to log when falling back to inline mode.
 */
export function resolveInlineFallbackMessage(ctx: InlineFallbackContext): string {
  if (!ctx.hasMux) {
    if (ctx.disableMux) {
      return 'Multiplexer disabled via --no-tmux — launching inline'
    }

    if (!ctx.interactiveTty) {
      return 'Non-interactive terminal — launching inline'
    }

    if (ctx.platform === 'win32') {
      return 'No multiplexer found — launching inline. Run inside WezTerm or install psmux for session management.'
    }

    return 'No multiplexer found — launching inline. Install tmux for session management.'
  }

  return ctx.resolvedReason ?? 'Launching inline'
}

/**
 * Build the args array for an inline process spawn.
 * Always returns a new array — never mutates input.
 */
export function buildInlineArgs(
  cliArgs: readonly string[],
  toolMode: ToolMode,
  promptText: string | undefined,
  promptPath: string | undefined,
): string[] {
  if (toolMode === 'devin' && promptPath) {
    return [...cliArgs, '--prompt-file', promptPath]
  }

  if (promptText) {
    return [...cliArgs, promptText]
  }

  return [...cliArgs]
}

/**
 * Build split pane parameters.
 * Returns a new toolArgs array — fixes the cliArgs mutation bug.
 */
export function buildSplitRequest(params: {
  cliArgs: readonly string[]
  cwd: string
  effectivePromptPath: string | undefined
  extraEnv: Record<string, string>
  retryOnQuickExit: boolean
  sentinelPath: string
  split: 'auto' | 'horizontal' | 'vertical'
  toolMode: ToolMode
}): SplitRequestParams {
  let toolArgs: string[]
  let splitPromptPath: string | undefined

  if (params.toolMode === 'devin' && params.effectivePromptPath) {
    toolArgs = [...params.cliArgs, '--prompt-file', params.effectivePromptPath]
    splitPromptPath = undefined
  } else {
    toolArgs = [...params.cliArgs]
    splitPromptPath = params.effectivePromptPath
  }

  return {
    toolArgs,
    splitPromptPath,
    env: params.extraEnv,
    cwd: params.cwd,
    mode: 'repl',
    split: params.split,
    sentinelPath: params.sentinelPath,
    holdPane: false,
    retryOnQuickExit: params.retryOnQuickExit,
  }
}

/**
 * Build session creation parameters.
 */
export function buildSessionRequest(params: {
  cliArgs: readonly string[]
  cwd: string
  now: number
  pid: number
  promptPath: string | undefined
  promptText: string | undefined
  tmuxSessionFlag: string | undefined
  toolMode: ToolMode
}): SessionRequestParams {
  const sessionFromFlag = params.tmuxSessionFlag?.trim()
  const reattach = Boolean(sessionFromFlag && sessionFromFlag.length > 0)
  const sessionName = reattach
    ? sanitizeSessionName(sessionFromFlag!)
    : buildUniqueSessionName(`aiw-${path.basename(params.cwd)}`, params.now, params.pid)

  const toolArgs = params.toolMode === 'devin' && params.promptPath
    ? [...params.cliArgs, '--prompt-file', params.promptPath]
    : [...params.cliArgs]

  const promptText = params.toolMode === 'devin' ? undefined : params.promptText

  return {sessionName, reattach, toolArgs, promptText}
}

/**
 * Decide warning message when session creation fails and we fall back inline.
 */
export function resolveSessionFallbackWarning(backend: string, reason: string | undefined): string {
  if (!reason) return 'Session creation failed — launching inline'

  if (reason.includes('not found') || reason.includes('unavailable')) {
    const hint = backend === 'psmux' ? ' Install with: winget install psmux' : ''
    return `${backend} unavailable — launching inline.${hint}`
  }

  if (reason.includes('too old')) {
    const hint = backend === 'psmux' ? ' Update with: winget upgrade psmux' : ''
    return `${reason} — launching inline.${hint}`
  }

  if (backend === 'psmux' && reason.includes('attach failed')) {
    return `${reason} — launching inline. Recovery: run "psmux kill-server" and relaunch if this persists.`
  }

  return `${reason} — launching inline`
}

/**
 * Pure timing decision for retry logic.
 */
export function shouldRetry(elapsedMs: number, threshold = QUICK_EXIT_THRESHOLD_MS): boolean {
  return elapsedMs < threshold
}

/**
 * Convert a LaunchResult to JSON-serializable form.
 */
export function toJsonLaunchResult(result: LaunchResult, exitCode: null | number): JsonLaunchResult {
  return {
    launched: result.launched,
    backend: result.backend,
    handle: result.handle ?? null,
    sentinelPath: result.sentinelPath ?? null,
    exitCode,
    reason: result.reason ?? null,
  }
}
