import {execSync, spawn} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'
import clipboardy from 'clipboardy'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Manage git branch operations: launch in main/master or delete branch and worktree.
 *
 * This command supports two modes:
 * 1. --main: Opens a new terminal window with `aiw launch` running in the main/master branch
 * 2. --delete: Deletes a git branch and its worktree folder
 */
export default class BranchCommand extends BaseCommand {
  static override args = {
    branchName: Args.string({
      description: 'Name of the branch for worktree creation or deletion',
      required: false,
    }),
  }

  static override description =
    'Manage git branches with worktree support or launch in main/master\n\n' +
    'MODES\n' +
    '  --main/-m: Launch aiw in main/master branch in new terminal\n' +
    '  --launch/-l <branch>: Create/open git worktree in sibling folder\n' +
    '  --delete/-d <branch>: Delete git branch and worktree folder\n\n' +
    'REQUIREMENTS\n' +
    '  • Must be in a git repository\n' +
    '  • For --main: Must be on a branch (not already on main/master)\n' +
    '  • For --main: main or master branch must exist\n' +
    '  • For --delete: Must not be in the branch being deleted\n\n' +
    'EXIT CODES\n' +
    '  0  Success - Operation completed\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - requirements not met\n' +
    '  3  Environment error - git not found or not a git repository'
static override examples = [
    '<%= config.bin %> <%= command.id %> --main',
    '<%= config.bin %> <%= command.id %> --main --debug  # Enable verbose logging',
    '<%= config.bin %> <%= command.id %> --launch feature-name',
    '<%= config.bin %> <%= command.id %> -l fix-bug-123',
    '<%= config.bin %> <%= command.id %> --delete feature-branch',
    '<%= config.bin %> <%= command.id %> -d fix-bug-123',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    main: Flags.boolean({
      char: 'm',
      description: 'Launch aiw in main/master branch in new terminal',
      exclusive: ['launch', 'delete'],
    }),
    launch: Flags.boolean({
      char: 'l',
      description: 'Create git worktree in sibling folder or open if exists',
      exclusive: ['main', 'delete'],
    }),
    delete: Flags.boolean({
      char: 'd',
      description: 'Delete git branch and worktree folder',
      exclusive: ['main', 'launch'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchCommand)

    // Validate that one of the flags is provided
    if (!flags.main && !flags.launch && !flags.delete) {
      this.error('Either --main, --launch, or --delete flag is required', {exit: EXIT_CODES.INVALID_USAGE})
    }

    // Route to appropriate handler
    if (flags.main) {
      await this.handleMainBranch()
    } else if (flags.launch) {
      await this.handleWorktreeLaunch(args.branchName)
    } else if (flags.delete) {
      await this.handleDelete(args.branchName)
    }
  }

  /**
   * Check if a git branch exists (local or remote)
   */
  private async branchExists(branchName: string): Promise<boolean> {
    try {
      // Check local branches
      execSync(`git show-ref --verify refs/heads/${branchName}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return true
    } catch {
      // Local branch doesn't exist
      return false
    }
  }

  /**
   * Delete a git branch (local and remote if exists)
   */
  private async deleteBranch(branchName: string): Promise<void> {
    try {
      // Escape branch name to prevent command injection
      const escapedBranch = branchName.replaceAll('\'', String.raw`'\''`)

      // Delete local branch
      this.debug(`Deleting local branch '${branchName}'...`)
      execSync(`git branch -D '${escapedBranch}'`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Check if remote branch exists
      try {
        execSync(`git show-ref --verify refs/remotes/origin/${escapedBranch}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        // Remote branch exists, delete it
        this.debug(`Deleting remote branch '${branchName}'...`)
        execSync(`git push origin --delete '${escapedBranch}'`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        // Remote branch doesn't exist, skip deletion
        this.debug('No remote branch to delete')
      }
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to delete branch: ${err.message}`)
    }
  }

  /**
   * Delete the worktree folder and remove worktree from git
   */
  private async deleteWorktreeFolder(worktreePath: string): Promise<void> {
    try {
      // First, remove the worktree from git
      this.debug(`Removing worktree from git: ${worktreePath}`)
      const escapedPath = worktreePath.replaceAll('\'', String.raw`'\''`)
      execSync(`git worktree remove '${escapedPath}' --force`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Then delete the folder if it still exists
      try {
        await fs.access(worktreePath)
        this.debug(`Deleting folder: ${worktreePath}`)
        await fs.rm(worktreePath, {recursive: true, force: true})
      } catch {
        // Folder doesn't exist or already deleted by git worktree remove
        this.debug('Folder already deleted')
      }
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to delete worktree folder: ${err.message}`)
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
  private async getMainBranch(): Promise<null | string> {
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
   * Get the worktree path for a branch
   * Returns null if no worktree exists for this branch
   */
  private async getWorktreePath(branchName: string): Promise<null | string> {
    try {
      const output = execSync('git worktree list --porcelain', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Parse worktree list output
      // Format:
      // worktree /path/to/worktree
      // HEAD <commit-hash>
      // branch refs/heads/branchname
      const lines = output.split('\n')
      let currentWorktreePath: null | string = null

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentWorktreePath = line.slice('worktree '.length).trim()
        } else if (line.startsWith('branch ')) {
          const branchRef = line.slice('branch '.length).trim()
          if (branchRef === `refs/heads/${branchName}` && currentWorktreePath) {
            return currentWorktreePath
          }
        } else if (line === '') {
          // Reset for next worktree entry
          currentWorktreePath = null
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Handle --delete flag: Delete git branch and worktree folder
   */
  private async handleDelete(branchName: string | undefined): Promise<void> {
    try {
      // Validate branch name is provided
      if (!branchName) {
        this.error('Branch name is required with --delete flag\n\nUsage: aiw branch --delete <branchName>', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

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

      // Check 2: Prevent deletion of main/master branches
      if (branchName === 'main' || branchName === 'master') {
        this.error(`Cannot delete ${branchName} branch. This is a protected branch.`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      // Check 3: Verify the branch exists
      this.debug(`Checking if branch '${branchName}' exists...`)
      const branchExists = await this.branchExists(branchName)
      if (!branchExists) {
        this.error(`Branch '${branchName}' does not exist.`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      this.debug(`✓ Branch '${branchName}' exists`)

      // Check 4: Get current branch to verify we're not on the branch being deleted
      this.debug('Getting current branch name...')
      const currentBranch = await this.getCurrentBranch()
      this.debug(`Current branch: ${currentBranch}`)

      if (currentBranch === branchName) {
        this.error(
          `Cannot delete branch '${branchName}' because you are currently on it.\n\n` +
            `Please switch to a different directory first.\n\n` +
            `Suggestion: 'aiw branch --main' has been copied to your clipboard.`,
          {exit: EXIT_CODES.INVALID_USAGE},
        )

        // Copy suggestion to clipboard
        try {
          await clipboardy.write('aiw branch --main')
          this.debug('✓ Copied "aiw branch --main" to clipboard')
        } catch (clipboardError) {
          this.debug('Failed to copy to clipboard:', clipboardError)
        }

        return
      }

      this.debug(`✓ Not currently on branch '${branchName}'`)

      // Check 5: Find the worktree path for this branch
      this.debug(`Finding worktree path for branch '${branchName}'...`)
      const worktreePath = await this.getWorktreePath(branchName)

      // Delete the git branch
      this.logInfo(`Deleting git branch '${branchName}'...`)
      await this.deleteBranch(branchName)
      this.debug(`✓ Git branch '${branchName}' deleted`)

      // Delete the worktree folder if it exists
      if (worktreePath) {
        this.logInfo(`Deleting worktree folder at ${worktreePath}...`)
        await this.deleteWorktreeFolder(worktreePath)
        this.debug(`✓ Worktree folder deleted`)
      } else {
        this.debug('No worktree folder found for this branch')
      }

      this.logSuccess(`✓ Branch '${branchName}' and its worktree have been deleted`)
    } catch (error) {
      const err = error as Error

      // Check if error is already handled by this.error() calls above
      if (err.message?.includes('EEXIT')) {
        throw error
      }

      // Handle unexpected errors
      this.error(`Failed to delete branch: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
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
   * Launch a new terminal window with aiw launch in the specified branch
   */
  private async launchTerminalWithAiw(cwd: string, branch: string): Promise<void> {
    const {platform} = process

    try {
      if (platform === 'win32') {
        // Windows: Use PowerShell to open new terminal
        // Command: cd to directory, checkout branch, run aiw launch
        const escapedCwd = cwd.replaceAll('\'', "''")
        const escapedBranch = branch.replaceAll('\'', "''")
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
        const escapedCwd = cwd.replaceAll('\'', String.raw`'\''`)
        const escapedBranch = branch.replaceAll('\'', String.raw`'\''`)
        const command = `cd '${escapedCwd}' && git checkout '${escapedBranch}' && aiw launch`
        // Escape double quotes and backslashes for AppleScript context
        const escapedCommand = command.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)
        const osascript = `osascript -e 'tell application "Terminal" to do script "${escapedCommand}"'`

        this.debug(`Launching macOS terminal with command: ${osascript}`)
        execSync(osascript, {stdio: 'ignore'})
      } else {
        // Linux/Unix: Try common terminal emulators
        // Escape single quotes in cwd and branch for bash shell
        const escapedCwd = cwd.replaceAll('\'', String.raw`'\''`)
        const escapedBranch = branch.replaceAll('\'', String.raw`'\''`)
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
      // Windows: Use Windows Terminal with PowerShell 7 (pwsh) if available, fallback to PowerShell 5.1
      // Try pwsh first (PowerShell 7), which is commonly the default Windows Terminal profile
      return new Promise<void>((resolve, reject) => {
        // Detect which PowerShell to use
        let powershellCmd = 'pwsh' // Try PowerShell 7 first
        try {
          execSync('where pwsh', {stdio: 'ignore'})
        } catch {
          // pwsh not found, use legacy PowerShell
          powershellCmd = 'powershell'
        }

        const terminal = spawn('wt', ['-d', worktreePath, powershellCmd, '-NoExit', '-Command', 'aiw launch'], {
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
