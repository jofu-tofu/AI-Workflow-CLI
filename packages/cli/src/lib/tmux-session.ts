import {execFileSync, execSync, type ChildProcess, spawn} from 'node:child_process'
import {existsSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {TMUX_SOCKET_PATH, quoteForSh, toMsysPosixPath} from './tmux-primitives.js'

export interface TmuxSessionOptions {
  sessionName: string
  reattach?: boolean
  /** Absolute path to tool binary (or bare command name on Unix). */
  toolPath: string
  /** CLI args (e.g. ['--dangerously-skip-permissions']). */
  toolArgs: string[]
  /** Optional prompt text to deliver as a positional arg via temp file. */
  promptText?: string | undefined
  /** Prepend tmux mouse enable command (default true). */
  enableMouse?: boolean
}

export interface TmuxSessionResult {
  exitCode: number
  usedTmux: boolean
  reason?: string
}

/** Resolve the absolute path to a tool binary (e.g. 'claude', 'codex').
 *  On Windows prefers .exe, then extensionless, then .cmd.
 *  Returns null when the tool is not on PATH. */
export function findToolPath(name: string): string | null {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`where.exe ${name}`, {encoding: 'utf8', timeout: 3000, windowsHide: true})
      const lines = output.split(/\r?\n/u).map(l => l.trim()).filter(Boolean)
      return lines.find(l => /\.exe$/iu.test(l))
        ?? lines.find(l => !/\.(cmd|ps1)$/iu.test(l))
        ?? lines.find(l => /\.cmd$/iu.test(l))
        ?? null
    }

    const output = execSync(`which ${name}`, {encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe']})
    return output.trim().split('\n')[0]?.trim() ?? null
  } catch {
    return null
  }
}

/** Find a Git Bash / MSYS2 bash.exe on Windows, filtering out WSL/Cygwin. */
function findMsysBash(): string | null {
  // Strategy 1: Check PATH via where.exe (works when Git\usr\bin is on PATH)
  try {
    const output = execSync('where.exe bash', {encoding: 'utf8', timeout: 3000, windowsHide: true})
    for (const line of output.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (trimmed && /git|msys|mingw/iu.test(trimmed)) {
        return trimmed
      }
    }
  } catch {
    // where.exe failed — continue to fallbacks
  }

  // Strategy 2: Derive from git.exe location (git is almost always on PATH even in PowerShell)
  try {
    const gitOutput = execSync('where.exe git', {encoding: 'utf8', timeout: 3000, windowsHide: true})
    for (const line of gitOutput.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // C:\Program Files\Git\cmd\git.exe → C:\Program Files\Git\usr\bin\bash.exe
      const gitMatch = trimmed.match(/^(.+[/\\]Git)[/\\]cmd[/\\]git\.exe$/iu)
      if (gitMatch?.[1]) {
        const bashPath = `${gitMatch[1]}\\usr\\bin\\bash.exe`
        if (existsSync(bashPath)) return bashPath
      }
    }
  } catch {
    // where.exe git failed — continue to fallbacks
  }

  // Strategy 3: Well-known install paths
  const knownPaths = [
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
  ]
  for (const p of knownPaths) {
    if (existsSync(p)) return p
  }

  return null
}

/** Probe whether tmux is reachable through the given bash binary. */
function isTmuxReachable(bashPath: string): boolean {
  try {
    execFileSync(bashPath, ['-lc', 'tmux -V'], {
      timeout: 3000,
      stdio: 'ignore',
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/** Check if tmux is natively on PATH (Unix, or rare Windows native installs). */
function isNativeTmuxAvailable(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe tmux' : 'which tmux'
    execSync(cmd, {stdio: 'ignore', timeout: 3000, windowsHide: true})
    return true
  } catch {
    return false
  }
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
  const {toolPath, toolArgs, promptText, enableMouse = true} = opts
  const parts: string[] = []

  if (enableMouse) {
    parts.push('tmux set-option -g mouse on >/dev/null 2>&1 || true')
  }

  const cmdParts: string[] = []

  // On Windows, convert tool path to POSIX for MSYS2 bash
  const effectivePath = process.platform === 'win32'
    ? toMsysPosixPath(toolPath)
    : toolPath
  cmdParts.push(quoteForSh(effectivePath))

  for (const arg of toolArgs) {
    cmdParts.push(quoteForSh(arg))
  }

  // Deliver prompt via temp file — avoids nested bash→tmux→sh quoting
  if (promptText) {
    const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
    writeFileSync(tmpFile, promptText, {encoding: 'utf-8', mode: 0o600})
    const posixTmpFile = process.platform === 'win32' ? toMsysPosixPath(tmpFile) : tmpFile
    const bootstrap = `Read startup instructions from this file path before taking action: ${posixTmpFile}. Use that file as the initial context.`
    cmdParts.push(quoteForSh(bootstrap))
  }

  parts.push(`exec ${cmdParts.join(' ')}`)
  return parts.join('; ')
}

/** Return env with Claude Code nesting-detection vars removed.
 *  Without this, Claude Code refuses to start inside tmux ("cannot launch
 *  claude within claude") because it inherits CLAUDECODE from the parent.
 *  Mirrors cleanTerminalEnv() in terminal.ts. */
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
  if (process.platform !== 'win32' && isNativeTmuxAvailable()) {
    const args = ['new-session']
    if (reattach) args.push('-A')
    args.push('-s', sessionName, shellCommand)
    return spawnAttached('tmux', args, cleanTmuxEnv())
  }

  // Strategy 2: Git Bash tmux (Windows)
  if (process.platform === 'win32') {
    const bashPath = findMsysBash()
    if (!bashPath) {
      return {exitCode: -1, usedTmux: false, reason: 'Git Bash not found'}
    }

    if (!isTmuxReachable(bashPath)) {
      return {exitCode: -1, usedTmux: false, reason: 'tmux not available in Git Bash'}
    }

    // ANTI-PATTERN: Do not use bash positional params ($1, $2, $3) to pass shell
    // commands to tmux on MSYS2. Quoting does not survive the bash→exec→tmux→sh
    // chain. Instead, build a single bash string with per-arg quoteForSh().
    const posixSocket = toMsysPosixPath(TMUX_SOCKET_PATH)
    const tmuxArgs = ['-S', posixSocket, 'new-session']
    if (reattach) tmuxArgs.push('-A')
    tmuxArgs.push('-s', sessionName, shellCommand)
    const tmuxCmd = `exec tmux ${tmuxArgs.map(quoteForSh).join(' ')}`

    return spawnAttached(bashPath, ['-lc', tmuxCmd], cleanTmuxEnv({MSYS_NO_PATHCONV: '1'}))
  }

  // No tmux available
  return {exitCode: -1, usedTmux: false, reason: 'tmux not found'}
}

/** Best-effort enable tmux mouse support in the current session. */
export function enableTmuxMouse(): void {
  try {
    if (process.platform !== 'win32') {
      execSync('tmux set-option -g mouse on', {stdio: 'ignore', timeout: 3000})
      return
    }

    const bashPath = findMsysBash()
    if (!bashPath) return

    const posixSocket = toMsysPosixPath(TMUX_SOCKET_PATH)
    execFileSync(bashPath, ['-lc', `tmux -S ${quoteForSh(posixSocket)} set-option -g mouse on`], {
      stdio: 'ignore',
      timeout: 3000,
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
      windowsHide: true,
    })
  } catch {
    // Best-effort — ignore failures
  }
}
