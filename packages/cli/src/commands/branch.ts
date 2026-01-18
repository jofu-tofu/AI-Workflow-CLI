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
    '  --delete/-d <branch>: Delete git branch and worktree folder\n' +
    '  --delete --all: Clean up all worktrees (soft delete, safe mode)\n\n' +
    'SOFT DELETE (--delete --all)\n' +
    '  Safely removes worktrees that meet ALL criteria:\n' +
    '  • Not main/master branch\n' +
    '  • No unpushed commits to remote\n' +
    '  • No open pull requests\n' +
    '  • Not the current working directory\n' +
    '  Outputs summary of deleted and preserved worktrees\n\n' +
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
    '<%= config.bin %> <%= command.id %> --delete --all  # Clean up all safe-to-delete worktrees',
    '<%= config.bin %> <%= command.id %> -d -a  # Same as above, using short flags',
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
    all: Flags.boolean({
      char: 'a',
      description: 'With --delete: clean up all worktrees (soft delete, skips unpushed commits and open PRs)',
      dependsOn: ['delete'],
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
    } else if (flags.delete && flags.all) {
      // Handle --delete --all: clean up all worktrees
      await this.handleDeleteAll()
    } else if (flags.delete) {
      // Handle --delete <branchName>: delete single branch
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
   * Delete a git branch (local and remote if exists)
   */
  private async deleteBranch(branchName: string): Promise<void> {
    // Platform-specific branch name escaping
    const escapedBranch = process.platform === 'win32'
      ? `"${branchName.replaceAll('"', String.raw`\"`)}"`  // Windows: double quotes
      : `'${branchName.replaceAll('\'', String.raw`'\''`)}'`  // Unix/macOS: single quotes

    // Delete local branch
    this.debug(`Deleting local branch '${branchName}'...`)
    try {
      execSync(`git branch -D ${escapedBranch}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      const err = error as Error
      // If branch doesn't exist (orphaned worktree), that's fine - just log it
      if (err.message?.includes('not found')) {
        this.debug(`Branch '${branchName}' not found (orphaned worktree)`)
        return
      }

      // For other errors, throw
      throw new Error(`Failed to delete branch: ${err.message}`)
    }

    // Check if remote branch exists
    try {
      execSync(`git show-ref --verify refs/remotes/origin/${branchName}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Remote branch exists, delete it
      this.debug(`Deleting remote branch '${branchName}'...`)
      execSync(`git push origin --delete ${escapedBranch}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      // Remote branch doesn't exist, skip deletion
      this.debug('No remote branch to delete')
    }
  }

  /**
   * Delete the worktree folder and remove worktree from git
   */
  private async deleteWorktreeFolder(worktreePath: string): Promise<void> {
    // First, try to remove the worktree from git
    this.debug(`Removing worktree from git: ${worktreePath}`)

    // Platform-specific path escaping for git commands
    const escapedPath = process.platform === 'win32'
      ? `"${worktreePath.replaceAll('"', String.raw`\"`)}"`  // Windows: double quotes
      : `'${worktreePath.replaceAll('\'', String.raw`'\''`)}'`  // Unix/macOS: single quotes

    try {
      execSync(`git worktree remove ${escapedPath} --force`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.debug('Git worktree removed successfully')
    } catch (error) {
      const err = error as Error
      // If git reports the worktree doesn't exist, that's fine - the folder might be orphaned
      // We'll still try to delete the folder below
      if (err.message?.includes('not a working tree')) {
        this.debug(`Git worktree not found (orphaned folder): ${err.message}`)
      } else {
        // For other git errors, log but continue to folder deletion
        this.debug(`Git worktree remove failed: ${err.message}`)
      }
    }

    // Always try to delete the folder if it exists
    try {
      await fs.access(worktreePath)
      this.debug(`Deleting folder: ${worktreePath}`)
      await fs.rm(worktreePath, {recursive: true, force: true})
      this.debug('Folder deleted successfully')
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      // If folder doesn't exist, that's fine
      if (err.code === 'ENOENT') {
        this.debug('Folder already deleted')
      } else {
        // For real errors (permissions, locks, etc), throw
        throw new Error(`Failed to delete worktree folder: ${err.message}`)
      }
    }
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
    return `"${arg.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)}"`
  }

  /**
   * Get all worktrees in the repository
   * Returns array of worktree info objects
   */
  private async getAllWorktrees(): Promise<Array<{branch: null | string; head: string; path: string}>> {
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
      // (blank line between entries)
      const worktrees: Array<{branch: null | string; head: string; path: string}> = []
      const lines = output.split('\n')
      let currentWorktree: null | {branch: null | string; head: string; path: string} = null

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree) {
            worktrees.push(currentWorktree)
          }

          currentWorktree = {
            branch: null,
            head: '',
            path: line.slice('worktree '.length).trim(),
          }
        } else if (line.startsWith('HEAD ')) {
          if (currentWorktree) {
            currentWorktree.head = line.slice('HEAD '.length).trim()
          }
        } else if (line.startsWith('branch ')) {
          if (currentWorktree) {
            const branchRef = line.slice('branch '.length).trim()
            // Extract branch name from refs/heads/branchname
            currentWorktree.branch = branchRef.replace('refs/heads/', '')
          }
        } else if (line === '' && // Empty line marks end of worktree entry
          currentWorktree) {
            worktrees.push(currentWorktree)
            currentWorktree = null
          }
      }

      // Push the last worktree if exists
      if (currentWorktree) {
        worktrees.push(currentWorktree)
      }

      return worktrees
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to get worktrees: ${err.message}`)
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

      // Delete the worktree folder first if it exists (must be done before deleting the branch)
      if (worktreePath) {
        this.logInfo(`Deleting worktree folder at ${worktreePath}...`)
        await this.deleteWorktreeFolder(worktreePath)
        this.debug(`✓ Worktree folder deleted`)
      } else {
        this.debug('No worktree folder found for this branch')
      }

      // Delete the git branch
      this.logInfo(`Deleting git branch '${branchName}'...`)
      await this.deleteBranch(branchName)
      this.debug(`✓ Git branch '${branchName}' deleted`)

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
   * Handle --delete --all flags: Clean up all worktrees safely
   */
  private async handleDeleteAll(): Promise<void> {
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

      // Get all worktrees
      this.logInfo('Scanning all worktrees in repository...')
      const allWorktrees = await this.getAllWorktrees()
      this.debug(`Found ${allWorktrees.length} worktrees`)

      // Track results
      const deleted: Array<{branch: null | string; path: string; reason?: string}> = []
      const preserved: Array<{branch: null | string; path: string; reason: string}> = []

      // Phase 1: Synchronous filtering
      const candidatesForAsyncCheck: Array<{branch: string; path: string}> = []
      const normalizedCwd = resolve(cwd)

      for (const worktree of allWorktrees) {
        const {branch, path} = worktree

        // Skip if no branch (detached HEAD)
        if (!branch) {
          this.debug(`Skipping worktree at ${path} (detached HEAD)`)
          preserved.push({branch, path, reason: 'detached HEAD'})
          continue
        }

        // Skip main/master branches
        if (branch === 'main' || branch === 'master') {
          this.debug(`Skipping protected branch: ${branch}`)
          preserved.push({branch, path, reason: 'protected branch (main/master)'})
          continue
        }

        // Check if this is the current directory
        const normalizedPath = resolve(path)
        if (normalizedCwd === normalizedPath) {
          this.debug(`Skipping current directory worktree: ${path}`)
          preserved.push({branch, path, reason: 'current directory (cannot delete while inside)'})
          continue
        }

        // Passed synchronous checks, add to async check candidates
        candidatesForAsyncCheck.push({branch, path})
      }

      // Phase 2: Parallel async safety checks (read-only operations)
      this.debug(`Running safety checks on ${candidatesForAsyncCheck.length} candidates in parallel...`)
      const safetyCheckResults = await Promise.all(
        candidatesForAsyncCheck.map(async ({branch, path}) => {
          this.debug(`Checking safety for branch '${branch}'...`)

          const hasUnpushed = await this.hasUnpushedCommits(branch)
          if (hasUnpushed) {
            this.debug(`Branch '${branch}' has unpushed commits, skipping`)
            return {branch, path, safe: false, reason: 'has unpushed commits'}
          }

          const hasPR = await this.hasMergeRequest(branch)
          if (hasPR) {
            this.debug(`Branch '${branch}' has an open PR, skipping`)
            return {branch, path, safe: false, reason: 'has open pull request'}
          }

          this.debug(`Branch '${branch}' is safe to delete`)
          return {branch, path, safe: true, reason: null}
        }),
      )

      // Separate safe and unsafe candidates
      const safeToDelete = safetyCheckResults.filter((r) => r.safe)
      const unsafe = safetyCheckResults.filter((r) => !r.safe)

      // Add unsafe candidates to preserved list
      for (const {branch, path, reason} of unsafe) {
        preserved.push({branch, path, reason: reason!})
      }

      // Phase 3: Sequential deletions (destructive operations must be sequential)
      for (const {branch, path} of safeToDelete) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Sequential deletion required: worktree must be deleted before branch
          await this.deleteWorktreeFolder(path)
          // eslint-disable-next-line no-await-in-loop -- Sequential deletion required: depends on worktree deletion above
          await this.deleteBranch(branch)
          deleted.push({branch, path})
          this.debug(`✓ Deleted branch '${branch}' and worktree at ${path}`)
        } catch (error) {
          const err = error as Error
          this.debug(`Failed to delete branch '${branch}': ${err.message}`)
          preserved.push({branch, path, reason: `deletion failed: ${err.message}`})
        }
      }

      // Output results
      this.log('')
      this.logSuccess('✓ Worktree cleanup complete')
      this.log('')

      if (deleted.length > 0) {
        this.logInfo(`Deleted ${deleted.length} worktree${deleted.length === 1 ? '' : 's'}:`)
        for (const {branch, path} of deleted) {
          this.log(`  - ${branch} (${path})`)
        }

        this.log('')
      } else {
        this.logInfo('No worktrees were deleted.')
        this.log('')
      }

      if (preserved.length > 0) {
        this.logInfo(`Preserved ${preserved.length} worktree${preserved.length === 1 ? '' : 's'}:`)
        for (const {branch, path, reason} of preserved) {
          this.log(`  - ${branch ?? 'detached'} (${path})`)
          this.log(`    Reason: ${reason}`)
        }
      }
    } catch (error) {
      const err = error as Error

      // Check if error is already handled by this.error() calls above
      if (err.message?.includes('EEXIT')) {
        throw error
      }

      // Handle unexpected errors
      this.error(`Failed to clean up worktrees: ${err.message}`, {
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

      // Get the worktree path for the main branch
      this.debug(`Finding worktree path for ${mainBranch} branch...`)
      const mainBranchPath = await this.getWorktreePath(mainBranch)

      if (!mainBranchPath) {
        this.error(`Could not find worktree for ${mainBranch} branch.`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      this.debug(`✓ Found ${mainBranch} worktree at: ${mainBranchPath}`)

      // Launch new terminal with aiw launch in main/master branch
      this.logInfo(`Opening new terminal with aiw launch in ${mainBranch} branch...`)
      await this.launchTerminalWithAiw(mainBranchPath)

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
   * Check if a branch has an open merge request/pull request
   * Returns true if an open PR exists for this branch
   */
  private async hasMergeRequest(branchName: string): Promise<boolean> {
    try {
      // Check if gh CLI is available
      try {
        execSync('gh --version', {
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        // gh CLI not available, can't check for PRs
        this.debug('gh CLI not available, skipping PR check')
        return false
      }

      // Check for open PRs for this branch
      const escapedBranch = branchName.replaceAll('\'', String.raw`'\''`)
      const output = execSync(`gh pr list --head '${escapedBranch}' --state open --json number`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      // Parse JSON output
      const prs = JSON.parse(output) as Array<{number: number}>
      return prs.length > 0
    } catch (error) {
      // If we can't determine, assume no PR (less conservative than unpushed commits)
      this.debug(`Error checking for PR on branch '${branchName}': ${error}`)
      return false
    }
  }

  /**
   * Check if a branch has unpushed commits
   * Returns true if there are commits not pushed to remote
   */
  private async hasUnpushedCommits(branchName: string): Promise<boolean> {
    try {
      // Check if remote branch exists first
      const escapedBranch = branchName.replaceAll('\'', String.raw`'\''`)
      try {
        execSync(`git show-ref --verify refs/remotes/origin/${escapedBranch}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        // No remote branch - treat as having unpushed commits (safer)
        this.debug(`Branch '${branchName}' has no remote tracking branch`)
        return true
      }

      // Check if there are commits ahead of remote
      const output = execSync(`git rev-list origin/${escapedBranch}..${escapedBranch} --count`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      const commitCount = Number.parseInt(output, 10)
      return commitCount > 0
    } catch (error) {
      // If we can't determine, err on the side of caution
      this.debug(`Error checking unpushed commits for '${branchName}': ${error}`)
      return true
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
   * Launch a new terminal window at the specified path with 'aiw launch' running.
   *
   * For Windows, uses Windows Terminal (wt.exe) if available, falls back to PowerShell.
   * For Unix/macOS, uses appropriate terminal emulator.
   *
   * @param worktreePath - Path where the terminal should open
   */
  private async launchTerminalInWorktree(worktreePath: string): Promise<void> {
    const {platform} = process

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
    }
 
      // Unix/macOS: Use appropriate terminal
      return new Promise<void>((resolve, _reject) => {
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

  /**
   * Launch a new terminal window with aiw launch in the specified directory
   */
  private async launchTerminalWithAiw(targetPath: string): Promise<void> {
    const {platform} = process

    try {
      if (platform === 'win32') {
        // Windows: Use PowerShell 7 (pwsh) to open new terminal
        // Detect which PowerShell to use (prefer pwsh for PowerShell 7)
        let powershellCmd = 'pwsh'
        try {
          execSync('where pwsh', {stdio: 'ignore'})
        } catch {
          // pwsh not found, use legacy PowerShell
          powershellCmd = 'powershell'
        }

        // Command: cd to directory and run aiw launch
        const escapedPath = targetPath.replaceAll('\'', "''")
        const command = `cd '${escapedPath}'; aiw launch`
        const psCommand = `Start-Process ${powershellCmd} -ArgumentList '-NoExit', '-Command', "${command}"`

        this.debug(`Launching Windows terminal with command: ${psCommand}`)
        execSync(`${powershellCmd} -Command "${psCommand}"`, {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else if (platform === 'darwin') {
        // macOS: Use Terminal.app
        // Escape single quotes for bash context
        const escapedPath = targetPath.replaceAll('\'', String.raw`'\''`)
        const command = `cd '${escapedPath}' && aiw launch`
        // Escape double quotes and backslashes for AppleScript context
        const escapedCommand = command.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`)
        const osascript = `osascript -e 'tell application "Terminal" to do script "${escapedCommand}"'`

        this.debug(`Launching macOS terminal with command: ${osascript}`)
        execSync(osascript, {stdio: 'ignore'})
      } else {
        // Linux/Unix: Try common terminal emulators
        // Escape single quotes for bash shell
        const escapedPath = targetPath.replaceAll('\'', String.raw`'\''`)
        const command = `cd '${escapedPath}' && aiw launch`

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
