/**
 * @file Cross-platform terminal launching utilities.
 *
 * This module provides utilities for launching new terminal windows with commands
 * across Windows, macOS, and Linux platforms.
 *
 * ## Supported Platforms
 * - **Windows**: Windows Terminal (wt.exe) with PowerShell 7 (pwsh) fallback to PowerShell 5.1
 * - **macOS**: Terminal.app via AppleScript
 * - **WSL**: Windows Terminal (wt.exe) via wsl.exe, falls back to Linux emulators
 * - **Linux**: gnome-terminal, konsole, xterm, x-terminal-emulator (in order of preference)
 *
 * ## Usage
 * ```typescript
 * import { launchTerminal } from '../lib/terminal.js'
 *
 * const result = await launchTerminal({
 *   cwd: '/path/to/project',
 *   command: 'aiw launch',
 *   debugLog: (msg) => console.debug(msg),
 * })
 *
 * if (!result.success) {
 *   console.error(result.error)
 * }
 * ```
 *
 * @module lib/terminal
 */

import {execSync, spawn} from 'node:child_process'

/**
 * Return a copy of process.env with Claude Code nesting-detection vars removed.
 *
 * Claude Code sets CLAUDECODE and CLAUDE_CODE_ENTRYPOINT when running. Child
 * processes that inherit these vars are blocked from launching their own Claude
 * Code instance ("cannot launch claude within claude").
 *
 * Source of truth: packages/cli/src/templates/_shared/lib-ts/base/subprocess-utils.ts
 * → getInternalSubprocessEnv() — if Claude Code adds more nesting-detection vars
 * in a future release, add them here too.
 */
function cleanTerminalEnv(): NodeJS.ProcessEnv {
  const env = {...process.env}
  delete env['CLAUDECODE']
  delete env['CLAUDE_CODE_ENTRYPOINT']
  return env
}

/**
 * Options for launching a new terminal window.
 */
interface TerminalLaunchOptions {
  /**
   * Command to execute in the new terminal.
   */
  command: string

  /**
   * Working directory where the terminal should open.
   */
  cwd: string

  /**
   * Optional debug logging function.
   * If provided, debug messages will be passed to this function.
   */
  debugLog?: (message: string) => void
}

/**
 * Result of a terminal launch operation.
 */
interface TerminalLaunchResult {
  /**
   * Error message if launch failed.
   */
  error?: string

  /**
   * Whether the terminal was successfully launched.
   */
  success: boolean
}

/**
 * Detect which PowerShell is available on Windows.
 * Prefers PowerShell 7 (pwsh) over legacy PowerShell.
 *
 * @returns 'pwsh' if PowerShell 7 is available, 'powershell' otherwise
 */
function detectPowerShell(): string {
  try {
    execSync('where pwsh', {stdio: 'ignore'})
    return 'pwsh'
  } catch {
    return 'powershell'
  }
}

/**
 * Launch PowerShell fallback when Windows Terminal is not available.
 *
 * @param cwd - Working directory
 * @param command - Command to execute
 * @param powershellCmd - PowerShell command to use (pwsh or powershell)
 * @param debugLog - Optional debug logging function
 */
async function launchPowerShellFallback(
  cwd: string,
  command: string,
  powershellCmd: string,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  return new Promise<TerminalLaunchResult>((resolve) => {
    const escapedPath = cwd.replaceAll("'", "''")
    const psCommand = `Start-Process ${powershellCmd} -ArgumentList '-NoExit','-Command',"cd '${escapedPath}'; ${command}"`

    debugLog?.(`Launching PowerShell fallback with command: ${psCommand}`)

    const terminal = spawn(powershellCmd, ['-Command', psCommand], {
      detached: true,
      stdio: 'ignore',
      env: cleanTerminalEnv(),
    })

    terminal.on('error', (err) => {
      resolve({success: false, error: `Failed to launch PowerShell: ${err.message}`})
    })

    terminal.unref()
    resolve({success: true})
  })
}

