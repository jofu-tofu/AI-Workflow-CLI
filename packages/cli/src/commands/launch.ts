import {execSync, spawn} from 'node:child_process'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {spawnProcess} from '../lib/spawn.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * enabling unattended execution. Designed for AIW hook system safety guardrails
 * (requires aiw setup). Supports multiple parallel sessions.
 */
export default class LaunchCommand extends BaseCommand {
  static override description =
    'Launch Claude Code with AIW configuration (sandbox disabled, supports parallel sessions)\n\n' +
    'FLAGS\n' +
    '  --new/-n: Open a new terminal in the current directory and launch there\n\n' +
    'EXIT CODES\n' +
    '  0  Success - Claude Code launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - Claude Code not found (install from https://claude.ai/download)'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --new  # Launch in a new terminal window',
    '<%= config.bin %> <%= command.id %> -n  # Short form for --new',
    '<%= config.bin %> <%= command.id %> --debug  # Enable verbose logging',
    '# Check exit code in Bash\n<%= config.bin %> <%= command.id %>\necho $?',
    '# Check exit code in PowerShell\n<%= config.bin %> <%= command.id %>\necho $LASTEXITCODE',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    new: Flags.boolean({
      char: 'n',
      description: 'Open a new terminal in the current directory and run aiw launch there',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LaunchCommand)

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      try {
        await this.launchNewTerminal(cwd)
        this.log('New terminal launched with aiw launch')
        this.exit(0)
      } catch (error) {
        const err = error as Error
        this.error(`Failed to launch new terminal: ${err.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

      return
    }

    // Normal launch flow
    let exitCode: number

    try {
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

      // Spawn Claude Code with sandbox permissions disabled
      // AIW hook system provides safety guardrails
      // Continue launch regardless of version check result (graceful degradation)
      exitCode = await spawnProcess('claude', ['--dangerously-skip-permissions'])
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
   * Launch a new terminal window with aiw launch in the specified directory.
   * Cross-platform support for Windows, macOS, and Linux.
   */
  private async launchNewTerminal(targetPath: string): Promise<void> {
    const {platform} = process

    if (platform === 'win32') {
      await this.launchWindowsTerminal(targetPath)
    } else if (platform === 'darwin') {
      await this.launchMacTerminal(targetPath)
    } else {
      await this.launchLinuxTerminal(targetPath)
    }
  }

  /**
   * Launch Windows Terminal or PowerShell fallback with aiw launch.
   */
  private async launchWindowsTerminal(targetPath: string): Promise<void> {
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
      const terminal = spawn('wt', ['-d', targetPath, powershellCmd, '-NoExit', '-Command', 'aiw launch'], {
        detached: true,
        stdio: 'ignore',
      })

      terminal.on('error', (err) => {
        // If wt.exe not found, try fallback to Start-Process
        if (err.message.includes('ENOENT')) {
          this.debug('Windows Terminal not found, using PowerShell fallback')
          this.launchPowerShellFallback(targetPath, powershellCmd)
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

  /**
   * Fallback for Windows when Windows Terminal is not available.
   */
  private async launchPowerShellFallback(targetPath: string, powershellCmd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const escapedPath = targetPath.replaceAll("'", "''")
      const command = `cd '${escapedPath}'; aiw launch`
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
   * Launch macOS Terminal.app with aiw launch.
   */
  private async launchMacTerminal(targetPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Escape single quotes for bash context
      const escapedPath = targetPath.replaceAll("'", String.raw`'\''`)
      const command = `cd '${escapedPath}' && aiw launch`
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
   * Launch Linux terminal emulator with aiw launch.
   * Tries gnome-terminal, konsole, xterm in order.
   */
  private async launchLinuxTerminal(targetPath: string): Promise<void> {
    // Escape single quotes for bash shell
    const escapedPath = targetPath.replaceAll("'", String.raw`'\''`)
    const command = `cd '${escapedPath}' && aiw launch`

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
}
