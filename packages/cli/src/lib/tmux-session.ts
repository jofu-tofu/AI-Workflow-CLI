import {execSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {resolveExecutable} from './runtime/executable-policy.js'
import {
  isNonWindowsPlatform,
  resolveTmuxColorModeForPlatform,
} from './runtime/platform-adapter.js'
import {quoteForSh} from './tmux-primitives.js'

export interface TmuxSessionOptions {
  /** Prepend tmux mouse enable command (default true). */
  enableMouse?: boolean
  /** Platform override for deterministic tests. */
  platform?: NodeJS.Platform | undefined
  /** Optional prompt text to deliver as a positional arg via temp file. */
  promptText?: string | undefined
  reattach?: boolean
  sessionName: string
  /** CLI args (e.g. ['--dangerously-skip-permissions']). */
  toolArgs: string[]
  /** Absolute path to tool binary (or bare command name on Unix). */
  toolPath: string
}

export type TmuxColorMode = 'c256' | 'truecolor'

export function buildTmuxRuntimeBootstrapCommands(
  platform: NodeJS.Platform = process.platform,
  enableMouse = true,
): string[] {
  const commands: string[] = []

  if (enableMouse) {
    commands.push('tmux set-option -g mouse on >/dev/null 2>&1 || true')
  }

  // Increase scrollback buffer from default 2000
  commands.push('tmux set-option -g history-limit 50000 >/dev/null 2>&1 || true')

  // Configure terminal overrides for truecolor on Unix.
  // Note: default-terminal is set before session creation.
  // Windows uses psmux (native ConPTY) which handles color/cursor natively.
  if (isNonWindowsPlatform(platform)) {
    commands.push('tmux set -a terminal-overrides ",xterm*:Tc,alacritty:Tc" >/dev/null 2>&1 || true')
  }

  return commands
}

/** Color mode policy for tmux-launched sessions. */
export function resolveTmuxColorMode(platform: NodeJS.Platform = process.platform): TmuxColorMode {
  return resolveTmuxColorModeForPlatform(platform)
}

/**
 * Resolve the absolute path to a tool binary (e.g. 'claude', 'codex').
 *  On Windows prefers .exe, then extensionless, then .cmd.
 *  Returns null when the tool is not on PATH.
 */
export function findToolPath(name: string): null | string {
  return resolveExecutable(name, {windowsProfile: 'exeThenExtensionlessThenCmd'})
}

/** Build the shell command string from structured options. */
export function buildShellCommand(opts: TmuxSessionOptions): string {
  const {toolPath, toolArgs, promptText, enableMouse = true, platform = process.platform} = opts
  const colorMode = resolveTmuxColorMode(platform)
  const parts = buildTmuxRuntimeBootstrapCommands(platform, enableMouse)

  const cmdParts: string[] = []
  cmdParts.push(quoteForSh(toolPath))

  for (const arg of toolArgs) {
    cmdParts.push(quoteForSh(arg))
  }

  // Deliver prompt via temp file — avoids nested bash→tmux→sh quoting
  if (promptText) {
    const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
    writeFileSync(tmpFile, promptText, {encoding: 'utf8', mode: 0o600})
    const bootstrap = `Read startup instructions from this file path before taking action: ${tmpFile}. Use that file as the initial context.`
    cmdParts.push(quoteForSh(bootstrap))
  }

  // Export COLORTERM only when truecolor is intentionally enabled.
  if (colorMode === 'truecolor') {
    parts.push('export COLORTERM=truecolor')
  } else {
    parts.push('unset COLORTERM')
  }

  parts.push(`exec ${cmdParts.join(' ')}`)

  return parts.join('; ')
}

/** Best-effort enable tmux mouse support in the current session (Unix only). */
export function enableTmuxMouse(): void {
  try {
    if (isNonWindowsPlatform()) {
      execSync('tmux set-option -g mouse on', {stdio: 'ignore', timeout: 3000})
      execSync('tmux set-option -g history-limit 50000', {stdio: 'ignore', timeout: 3000})
    }
    // Windows uses psmux — mouse/scrollback handled natively by ConPTY.
  } catch {
    // Best-effort — ignore failures
  }
}

/**
 * Best-effort enable 256-color and truecolor support in the current tmux session (Unix only).
 * Windows uses psmux — color handled natively by ConPTY.
 */
export function enableTmuxColors(): void {
  const baseOpts = {stdio: 'ignore' as const, timeout: 3000}
  try {
    if (isNonWindowsPlatform()) {
      try {
        execSync('tmux set default-terminal "tmux-256color"', baseOpts)
      } catch {
        execSync('tmux set default-terminal "screen-256color"', baseOpts)
      }

      execSync('tmux set -a terminal-overrides ",xterm*:Tc,alacritty:Tc"', baseOpts)
    }
  } catch {
    // Best-effort — ignore failures
  }
}