/**
 * Launch Windows Terminal or PowerShell fallback.
 *
 * @param cwd - Working directory
 * @param command - Command to execute
 * @param debugLog - Optional debug logging function
 */
async function launchWindowsTerminal(
  cwd: string,
  command: string,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  const powershellCmd = detectPowerShell()
  debugLog?.(`Detected PowerShell: ${powershellCmd}`)

  return new Promise<TerminalLaunchResult>((resolve) => {
    const terminal = spawn('wt', ['-d', cwd, powershellCmd, '-NoExit', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      env: cleanTerminalEnv(),
    })

    terminal.on('error', (err) => {
      // If wt.exe not found, try fallback to Start-Process
      if (err.message.includes('ENOENT')) {
        debugLog?.('Windows Terminal not found, using PowerShell fallback')
        launchPowerShellFallback(cwd, command, powershellCmd, debugLog)
          .then(resolve)
          .catch(() => resolve({success: false, error: 'Failed to launch PowerShell fallback'}))
      } else {
        resolve({success: false, error: `Failed to launch terminal: ${err.message}`})
      }
    })

    terminal.unref()
    resolve({success: true})
  })
}

/**
 * Launch macOS Terminal.app with command.
 *
 * @param cwd - Working directory
 * @param command - Command to execute
 * @param debugLog - Optional debug logging function
 */
async function launchMacTerminal(
  cwd: string,
  command: string,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  return new Promise<TerminalLaunchResult>((resolve) => {
    // Escape single quotes for bash context
    const escapedPath = cwd.replaceAll("'", String.raw`'\''`)
    const fullCommand = `cd '${escapedPath}' && ${command}`
    // Escape double quotes and backslashes for AppleScript context
    const escapedCommand = fullCommand.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)

    debugLog?.(`Launching macOS Terminal with command: ${fullCommand}`)

    const terminal = spawn('osascript', ['-e', `tell application "Terminal" to do script "${escapedCommand}"`], {
      detached: true,
      stdio: 'ignore',
      env: cleanTerminalEnv(),
    })

    terminal.on('error', (err) => {
      resolve({success: false, error: `Failed to launch Terminal.app: ${err.message}`})
    })

    terminal.unref()
    resolve({success: true})
  })
}

/**
 * Linux terminal emulator configurations.
 */
