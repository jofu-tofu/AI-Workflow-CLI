import {promises as fs} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'
import clipboardy from 'clipboardy'

import BaseCommand from '../lib/base-command.js'
import {
  branchExists,
  createWorktree,
  deleteBranch,
  deleteWorktreeFolder,
  getAllWorktrees,
  getCurrentBranch,
  getMainBranch,
  getWorktreePath,
  hasMergeRequest,
  hasUnpushedCommits,
} from '../lib/git/index.js'
import {launchTerminal} from '../lib/terminal.js'
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
      if (!branchExists(branchName)) {
        this.error(`Branch '${branchName}' does not exist.`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      this.debug(`✓ Branch '${branchName}' exists`)

      // Check 4: Get current branch to verify we're not on the branch being deleted
      this.debug('Getting current branch name...')
      let currentBranch: string
      try {
        currentBranch = getCurrentBranch()
      } catch (error_) {
        const error = error_ as Error
        this.error(`Failed to get current branch: ${error.message}`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

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
      const worktreePath = getWorktreePath(branchName)

      // Delete the worktree folder first if it exists (must be done before deleting the branch)
      if (worktreePath) {
        this.logInfo(`Deleting worktree folder at ${worktreePath}...`)
        await deleteWorktreeFolder(worktreePath, {debugLog: (msg) => this.debug(msg)})
        this.debug(`✓ Worktree folder deleted`)
      } else {
        this.debug('No worktree folder found for this branch')
      }

      // Delete the git branch
      this.logInfo(`Deleting git branch '${branchName}'...`)
      deleteBranch(branchName, {debugLog: (msg) => this.debug(msg)})
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
      const allWorktrees = getAllWorktrees()
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
      const debugLog = (msg: string) => this.debug(msg)
      const safetyCheckResults = await Promise.all(
        candidatesForAsyncCheck.map(async ({branch, path}) => {
          this.debug(`Checking safety for branch '${branch}'...`)

          if (hasUnpushedCommits(branch, {debugLog})) {
            this.debug(`Branch '${branch}' has unpushed commits, skipping`)
            return {branch, path, safe: false, reason: 'has unpushed commits'}
          }

          if (hasMergeRequest(branch, {debugLog})) {
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
          await deleteWorktreeFolder(path, {debugLog})
          deleteBranch(branch, {debugLog})
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
      let currentBranch: string
      try {
        currentBranch = getCurrentBranch()
      } catch (error_) {
        const error = error_ as Error
        this.error(`Failed to get current branch: ${error.message}`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

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
      const mainBranch = getMainBranch()

      if (!mainBranch) {
        this.error('Neither "main" nor "master" branch exists in this repository.', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      this.debug(`✓ Found main branch: ${mainBranch}`)

      // Get the worktree path for the main branch
      this.debug(`Finding worktree path for ${mainBranch} branch...`)
      const mainBranchPath = getWorktreePath(mainBranch)

      if (!mainBranchPath) {
        this.error(`Could not find worktree for ${mainBranch} branch.`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      this.debug(`✓ Found ${mainBranch} worktree at: ${mainBranchPath}`)

      // Launch new terminal with aiw launch in main/master branch
      this.logInfo(`Opening new terminal with aiw launch in ${mainBranch} branch...`)
      const result = await launchTerminal({
        cwd: mainBranchPath,
        command: 'aiw launch',
        debugLog: (msg) => this.debug(msg),
      })

      if (!result.success) {
        this.error(`Failed to launch terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

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
        await createWorktree(branchName, worktreePath)
        this.logSuccess(`✓ Created worktree at ${worktreePath}`)
        this.logSuccess(`✓ Created and checked out branch: ${branchName}`)
      }

      // Launch terminal in worktree path
      const result = await launchTerminal({
        cwd: worktreePath,
        command: 'aiw launch',
        debugLog: (msg) => this.debug(msg),
      })

      if (!result.success) {
        this.error(`Failed to launch terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

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
}
