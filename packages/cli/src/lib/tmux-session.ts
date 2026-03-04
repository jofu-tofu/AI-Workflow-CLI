import {type ChildProcess, execFileSync, execSync, spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {resolveExecutable} from './runtime/executable-policy.js'
import {
  isNonWindowsPlatform,
  isWindowsPlatform,
  resolveTmuxColorModeForPlatform,
} from './runtime/platform-adapter.js'
import {isNativeTmuxAvailable, preflightWindowsTmux} from './runtime/tmux-preflight.js'
import {quoteForSh, TMUX_SOCKET_PATH, toMsysPosixPath} from './tmux-primitives.js'

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

export interface TmuxSessionResult {
  exitCode: number
  reason?: string
  usedTmux: boolean
}

export type TmuxColorMode = 'c256' | 'truecolor'

function windowsTerminalOverrides(colorMode: TmuxColorMode): string {
  // Keep cursor-shape stability overrides on Windows tmux+winpty, but avoid
  // disabling mouse reporting so tmux can preserve native wheel/copy behavior.
  const stabilityOverrides = '*:Ss@,*:Se@,*:Cs@,*:Cr@'
  if (colorMode === 'truecolor') {
    return `,xterm*:Tc,alacritty:Tc,${stabilityOverrides}`
  }

  return `,${stabilityOverrides}`
}

export function buildTmuxRuntimeBootstrapCommands(
  platform: NodeJS.Platform = process.platform,
  enableMouse = true,
): string[] {
  const colorMode = resolveTmuxColorMode(platform)
  const commands: string[] = []

  if (enableMouse) {
    commands.push('tmux set-option -g mouse on >/dev/null 2>&1 || true')
  }

  // Increase scrollback buffer from default 2000
  commands.push('tmux set-option -g history-limit 50000 >/dev/null 2>&1 || true')
  if (isWindowsPlatform(platform)) {
    commands.push('tmux set-option -g focus-events off >/dev/null 2>&1 || true')
    // Cleanup legacy AIW mouse wheel binds from prior versions.
    commands.push('tmux unbind -n WheelUpPane >/dev/null 2>&1 || true')
    commands.push('tmux unbind -n WheelDownPane >/dev/null 2>&1 || true')
  }

  // Configure terminal overrides for the active color mode.
  // Note: default-terminal is set before session creation.
  if (isWindowsPlatform(platform)) {
    // Reset then apply overrides to scrub stale kmous@ from older AIW runs.
    commands.push('tmux set -gu terminal-overrides >/dev/null 2>&1 || true')
    commands.push(`tmux set -g terminal-overrides "${windowsTerminalOverrides(colorMode)}" >/dev/null 2>&1 || true`)
  } else {
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

/** Spawn a process and return a promise that resolves when it exits. */
function spawnAttached(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<TmuxSessionResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, {stdio: 'inherit', env: env ?? process.env})
    } catch (error) {
      resolve({exitCode: -1, usedTmux: false, reason: error instanceof Error ? error.message : String(error)})
      return
    }

    child.on('error', (error) => {
      resolve({exitCode: -1, usedTmux: false, reason: error.message})
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({exitCode: 0, usedTmux: true})
      } else {
        resolve({exitCode: code ?? 1, usedTmux: false, reason: `tmux exited with code ${code ?? 1}`})
      }
    })
  })
}

/** Build the shell command string from structured options. */
export function buildShellCommand(opts: TmuxSessionOptions): string {
  const {toolPath, toolArgs, promptText, enableMouse = true, platform = process.platform} = opts
  const colorMode = resolveTmuxColorMode(platform)
  const parts = buildTmuxRuntimeBootstrapCommands(platform, enableMouse)

  const cmdParts: string[] = []

  // On Windows, convert tool path to POSIX for MSYS2 bash
  const effectivePath = isWindowsPlatform(platform)
    ? toMsysPosixPath(toolPath)
    : toolPath
  cmdParts.push(quoteForSh(effectivePath))

  for (const arg of toolArgs) {
    cmdParts.push(quoteForSh(arg))
  }

  // Deliver prompt via temp file — avoids nested bash→tmux→sh quoting
  if (promptText) {
    const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
    writeFileSync(tmpFile, promptText, {encoding: 'utf8', mode: 0o600})
    const posixTmpFile = isWindowsPlatform(platform) ? toMsysPosixPath(tmpFile) : tmpFile
    const bootstrap = `Read startup instructions from this file path before taking action: ${posixTmpFile}. Use that file as the initial context.`
    cmdParts.push(quoteForSh(bootstrap))
  }

  // Export COLORTERM only when truecolor is intentionally enabled.
  if (colorMode === 'truecolor') {
    parts.push('export COLORTERM=truecolor')
  } else {
    parts.push('unset COLORTERM')
  }

  // On Windows, use winpty to bridge MSYS2 pty (tmux) to ConPTY (native Windows TUI).
  // winpty cannot execute shell scripts (npm shims like 'codex', 'claude' are #!/bin/sh
  // wrappers). Wrap in `bash -c` so winpty launches bash.exe (a real binary), which
  // then runs the shell script that execs into node.exe.
  if (isWindowsPlatform(platform)) {
    const innerCmd = cmdParts.join(' ')
    parts.push(`exec winpty bash -c ${quoteForSh(innerCmd)}`)
  } else {
    parts.push(`exec ${cmdParts.join(' ')}`)
  }

  return parts.join('; ')
}

