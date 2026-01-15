import {execSync, spawn} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch aiw in main/master branch in a new terminal window.
 *
 * This command:
 * 1. Verifies you are in a git repository
 * 2. Verifies you are currently in a branch (not on main/master)
 * 3. Verifies that main or master branch exists
 * 4. Opens a new terminal window with `aiw launch` running in the main/master branch
 */
export default class BranchCommand extends BaseCommand {
  static override args = {
    branchName: Args.string({
      description: 'Name of the branch for worktree creation',
      required: false,
    }),
  }

  static override description =
    'Manage git branches with worktree support or launch in main/master\n\n' +
    'MODES\n' +
    '  --main/-m: Launch aiw in main/master branch in new terminal\n' +
    '  --launch/-l <branch>: Create/open git worktree in sibling folder\n\n' +
    'REQUIREMENTS\n' +
    '  • Must be in a git repository\n' +
    '  • For --main: Must be on a branch (not already on main/master)\n' +
    '  • For --main: main or master branch must exist\n\n' +
    'EXIT CODES\n' +
    '  0  Success - New terminal launched with aiw\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - requirements not met\n' +
    '  3  Environment error - git not found or not a git repository'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --main',
    '<%= config.bin %> <%= command.id %> --main --debug  # Enable verbose logging',
    '<%= config.bin %> <%= command.id %> --launch feature-name',
    '<%= config.bin %> <%= command.id %> -l fix-bug-123',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    main: Flags.boolean({
      char: 'm',
      description: 'Launch aiw in main/master branch in new terminal',
      exclusive: ['launch'],
    }),
    launch: Flags.boolean({
      char: 'l',
      description: 'Create git worktree in sibling folder or open if exists',
      exclusive: ['main'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchCommand)

    // Validate that one of the flags is provided
    if (!flags.main && !flags.launch) {
      this.error('Either --main or --launch flag is required', {exit: EXIT_CODES.INVALID_USAGE})
    }

    if (flags.main) {
      await this.handleMainBranch()
    } else if (flags.launch) {
      await this.handleWorktreeLaunch(args.branchName)
    }
  }

  /**
   * Handle --main flag: Launch aiw in main/master branch
   */
  private async handleMainBranch(): Promise<void> {
    try {
      const cwd = process.cwd()

      // Check 1: Verify we are in a git repository
      this.debug('Checking if current directory is a git repository...')
      const isGitRepo = await this.isGitRepository(cwd)
      if (!isGitRepo) {
        this.error('Not a git repository. This command only works inside a git repository.', {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      this.debug('✓ Git repository detected')

      // Check 2: Get current branch
      this.debug('Getting current branch name...')
      const currentBranch = await this.getCurrentBranch()
      this.debug(`Current branch: ${currentBranch}`)

      // Check 3: Verify we are NOT on main/master
      if (currentBranch === 'main' || currentBranch === 'master') {
        this.error(`Already on ${currentBranch} branch. This command is for switching to main/master from another branch.`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      this.debug('✓ Currently on a feature branch')

      // Check 4: Determine which main branch exists (main or master)
      this.debug('Checking which main branch exists...')
      const mainBranch = await this.getMainBranch()

      if (!mainBranch) {
        this.error('Neither "main" nor "master" branch exists in this repository.', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      this.debug(`✓ Found main branch: ${mainBranch}`)

      // Launch new terminal with aiw launch in main/master branch
      this.logInfo(`Opening new terminal with aiw launch in ${mainBranch} branch...`)
      await this.launchTerminalWithAiw(cwd, mainBranch)

      this.logSuccess(`✓ New terminal launched with aiw in ${mainBranch} branch`)
    } catch (error) {
      const err = error as Error

      // Check if error is already handled by this.error() calls above
      if (err.message?.includes('EEXIT')) {
        throw error
      }

      // Handle unexpected errors
      this.error(`Failed to launch terminal: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }
  }

  /**
   * Handle --launch flag: Create or open worktree in sibling folder
   */
  private async handleWorktreeLaunch(branchName: string | undefined): Promise<void> {
    // Validate branch name
    if (!branchName || branchName.trim().length === 0) {
      this.error('Branch name is required when using --launch flag', {exit: EXIT_CODES.INVALID_USAGE})
    }

    // Validate branch name format (no spaces, special chars that could cause issues)
    const validBranchNamePattern = /^[a-zA-Z0-9._/-]+$/
    if (!validBranchNamePattern.test(branchName)) {
      this.error(
        'Branch name contains invalid characters. Use only letters, numbers, dots, dashes, underscores, and slashes.',
        {exit: EXIT_CODES.INVALID_USAGE},
      )
    }

    try {
      const cwd = process.cwd()

      // Check if we're in a git repository
      const isGitRepo = await this.isGitRepository(cwd)
      if (!isGitRepo) {
        this.error('Not a git repository. This command only works inside a git repository.', {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      // Get current directory and derive sibling folder name
      const currentDirName = basename(cwd)
      const parentDir = dirname(cwd)
      const worktreeFolderName = `${currentDirName}-${branchName}`
      const worktreePath = resolve(parentDir, worktreeFolderName)

      this.debug(`Checking for existing worktree at: ${worktreePath}`)

      // Check if worktree folder already exists
      let worktreeExists = false
      try {
        await fs.access(worktreePath)
        worktreeExists = true
        this.logInfo(`Worktree already exists at: ${worktreePath}`)
        this.logInfo(`Opening terminal in existing worktree...`)
      } catch {
        // Folder doesn't exist, we'll create it
        this.logInfo(`Creating worktree for branch: ${branchName}`)
        this.logInfo(`Worktree location: ${worktreePath}`)
      }

      if (!worktreeExists) {
        // Create git worktree
        await this.createWorktree(branchName, worktreePath)
        this.logSuccess(`✓ Created worktree at ${worktreePath}`)
        this.logSuccess(`✓ Created and checked out branch: ${branchName}`)
      }

      // Launch terminal in worktree path
      await this.launchTerminalInWorktree(worktreePath)

      this.logSuccess('✓ Launched terminal with aiw launch')
      this.log('')
      this.logInfo('New terminal window opened at worktree location.')
      this.logInfo('Claude Code should be launching automatically.')
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {code?: string; stderr?: string}

      // Check if error is already handled by this.error() calls above
      if (err.message?.includes('EEXIT')) {
        throw error
      }

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
      this.error(`Failed to create/open worktree: ${err.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
    }
  }

  /**
   * Check if current directory is a git repository
   */
  private async isGitRepository(cwd: string): Promise<boolean> {
    try {
      const gitPath = join(cwd, '.git')
      await fs.access(gitPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current git branch name
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      return branch
    } catch (error) {
      const err = error as Error
      this.error(`Failed to get current branch: ${err.message}`, {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }
  }

  /**
   * Determine which main branch exists (main or master)
   * Returns 'main' if it exists, 'master' if it exists, or null if neither exists
   */
  private async getMainBranch(): Promise<string | null> {
    // Check for 'main' first (more modern convention)
    try {
      execSync('git show-ref --verify refs/heads/main', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return 'main'
    } catch {
      // main doesn't exist, try master
    }

    // Check for 'master'
    try {
      execSync('git show-ref --verify refs/heads/master', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return 'master'
    } catch {
      // neither exists
      return null
    }
  }

  /**
   * Launch a new terminal window with aiw launch in the specified branch
   */
  private async launchTerminalWithAiw(cwd: string, branch: string): Promise<void> {
    const platform = process.platform

    try {
      if (platform === 'win32') {
        // Windows: Use PowerShell to open new terminal
        // Command: cd to directory, checkout branch, run aiw launch
        const escapedCwd = cwd.replace(/'/g, "''")
        const escapedBranch = branch.replace(/'/g, "''")
        const command = `cd '${escapedCwd}'; git checkout '${escapedBranch}'; aiw launch`
        const psCommand = `Start-Process powershell -ArgumentList '-NoExit', '-Command', "${command}"`

        this.debug(`Launching Windows terminal with command: ${psCommand}`)
        execSync(`powershell -Command "${psCommand}"`, {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else if (platform === 'darwin') {
        // macOS: Use Terminal.app
        // Escape single quotes for bash context
        const escapedCwd = cwd.replace(/'/g, "'\\''")
        const escapedBranch = branch.replace(/'/g, "'\\''")
        const command = `cd '${escapedCwd}' && git checkout '${escapedBranch}' && aiw launch`
        // Escape double quotes and backslashes for AppleScript context
        const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const osascript = `osascript -e 'tell application "Terminal" to do script "${escapedCommand}"'`

        this.debug(`Launching macOS terminal with command: ${osascript}`)
        execSync(osascript, {stdio: 'ignore'})
      } else {
        // Linux/Unix: Try common terminal emulators
        // Escape single quotes in cwd and branch for bash shell
        const escapedCwd = cwd.replace(/'/g, "'\\''")
        const escapedBranch = branch.replace(/'/g, "'\\''")
        const command = `cd '${escapedCwd}' && git checkout '${escapedBranch}' && aiw launch`

        // Try to detect available terminal emulator
        const terminals = [
          {cmd: 'gnome-terminal', args: ['--', 'bash', '-c', `${command}; exec bash`]},
          {cmd: 'konsole', args: ['-e', `bash -c "${command}; exec bash"`]},
          {cmd: 'xterm', args: ['-e', `bash -c "${command}; exec bash"`]},
          {cmd: 'x-terminal-emulator', args: ['-e', `bash -c "${command}; exec bash"`]},
        ]

        let launched = false
        for (const terminal of terminals) {
          try {
            // Check if terminal exists
            execSync(`which ${terminal.cmd}`, {stdio: 'ignore'})

            // Launch terminal (run in background with nohup)
            this.debug(`Launching ${terminal.cmd} with command: ${command}`)
            execSync(`nohup ${terminal.cmd} ${terminal.args.join(' ')} > /dev/null 2>&1 &`, {
              stdio: 'ignore',
            })

            launched = true
            break
          } catch {
            // Try next terminal
            continue
          }
        }

        if (!launched) {
          this.error(
            'No supported terminal emulator found. Please install gnome-terminal, konsole, or xterm.',
            {exit: EXIT_CODES.ENVIRONMENT_ERROR},
          )
        }
      }
    } catch (error) {
      const err = error as Error
      this.error(`Failed to launch terminal: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
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
  private async launchTerminalInWorktree(worktreePath: string): Promise<void> {
    const platform = process.platform

    if (platform === 'win32') {
      // Windows: Use Windows Terminal with auto-launch command
      // wt.exe -d <path> -- aiw launch (uses default profile)
      return new Promise<void>((resolve, reject) => {
        const terminal = spawn('wt', ['-d', worktreePath, '--', 'aiw', 'launch'], {
          detached: true,
          stdio: 'ignore',
        })

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
