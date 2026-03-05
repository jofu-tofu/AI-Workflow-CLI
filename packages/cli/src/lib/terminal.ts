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

import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'

import {cleanClaudeEnv} from './mux-utils.js'
import {isCommandAvailable} from './runtime/executable-policy.js'
import {isWindowsPlatform} from './runtime/platform-adapter.js'
import {findMsysBash} from './runtime/tmux-preflight.js'
import {escapeSingleQuotedPath} from './shell-quoting.js'
import {
  detectPowerShell,
  findAvailableLinuxTerminal,
  isWSL,
  resolveWindowsTerminalStrategy,
  type WindowsShellPreference,
  type WindowsTerminalStrategy,
} from './terminal-strategy.js'

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

  /**
   * Preferred shell when launching on Windows.
   * - default: Existing behavior (PowerShell in wt or fallback)
   * - mintty: Prefer mintty + Git Bash, fallback to git-bash in wt, then PowerShell
   * - git-bash: Prefer Git Bash in wt, fallback to PowerShell if unavailable
   */
  windowsShellPreference?: WindowsShellPreference
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
    const escapedPath = escapeSingleQuotedPath(cwd, 'powershell')
    const psCommand = `Start-Process ${powershellCmd} -ArgumentList '-NoExit','-Command',"cd '${escapedPath}'; ${command}"`

    debugLog?.(`Launching PowerShell fallback with command: ${psCommand}`)

    const terminal = spawn(powershellCmd, ['-Command', psCommand], {
      detached: true,
      stdio: 'ignore',
      env: cleanClaudeEnv(),
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
 * @param shellPreference - Preferred shell for Windows launches
 * @param debugLog - Optional debug logging function
 */
async function launchWindowsTerminal(
  cwd: string,
  command: string,
  shellPreference: WindowsShellPreference,
  debugLog?: (message: string) => void,
): Promise<TerminalLaunchResult> {
  const powershellCmd = detectPowerShell(isCommandAvailable)
  debugLog?.(`Detected PowerShell: ${powershellCmd}; shell preference: ${shellPreference}`)

  const gitBashPath = findMsysBash()
  const minttyPath = gitBashPath
    ? path.join(path.dirname(gitBashPath), 'mintty.exe')
    : null
  const hasMintty = Boolean(minttyPath && existsSync(minttyPath))
  const strategyOrder = resolveWindowsTerminalStrategy(shellPreference, gitBashPath, hasMintty, powershellCmd)

  const tryStrategy = async (strategy: WindowsTerminalStrategy): Promise<TerminalLaunchResult> => {
    if (strategy === 'powershell-fallback') {
      debugLog?.('Using PowerShell fallback launcher')
      return launchPowerShellFallback(cwd, command, powershellCmd, debugLog)
    }

    if (strategy === 'mintty') {
      if (!minttyPath || !gitBashPath) {
        return {success: false, error: 'mintty or Git Bash not found'}
      }

      const escapedPath = escapeSingleQuotedPath(cwd, 'bash')
      const bashCmd = `cd '${escapedPath}' && ${command}; exec bash`
      debugLog?.(`Using mintty for Windows terminal: ${minttyPath}`)

      return new Promise<TerminalLaunchResult>((resolve) => {
        const terminal = spawn(minttyPath, [gitBashPath, '-lc', bashCmd], {
          detached: true,
          stdio: 'ignore',
          env: cleanClaudeEnv(),
          windowsHide: true,
        })

        terminal.on('error', (err) => {
          resolve({success: false, error: `mintty launch failed: ${err.message}`})
        })

        terminal.unref()
        resolve({success: true})
      })
    }

    if (strategy === 'git-bash-in-wt') {
      if (!gitBashPath) {
        return {success: false, error: 'Git Bash not found'}
      }

      const escapedPath = escapeSingleQuotedPath(cwd, 'bash')
      const bashCmd = `cd '${escapedPath}' && ${command}; exec bash`
      debugLog?.(`Using Git Bash for Windows terminal: ${gitBashPath}`)

      return new Promise<TerminalLaunchResult>((resolve) => {
        const terminal = spawn('wt', ['-d', cwd, gitBashPath, '-lc', bashCmd], {
          detached: true,
          stdio: 'ignore',
          env: cleanClaudeEnv(),
        })

        terminal.on('error', (err) => {
          resolve({success: false, error: `Git Bash launch via wt failed: ${err.message}`})
        })

        terminal.unref()
        resolve({success: true})
      })
    }

    debugLog?.('Using Windows Terminal with PowerShell')
    return new Promise<TerminalLaunchResult>((resolve) => {
      const terminal = spawn('wt', ['-d', cwd, powershellCmd, '-NoExit', '-Command', command], {
        detached: true,
        stdio: 'ignore',
        env: cleanClaudeEnv(),
      })

      terminal.on('error', (err) => {
        resolve({success: false, error: `Failed to launch terminal: ${err.message}`})
      })

      terminal.unref()
      resolve({success: true})
    })
  }

  const tryStrategies = async (index = 0): Promise<TerminalLaunchResult> => {
    const strategy = strategyOrder[index]
    if (!strategy) {
      return {success: false, error: 'Failed to launch Windows terminal with all available strategies'}
    }

    const result = await tryStrategy(strategy)
    if (result.success) return result
    debugLog?.(`Strategy ${strategy} failed: ${result.error}`)
    return tryStrategies(index + 1)
  }

  return tryStrategies()
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
    const escapedPath = escapeSingleQuotedPath(cwd, 'bash')
    const fullCommand = `cd '${escapedPath}' && ${command}`
    // Escape double quotes and backslashes for AppleScript context
    const escapedCommand = fullCommand.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)

    debugLog?.(`Launching macOS Terminal with command: ${fullCommand}`)

    const terminal = spawn('osascript', ['-e', `tell application "Terminal" to do script "${escapedCommand}"`], {
      detached: true,
      stdio: 'ignore',
      env: cleanClaudeEnv(),
    })

    terminal.on('error', (err) => {
      resolve({success: false, error: `Failed to launch Terminal.app: ${err.message}`})
    })

    terminal.unref()
    resolve({success: true})
  })
}