/**
 * Return env with Claude Code nesting-detection vars removed.
 *  Without this, Claude Code refuses to start inside tmux ("cannot launch
 *  claude within claude") because it inherits CLAUDECODE from the parent.
 *  Mirrors cleanTerminalEnv() in terminal.ts.
 */
function cleanTmuxEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = {...process.env, ...extra}
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_ENTRYPOINT']
  return env
}

/**
 * Launch an interactive tmux session. Works on Unix (native tmux) and
 * Windows (Git Bash tmux). Never throws — all failures return `{usedTmux: false}`.
 */
export async function launchInTmuxSession(options: TmuxSessionOptions): Promise<TmuxSessionResult> {
  const {sessionName, reattach} = options
  const shellCommand = buildShellCommand(options)

  // Strategy 1: Native tmux on PATH (Unix only — on Windows, MSYS2 tmux.exe
  // appears on PATH but can't run outside a bash/MSYS2 environment)
  if (isNonWindowsPlatform() && isNativeTmuxAvailable()) {
    // Set default-terminal BEFORE creating the session so the first pane inherits
    // the correct TERM. Setting it inside buildShellCommand() is too late — TERM is
    // assigned at pane creation time, so the pane would get tmux's compile-time default.
    try {
      execSync('tmux start-server', {stdio: 'ignore', timeout: 3000})
      try {
        execSync('tmux set -g default-terminal "tmux-256color"', {stdio: 'ignore', timeout: 3000})
      } catch {
        execSync('tmux set -g default-terminal "screen-256color"', {stdio: 'ignore', timeout: 3000})
      }
    } catch { /* best-effort — session creation will still work */ }

    const args = ['new-session']
    if (reattach) args.push('-A')
    args.push('-c', process.cwd(), '-s', sessionName, shellCommand)
    return spawnAttached('tmux', args, cleanTmuxEnv())
  }

  // Strategy 2: Git Bash tmux (Windows)
  if (isWindowsPlatform()) {
    const preflight = preflightWindowsTmux()
    if (!preflight.available || !preflight.bashPath) {
      return {exitCode: -1, usedTmux: false, reason: preflight.reason ?? 'Windows tmux preflight failed'}
    }

    const {bashPath} = preflight

    // Set default-terminal BEFORE creating the session so the first pane inherits
    // the correct TERM (assigned at pane creation time, not after).
    const posixSocket = toMsysPosixPath(TMUX_SOCKET_PATH)
    try {
      execFileSync(bashPath, ['-lc', `tmux -S ${quoteForSh(posixSocket)} start-server`], {
        stdio: 'ignore', timeout: 3000,
        env: {...process.env, MSYS_NO_PATHCONV: '1'}, windowsHide: true,
      })
      try {
        execFileSync(bashPath, ['-lc', `tmux -S ${quoteForSh(posixSocket)} set -g default-terminal 'tmux-256color'`], {
          stdio: 'ignore', timeout: 3000,
          env: {...process.env, MSYS_NO_PATHCONV: '1'}, windowsHide: true,
        })
      } catch {
        try {
          execFileSync(bashPath, ['-lc', `tmux -S ${quoteForSh(posixSocket)} set -g default-terminal 'screen-256color'`], {
            stdio: 'ignore', timeout: 3000,
            env: {...process.env, MSYS_NO_PATHCONV: '1'}, windowsHide: true,
          })
        } catch { /* best-effort */ }
      }
    } catch { /* best-effort — session creation will still work */ }

    // ANTI-PATTERN: Do not use bash positional params ($1, $2, $3) to pass shell
    // commands to tmux on MSYS2. Quoting does not survive the bash→exec→tmux→sh
    // chain. Instead, build a single bash string with per-arg quoteForSh().
    const posixCwd = toMsysPosixPath(process.cwd())
    const tmuxArgs = ['-S', posixSocket, 'new-session']
    if (reattach) tmuxArgs.push('-A')
    tmuxArgs.push('-c', posixCwd, '-s', sessionName, shellCommand)
    const tmuxCmd = `exec tmux ${tmuxArgs.map((arg) => quoteForSh(arg)).join(' ')}`

    return spawnAttached(bashPath, ['-lc', tmuxCmd], cleanTmuxEnv({MSYS_NO_PATHCONV: '1'}))
  }

  // No tmux available
  return {exitCode: -1, usedTmux: false, reason: 'tmux not found'}
}

