import {execSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {Flags} from '@oclif/core'

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
  static override description =
    'Launch aiw in main/master branch in a new terminal window\n\n' +
    'REQUIREMENTS\n' +
    '  • Must be in a git repository\n' +
    '  • Must be on a branch (not already on main/master)\n' +
    '  • main or master branch must exist\n\n' +
    'EXIT CODES\n' +
    '  0  Success - New terminal launched with aiw\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - requirements not met\n' +
    '  3  Environment error - git not found or not a git repository'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --main',
    '<%= config.bin %> <%= command.id %> --main --debug  # Enable verbose logging',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    main: Flags.boolean({
      char: 'm',
      description: 'Launch aiw in main/master branch in new terminal',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BranchCommand)

    if (!flags.main) {
      this.error('The --main flag is required', {exit: EXIT_CODES.INVALID_USAGE})
    }

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
}