/**
 * Launch Windows Terminal (wt.exe) from WSL, running the command inside a new bash session.
 *
 * Uses wt.exe → wsl.exe → bash so the new terminal inherits the correct WSL distro.
 * Claude Code nesting-detection vars are stripped via cleanClaudeEnv().
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
  const escapedPath = escapeSingleQuotedPath(cwd, 'bash')
  const bashCmd = `cd '${escapedPath}' && ${command}; exec bash`

  debugLog?.(`Launching WSL via wt.exe with command: ${bashCmd}`)

  return new Promise<TerminalLaunchResult>((resolve) => {
    const proc = spawn('wt.exe', ['wsl.exe', '--', 'bash', '-c', bashCmd], {
      detached: true,
      stdio: 'ignore',
      env: cleanClaudeEnv(),
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
  const terminal = findAvailableLinuxTerminal(isCommandAvailable)

  if (!terminal) {
    return {
      error: 'No supported terminal emulator found. Please install gnome-terminal, konsole, or xterm.',
      success: false,
    }
  }

  // Escape single quotes for bash shell
  const escapedPath = escapeSingleQuotedPath(cwd, 'bash')
  const fullCommand = `cd '${escapedPath}' && ${command}`

  debugLog?.(`Launching ${terminal.cmd} with command: ${fullCommand}`)

  // Launch terminal (single async operation)
  return new Promise<TerminalLaunchResult>((resolve) => {
    const proc = spawn(terminal.cmd, terminal.getArgs(fullCommand), {
      detached: true,
      stdio: 'ignore',
      env: cleanClaudeEnv(),
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
  const {cwd, command, debugLog, windowsShellPreference = 'default'} = options
  const {platform} = process

  debugLog?.(`Launching terminal in ${cwd} with command: ${command}`)
  debugLog?.(`Platform: ${platform}`)

  if (isWindowsPlatform(platform)) {
    return launchWindowsTerminal(cwd, command, windowsShellPreference, debugLog)
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