/** Best-effort enable tmux mouse support in the current session. */
export function enableTmuxMouse(): void {
  try {
    if (isNonWindowsPlatform()) {
      execSync('tmux set-option -g mouse on', {stdio: 'ignore', timeout: 3000})
      execSync('tmux set-option -g history-limit 50000', {stdio: 'ignore', timeout: 3000})
      return
    }

    const preflight = preflightWindowsTmux()
    const {bashPath} = preflight
    if (!preflight.available || !bashPath) return

    const winOpts = {
      stdio: 'ignore' as const,
      timeout: 3000,
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
      windowsHide: true,
    }
    // When already inside tmux, target the active server via TMUX env.
    // Fallback to AIW's fixed socket when no active session is present.
    const tmuxPrefix = process.env.TMUX
      ? 'tmux'
      : `tmux -S ${quoteForSh(toMsysPosixPath(TMUX_SOCKET_PATH))}`

    execFileSync(bashPath, ['-lc', `${tmuxPrefix} set-option -g mouse on`], winOpts)
    execFileSync(bashPath, ['-lc', `${tmuxPrefix} set-option -g history-limit 50000`], winOpts)
    execFileSync(bashPath, ['-lc', `${tmuxPrefix} set-option -g focus-events off`], winOpts)
    execFileSync(bashPath, ['-lc', `${tmuxPrefix} unbind -n WheelUpPane`], winOpts)
    execFileSync(bashPath, ['-lc', `${tmuxPrefix} unbind -n WheelDownPane`], winOpts)

    // Keep Windows terminal stability overrides while preserving mouse reporting.
    execFileSync(bashPath, ['-lc', `${tmuxPrefix} set -gu terminal-overrides`], winOpts)
    execFileSync(
      bashPath,
      ['-lc', `${tmuxPrefix} set -g terminal-overrides '${windowsTerminalOverrides('c256')}'`],
      winOpts,
    )
  } catch {
    // Best-effort — ignore failures
  }
}

/**
 * Best-effort enable 256-color and truecolor support in the current tmux session.
 *  Uses session-scoped settings (no -g) to avoid affecting other sessions.
 */
export function enableTmuxColors(): void {
  const colorMode = resolveTmuxColorMode()
  const baseOpts = {stdio: 'ignore' as const, timeout: 3000}
  try {
    if (isNonWindowsPlatform()) {
      try {
        execSync('tmux set default-terminal "tmux-256color"', baseOpts)
      } catch {
        execSync('tmux set default-terminal "screen-256color"', baseOpts)
      }

      execSync('tmux set -a terminal-overrides ",xterm*:Tc,alacritty:Tc"', baseOpts)
      return
    }

    const preflight = preflightWindowsTmux()
    const {bashPath} = preflight
    if (!preflight.available || !bashPath) return

    const winOpts = {
      ...baseOpts,
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
      windowsHide: true,
    }
    // When already inside tmux, target the active server via TMUX env.
    // Fallback to AIW's fixed socket when no active session is present.
    const tmuxPrefix = process.env.TMUX
      ? 'tmux'
      : `tmux -S ${quoteForSh(toMsysPosixPath(TMUX_SOCKET_PATH))}`

    try {
      execFileSync(bashPath, ['-lc', `${tmuxPrefix} set default-terminal 'tmux-256color'`], winOpts)
    } catch {
      try {
        execFileSync(bashPath, ['-lc', `${tmuxPrefix} set default-terminal 'screen-256color'`], winOpts)
      } catch { /* best-effort */ }
    }

    // Separate try/catch so terminal-overrides failure doesn't suppress default-terminal success
    try {
      const override = windowsTerminalOverrides(colorMode)
      execFileSync(bashPath, ['-lc', `${tmuxPrefix} set -gu terminal-overrides`], winOpts)
      execFileSync(bashPath, ['-lc', `${tmuxPrefix} set -g terminal-overrides '${override}'`], winOpts)
    } catch { /* best-effort */ }
  } catch {
    // Best-effort — ignore failures
  }
}