const LINUX_TERMINALS = [
  {cmd: 'gnome-terminal', getArgs: (command: string) => ['--', 'bash', '-c', `${command}; exec bash`]},
  {cmd: 'konsole', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
  {cmd: 'xterm', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
  {cmd: 'x-terminal-emulator', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
]

/**
 * Find the first available Linux terminal emulator.
 * Checks gnome-terminal, konsole, xterm, x-terminal-emulator in order.
 *
 * @returns Terminal configuration if found, null otherwise
 */
function findAvailableLinuxTerminal(): (typeof LINUX_TERMINALS)[number] | null {
  for (const terminal of LINUX_TERMINALS) {
    try {
      execSync(`which ${terminal.cmd}`, {stdio: 'ignore'})
      return terminal
    } catch {
      // Terminal not found, try next
      continue
    }
  }

  return null
}

function isWSL(): boolean {
  return Boolean(process.env['WSL_DISTRO_NAME'])
}

/**
 * Launch Windows Terminal (wt.exe) from WSL, running the command inside a new bash session.
 *
 * Uses wt.exe → wsl.exe → bash so the new terminal inherits the correct WSL distro.
 * Claude Code nesting-detection vars are stripped via cleanTerminalEnv().
 *
 * @param cwd - Working directory (WSL path)
 * @param command - Command to execute
 * @param debugLog - Optional debug logging function
 */
async function launchWSLTerminal(
  cwd: string,
  command: string,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  const escapedPath = cwd.replaceAll("'", String.raw`'\''`)
  const bashCmd = `cd '${escapedPath}' && ${command}; exec bash`

  debugLog?.(`Launching WSL via wt.exe with command: ${bashCmd}`)

  return new Promise<TerminalLaunchResult>((resolve) => {
    const proc = spawn('wt.exe', ['wsl.exe', '--', 'bash', '-c', bashCmd], {
      detached: true,
      stdio: 'ignore',
      env: cleanTerminalEnv(),
    })
    proc.on('error', (err) => {
      resolve({success: false, error: `wt.exe failed: ${err.message}`})
    })
    proc.unref()
    resolve({success: true})
  })
}

/**
 * Launch Linux terminal emulator with command.
 * Tries gnome-terminal, konsole, xterm, x-terminal-emulator in order.
 *
 * @param cwd - Working directory
 * @param command - Command to execute
 * @param debugLog - Optional debug logging function
 */
async function launchLinuxTerminal(
  cwd: string,
  command: string,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  // Find available terminal first (synchronous)
  const terminal = findAvailableLinuxTerminal()

  if (!terminal) {
    return {
      error: 'No supported terminal emulator found. Please install gnome-terminal, konsole, or xterm.',
      success: false,
    }
  }

  // Escape single quotes for bash shell
  const escapedPath = cwd.replaceAll("'", String.raw`'\''`)
  const fullCommand = `cd '${escapedPath}' && ${command}`

  debugLog?.(`Launching ${terminal.cmd} with command: ${fullCommand}`)

  // Launch terminal (single async operation)
  return new Promise<TerminalLaunchResult>((resolve) => {
    const proc = spawn(terminal.cmd, terminal.getArgs(fullCommand), {
      detached: true,
      stdio: 'ignore',
      env: cleanTerminalEnv(),
    })

    proc.on('error', (err) => {
      resolve({error: `Failed to launch ${terminal.cmd}: ${err.message}`, success: false})
    })

    proc.unref()
    resolve({success: true})
  })
}

/**
 * Launch a new terminal window with the specified command.
 *
 * This function automatically detects the platform and uses the appropriate
 * terminal emulator:
 * - **Windows**: Windows Terminal (wt.exe) with PowerShell, falls back to PowerShell directly
 * - **macOS**: Terminal.app via AppleScript
 * - **WSL**: Windows Terminal (wt.exe) via wsl.exe, falls back to Linux terminals
 * - **Linux**: Tries gnome-terminal, konsole, xterm, x-terminal-emulator in order
 *
 * The terminal is launched in detached mode, allowing the parent process to exit
 * without affecting the new terminal.
 *
 * @param options - Terminal launch options
 * @returns Promise resolving to launch result
 *
 * @example
 * ```typescript
 * // Launch aiw in a new terminal
 * const result = await launchTerminal({
 *   cwd: '/path/to/project',
 *   command: 'aiw launch',
 * })
 *
 * if (result.success) {
 *   console.log('Terminal launched successfully')
 * } else {
 *   console.error(`Failed: ${result.error}`)
 * }
 * ```
 */
export async function launchTerminal(options: TerminalLaunchOptions): Promise<TerminalLaunchResult> {
  const {cwd, command, debugLog} = options
  const {platform} = process

  debugLog?.(`Launching terminal in ${cwd} with command: ${command}`)
  debugLog?.(`Platform: ${platform}`)

  if (platform === 'win32') {
    return launchWindowsTerminal(cwd, command, debugLog)
  }

  if (platform === 'darwin') {
    return launchMacTerminal(cwd, command, debugLog)
  }

  // Linux/Unix — try WSL (wt.exe) first, fall back to native Linux terminals
  if (isWSL()) {
    debugLog?.('WSL detected, trying wt.exe')
    const wslResult = await launchWSLTerminal(cwd, command, debugLog)
    if (wslResult.success) return wslResult
    debugLog?.(`wt.exe failed (${wslResult.error}), falling back to Linux terminals`)
  }

  return launchLinuxTerminal(cwd, command, debugLog)
}

