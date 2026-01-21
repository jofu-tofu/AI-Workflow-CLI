import {execSync, spawn} from 'node:child_process'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {spawnProcess} from '../lib/spawn.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code or Codex with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * or Codex CLI with --yolo flag, enabling unattended execution.
 * Designed for AIW hook system safety guardrails (requires aiw setup).
 * Supports multiple parallel sessions.
 */
export default class LaunchCommand extends BaseCommand {
  static override description =
    'Launch Claude Code or Codex with AIW configuration (sandbox disabled, supports parallel sessions)\n\n' +
    'FLAGS\n' +
    '  --codex/-c: Launch Codex instead of Claude Code (uses --yolo flag)\n' +
    '  --new/-n: Open a new terminal in the current directory and launch there\n\n' +
    'EXIT CODES\n' +
    '  0  Success - AI assistant launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - CLI not found (install Claude Code from https://claude.ai/download or Codex from npm)'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --codex  # Launch Codex with --yolo flag',
    '<%= config.bin %> <%= command.id %> -c  # Short form for --codex',
    '<%= config.bin %> <%= command.id %> --new  # Launch in a new terminal window',
    '<%= config.bin %> <%= command.id %> -n  # Short form for --new',
    '<%= config.bin %> <%= command.id %> --codex --new  # Launch Codex in new terminal',
    '<%= config.bin %> <%= command.id %> --debug  # Enable verbose logging',
    '# Check exit code in Bash\n<%= config.bin %> <%= command.id %>\necho $?',
    '# Check exit code in PowerShell\n<%= config.bin %> <%= command.id %>\necho $LASTEXITCODE',
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    codex: Flags.boolean({
      char: 'c',
      description: 'Launch Codex instead of Claude Code (uses --yolo flag for full auto mode)',
      default: false,
    }),
    new: Flags.boolean({
      char: 'n',
      description: 'Open a new terminal in the current directory and run aiw launch there',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LaunchCommand)

    // Determine which CLI to launch
    const useCodex = flags.codex
    const cliCommand = useCodex ? 'codex' : 'claude'
    const cliArgs = useCodex ? ['--yolo'] : ['--dangerously-skip-permissions']
    const launchFlag = useCodex ? '--codex' : ''

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      try {
        await this.launchNewTerminal(cwd, useCodex)
        this.log(`New terminal launched with aiw launch${launchFlag ? ` ${launchFlag}` : ''}`)
      } catch (error) {
        const err = error as Error
        this.error(`Failed to launch new terminal: ${err.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

      return
    }

    // Normal launch flow
    let exitCode: number

    try {
      // Version check only applies to Claude Code (not Codex)
      if (useCodex) {
        this.debug('Launching Codex with --yolo flag')
      } else {
        // Check Claude Code version compatibility (non-blocking)
        const version = await getClaudeCodeVersion()
        const versionCheck = checkVersionCompatibility(version)

        // Debug logging: show version information
        this.debug(`Claude Code version: ${versionCheck.version ?? 'unknown'}`)
        this.debug(`Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`)

        // Non-blocking warning for incompatibility or unknown version
        if (versionCheck.warning) {
          this.warn(versionCheck.warning)
        }
      }

      // Spawn AI CLI with sandbox permissions disabled
      // AIW hook system provides safety guardrails
      // Continue launch regardless of version check result (graceful degradation)
      exitCode = await spawnProcess(cliCommand, cliArgs)
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        // Actionable error message (already includes installation link)
        this.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
      }

      // Unexpected error
      this.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
    }

    // Pass through Claude Code's exit code (outside try-catch to avoid catching exit)
    this.exit(exitCode)
  }

  /**
   * Launch Linux terminal emulator with aiw launch.
   * Tries gnome-terminal, konsole, xterm in order.
   */
  private async launchLinuxTerminal(targetPath: string, launchCmd: string): Promise<void> {
    // Escape single quotes for bash shell
    const escapedPath = targetPath.replaceAll("'", String.raw`'\''`)
    const command = `cd '${escapedPath}' && ${launchCmd}`

    // Try to detect available terminal emulator
    const terminals = [
      {cmd: 'gnome-terminal', args: ['--', 'bash', '-c', `${command}; exec bash`]},
      {cmd: 'konsole', args: ['-e', `bash -c "${command}; exec bash"`]},
      {cmd: 'xterm', args: ['-e', `bash -c "${command}; exec bash"`]},
      {cmd: 'x-terminal-emulator', args: ['-e', `bash -c "${command}; exec bash"`]},
    ]

    for (const terminal of terminals) {
      try {
        // Check if terminal exists
        execSync(`which ${terminal.cmd}`, {stdio: 'ignore'})

        // Launch terminal
        this.debug(`Launching ${terminal.cmd}`)
        return new Promise<void>((resolve) => {
          const proc = spawn(terminal.cmd, terminal.args, {
            detached: true,
            stdio: 'ignore',
          })
          proc.unref()
          resolve()
        })
      } catch {
        // Try next terminal
        continue
      }
    }

    throw new Error('No supported terminal emulator found. Please install gnome-terminal, konsole, or xterm.')
  }

  /**
   * Launch macOS Terminal.app with aiw launch.
   */
  private async launchMacTerminal(targetPath: string, launchCmd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Escape single quotes for bash context
      const escapedPath = targetPath.replaceAll("'", String.raw`'\''`)
      const command = `cd '${escapedPath}' && ${launchCmd}`
      // Escape double quotes and backslashes for AppleScript context
      const escapedCommand = command.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)

      const terminal = spawn('osascript', ['-e', `tell application "Terminal" to do script "${escapedCommand}"`], {
        detached: true,
        stdio: 'ignore',
      })

      terminal.on('error', (err) => {
        reject(new Error(`Failed to launch Terminal.app: ${err.message}`))
      })

      terminal.unref()
      resolve()
    })
  }

  /**
   * Launch a new terminal window with aiw launch in the specified directory.
   * Cross-platform support for Windows, macOS, and Linux.
   */
  private async launchNewTerminal(targetPath: string, useCodex: boolean = false): Promise<void> {
    const {platform} = process
    const launchCmd = useCodex ? 'aiw launch --codex' : 'aiw launch'

    if (platform === 'win32') {
      await this.launchWindowsTerminal(targetPath, launchCmd)
    } else if (platform === 'darwin') {
      await this.launchMacTerminal(targetPath, launchCmd)
    } else {
      await this.launchLinuxTerminal(targetPath, launchCmd)
    }
  }

  /**
   * Fallback for Windows when Windows Terminal is not available.
   */
  private async launchPowerShellFallback(targetPath: string, powershellCmd: string, launchCmd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const escapedPath = targetPath.replaceAll("'", "''")
      const command = `cd '${escapedPath}'; ${launchCmd}`
      const psCommand = `Start-Process ${powershellCmd} -ArgumentList '-NoExit', '-Command', "${command}"`

      const terminal = spawn(powershellCmd, ['-Command', psCommand], {
        detached: true,
        stdio: 'ignore',
      })

      terminal.on('error', (err) => {
        reject(new Error(`Failed to launch PowerShell: ${err.message}`))
      })

      terminal.unref()
      resolve()
    })
  }

  /**
   * Launch Windows Terminal or PowerShell fallback with aiw launch.
   */
  private async launchWindowsTerminal(targetPath: string, launchCmd: string): Promise<void> {
    // Detect which PowerShell to use (prefer pwsh for PowerShell 7)
    let powershellCmd = 'pwsh'
    try {
      execSync('where pwsh', {stdio: 'ignore'})
    } catch {
      // pwsh not found, use legacy PowerShell
      powershellCmd = 'powershell'
    }

    // Try Windows Terminal first
    return new Promise<void>((resolve, reject) => {
      const terminal = spawn('wt', ['-d', targetPath, powershellCmd, '-NoExit', '-Command', launchCmd], {
        detached: true,
        stdio: 'ignore',
      })

      terminal.on('error', (err) => {
        // If wt.exe not found, try fallback to Start-Process
        if (err.message.includes('ENOENT')) {
          this.debug('Windows Terminal not found, using PowerShell fallback')
          this.launchPowerShellFallback(targetPath, powershellCmd, launchCmd)
            .then(resolve)
            .catch(reject)
        } else {
          reject(new Error(`Failed to launch terminal: ${err.message}`))
        }
      })

      terminal.unref()
      resolve()
    })
  }
}
