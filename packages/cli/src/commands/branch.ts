import {spawn} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'

import {Args} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/exit-codes.js'

/**
 * Create a new git worktree with sibling folder and auto-launch.
 *
 * This command reduces friction in branch-based workflows by:
 * 1. Creating a new git worktree with the specified branch name
 * 2. Creating a sibling folder with suffix pattern (e.g., aiwcli -> aiwcli-feature-name)
 * 3. Opening a new terminal window at the worktree path
 * 4. Automatically running 'aiw launch' in that terminal
 */
export default class BranchCommand extends BaseCommand {
  static override args = {
    branchName: Args.string({
      description: 'Name of the new branch to create',
      required: true,
    }),
  }

  static override description =
    'Create git worktree in sibling folder and auto-launch Claude Code\n\n' +
    'Creates a new git worktree with the specified branch name in a sibling folder.\n' +
    'The folder name is derived from the current directory name plus the branch name.\n' +
    'For example, if you run this in "aiwcli", it creates "../aiwcli-feature-name".\n' +
    'A new terminal window is opened at the worktree location with "aiw launch" running.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> feature-name',
    '<%= config.bin %> <%= command.id %> fix-bug-123',
    '<%= config.bin %> <%= command.id %> experiment',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(BranchCommand)
    const branchName = args.branchName

    try {
      // Validate branch name
      if (!branchName || branchName.trim().length === 0) {
        this.error('Branch name cannot be empty', {exit: EXIT_CODES.INVALID_USAGE})
      }

      // Validate branch name format (no spaces, special chars that could cause issues)
      const validBranchNamePattern = /^[a-zA-Z0-9._/-]+$/
      if (!validBranchNamePattern.test(branchName)) {
        this.error(
          'Branch name contains invalid characters. Use only letters, numbers, dots, dashes, underscores, and slashes.',
          {exit: EXIT_CODES.INVALID_USAGE},
        )
      }

      // Get current directory and derive sibling folder name
      const currentDir = process.cwd()
      const currentDirName = basename(currentDir)
      const parentDir = dirname(currentDir)
      const worktreeFolderName = `${currentDirName}-${branchName}`
      const worktreePath = resolve(parentDir, worktreeFolderName)

      this.logInfo(`Creating worktree for branch: ${branchName}`)
      this.logInfo(`Worktree location: ${worktreePath}`)

      // Check if worktree folder already exists
      try {
        await fs.access(worktreePath)
        this.error(`Folder already exists: ${worktreePath}`, {exit: EXIT_CODES.INVALID_USAGE})
      } catch {
        // Folder doesn't exist, which is what we want
      }

      // Check if we're in a git repository
      try {
        await fs.access(join(currentDir, '.git'))
      } catch {
        this.error('Not a git repository. Please run this command from a git repository root.', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      // Create git worktree
      await this.createWorktree(branchName, worktreePath)

      this.logSuccess(`✓ Created worktree at ${worktreePath}`)
      this.logSuccess(`✓ Created and checked out branch: ${branchName}`)

      // Launch terminal in worktree path
      await this.launchTerminal(worktreePath)

      this.logSuccess('✓ Launched terminal with aiw launch')
      this.log('')
      this.logInfo('New terminal window opened at worktree location.')
      this.logInfo('Claude Code should be launching automatically.')
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {code?: string; stderr?: string}

      // Handle git-specific errors
      if (err.message?.includes('already exists')) {
        this.error(`Branch '${branchName}' already exists. Choose a different name.`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      if (err.stderr?.includes('fatal: not a git repository')) {
        this.error('Not a git repository. Please run this command from a git repository root.', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      // Generic error fallback
      this.error(`Failed to create worktree: ${err.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
    }
  }

  /**
   * Create a git worktree with the specified branch name.
   *
   * @param branchName - Name of the branch to create
   * @param worktreePath - Path where the worktree should be created
   */
  private async createWorktree(branchName: string, worktreePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['worktree', 'add', '-b', branchName, worktreePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''

      gitProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          const error = new Error(`Git worktree creation failed: ${stderr}`) as NodeJS.ErrnoException & {
            stderr?: string
          }
          error.code = 'GIT_ERROR'
          error.stderr = stderr
          reject(error)
        }
      })

      gitProcess.on('error', (err) => {
        reject(new Error(`Failed to execute git command: ${err.message}`))
      })
    })
  }

  /**
   * Launch a new terminal window at the specified path with 'aiw launch' running.
   *
   * For Windows, uses Windows Terminal (wt.exe) if available, falls back to PowerShell.
   * For Unix/macOS, uses appropriate terminal emulator.
   *
   * @param worktreePath - Path where the terminal should open
   */
  private async launchTerminal(worktreePath: string): Promise<void> {
    const platform = process.platform

    if (platform === 'win32') {
      // Windows: Use Windows Terminal with auto-launch command
      // wt.exe -d <path> -- aiw launch (uses default profile)
      return new Promise<void>((resolve, reject) => {
        const terminal = spawn(
          'wt',
          ['-d', worktreePath, '--', 'aiw', 'launch'],
          {
            detached: true,
            stdio: 'ignore',
          },
        )

        terminal.on('error', (err) => {
          // If wt.exe not found, try fallback to Start-Process
          if (err.message.includes('ENOENT')) {
            this.launchPowerShellFallback(worktreePath)
              .then(resolve)
              .catch(reject)
          } else {
            reject(new Error(`Failed to launch terminal: ${err.message}`))
          }
        })

        // Detach the terminal process so it runs independently
        terminal.unref()
        resolve()
      })
    } else {
      // Unix/macOS: Use appropriate terminal
      return new Promise<void>((resolve, reject) => {
        let terminal: ReturnType<typeof spawn>

        if (platform === 'darwin') {
          // macOS: Use Terminal.app with osascript
          terminal = spawn(
            'osascript',
            [
              '-e',
              `tell application "Terminal" to do script "cd ${this.escapeShellArg(worktreePath)} && aiw launch"`,
            ],
            {
              detached: true,
              stdio: 'ignore',
            },
          )
        } else {
          // Linux: Try common terminal emulators
          // Try gnome-terminal first, then xterm as fallback
          terminal = spawn(
            'gnome-terminal',
            ['--working-directory', worktreePath, '--', 'bash', '-c', 'aiw launch; exec bash'],
            {
              detached: true,
              stdio: 'ignore',
            },
          )

          terminal.on('error', () => {
            // Fallback to xterm
            const xtermProcess = spawn('xterm', ['-e', `cd ${this.escapeShellArg(worktreePath)} && aiw launch`], {
              detached: true,
              stdio: 'ignore',
            })
            xtermProcess.unref()
          })
        }

        terminal.unref()
        resolve()
      })
    }
  }

  /**
   * Fallback for Windows when wt.exe is not available.
   * Uses PowerShell Start-Process to open a new PowerShell window.
   *
   * @param worktreePath - Path where the terminal should open
   */
  private async launchPowerShellFallback(worktreePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const psCommand = `Start-Process powershell -ArgumentList '-NoExit','-Command','cd ${this.escapeShellArg(worktreePath)}; aiw launch'`

      const terminal = spawn('powershell', ['-Command', psCommand], {
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
   * Escape shell argument to prevent command injection.
   * Wraps path in double quotes and escapes internal quotes.
   *
   * @param arg - Argument to escape
   * @returns Escaped argument safe for shell execution
   */
  private escapeShellArg(arg: string): string {
    // Escape double quotes and backslashes, then wrap in double quotes
    return `"${arg.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  }
}
