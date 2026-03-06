import {join, resolve} from 'node:path'


import type {BranchCommandDependencies, BranchCommandLogger, BranchCommandRequest} from './contracts.js'
import {deriveWorktreePath, determineBranchMode, validateLaunchBranchName} from './runtime-core.js'
import {EXIT_CODES} from '../../types/index.js'

export async function executeBranchCommand(
  request: BranchCommandRequest,
  logger: BranchCommandLogger,
  dependencies: BranchCommandDependencies,
): Promise<void> {
  try {
    const mode = determineBranchMode(request)

    if (mode === 'main') {
      await handleMainBranch(request.cwd, logger, dependencies)
      return
    }

    if (mode === 'launch') {
      await handleWorktreeLaunch(request.cwd, request.args.branchName, logger, dependencies)
      return
    }

    if (mode === 'delete-all') {
      await handleDeleteAll(request.cwd, logger, dependencies)
      return
    }

    await handleDelete(request.cwd, request.args.branchName, logger, dependencies)
  } catch (error) {
    if (isUsageFailure(error)) {
      logger.error(error.message, {exit: error.exit})
    }

    throw error
  }
}

async function handleDelete(
  cwd: string,
  branchName: string | undefined,
  logger: BranchCommandLogger,
  dependencies: BranchCommandDependencies,
): Promise<void> {
  try {
    if (!branchName) {
      logger.error('Branch name is required with --delete flag\n\nUsage: aiw branch --delete <branchName>', {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.debug('Checking if current directory is a git repository...')
    const isGitRepo = await isGitRepository(cwd, dependencies)
    if (!isGitRepo) {
      logger.error('Not a git repository. This command only works inside a git repository.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug('✓ Git repository detected')

    if (branchName === 'main' || branchName === 'master') {
      logger.error(`Cannot delete ${branchName} branch. This is a protected branch.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.debug(`Checking if branch '${branchName}' exists...`)
    if (!dependencies.branchExists(branchName)) {
      logger.error(`Branch '${branchName}' does not exist.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.debug(`✓ Branch '${branchName}' exists`)

    logger.debug('Getting current branch name...')
    let currentBranch: string
    try {
      currentBranch = dependencies.getCurrentBranch()
    } catch (error_) {
      const error = error_ as Error
      logger.error(`Failed to get current branch: ${error.message}`, {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug(`Current branch: ${currentBranch}`)

    if (currentBranch === branchName) {
      try {
        await dependencies.copyToClipboard('aiw branch --main')
        logger.debug('✓ Copied "aiw branch --main" to clipboard')
      } catch (clipboardError) {
        logger.debug('Failed to copy to clipboard:', clipboardError)
      }

      logger.error(
        `Cannot delete branch '${branchName}' because you are currently on it.\n\n` +
          'Please switch to a different directory first.\n\n' +
          "Suggestion: 'aiw branch --main' has been copied to your clipboard.",
        {exit: EXIT_CODES.INVALID_USAGE},
      )
    }

    logger.debug(`✓ Not currently on branch '${branchName}'`)

    logger.debug(`Finding worktree path for branch '${branchName}'...`)
    const worktreePath = dependencies.getWorktreePath(branchName)

    if (worktreePath) {
      logger.logInfo(`Deleting worktree folder at ${worktreePath}...`)
      await dependencies.deleteWorktreeFolder(worktreePath, {debugLog: (message: string) => logger.debug(message)})
      logger.debug('✓ Worktree folder deleted')
    } else {
      logger.debug('No worktree folder found for this branch')
    }

    logger.logInfo(`Deleting git branch '${branchName}'...`)
    dependencies.deleteBranch(branchName, {debugLog: (message) => logger.debug(message)})
    logger.debug(`✓ Git branch '${branchName}' deleted`)

    logger.logSuccess(`✓ Branch '${branchName}' and its worktree have been deleted`)
  } catch (error) {
    const err = error as Error
    if (err.message?.includes('EEXIT')) throw error

    logger.error(`Failed to delete branch: ${err.message}`, {
      exit: EXIT_CODES.GENERAL_ERROR,
    })
  }
}

async function handleDeleteAll(
  cwd: string,
  logger: BranchCommandLogger,
  dependencies: BranchCommandDependencies,
): Promise<void> {
  try {
    logger.debug('Checking if current directory is a git repository...')
    const isGitRepo = await isGitRepository(cwd, dependencies)
    if (!isGitRepo) {
      logger.error('Not a git repository. This command only works inside a git repository.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug('✓ Git repository detected')
    logger.logInfo('Scanning all worktrees in repository...')
    const allWorktrees = dependencies.getAllWorktrees()
    logger.debug(`Found ${allWorktrees.length} worktrees`)

    const deleted: Array<{branch: null | string; path: string; reason?: string}> = []
    const preserved: Array<{branch: null | string; path: string; reason: string}> = []
    const candidatesForAsyncCheck: Array<{branch: string; path: string}> = []
    const normalizedCwd = resolve(cwd)

    for (const worktree of allWorktrees) {
      const {branch, path} = worktree

      if (!branch) {
        logger.debug(`Skipping worktree at ${path} (detached HEAD)`)
        preserved.push({branch, path, reason: 'detached HEAD'})
        continue
      }

      if (branch === 'main' || branch === 'master') {
        logger.debug(`Skipping protected branch: ${branch}`)
        preserved.push({branch, path, reason: 'protected branch (main/master)'})
        continue
      }

      if (normalizedCwd === resolve(path)) {
        logger.debug(`Skipping current directory worktree: ${path}`)
        preserved.push({branch, path, reason: 'current directory (cannot delete while inside)'})
        continue
      }

      candidatesForAsyncCheck.push({branch, path})
    }

    logger.debug(`Running safety checks on ${candidatesForAsyncCheck.length} candidates in parallel...`)
    const debugLog = (message: string) => logger.debug(message)
    const safetyCheckResults = await Promise.all(
      candidatesForAsyncCheck.map(async ({branch, path}) => {
        logger.debug(`Checking safety for branch '${branch}'...`)

        if (dependencies.hasUnpushedCommits(branch, {debugLog})) {
          logger.debug(`Branch '${branch}' has unpushed commits, skipping`)
          return {branch, path, safe: false, reason: 'has unpushed commits'}
        }

        if (dependencies.hasMergeRequest(branch, {debugLog})) {
          logger.debug(`Branch '${branch}' has an open PR, skipping`)
          return {branch, path, safe: false, reason: 'has open pull request'}
        }

        logger.debug(`Branch '${branch}' is safe to delete`)
        return {branch, path, safe: true, reason: null}
      }),
    )

    const safeToDelete = safetyCheckResults.filter((result) => result.safe)
    const unsafe = safetyCheckResults.filter((result) => !result.safe)

    for (const {branch, path, reason} of unsafe) {
      preserved.push({branch, path, reason: reason!})
    }

    for (const {branch, path} of safeToDelete) {
      try {
        // Sequential deletion required: worktree must be deleted before branch.
        // eslint-disable-next-line no-await-in-loop
        await dependencies.deleteWorktreeFolder(path, {debugLog})
        dependencies.deleteBranch(branch, {debugLog})
        deleted.push({branch, path})
        logger.debug(`✓ Deleted branch '${branch}' and worktree at ${path}`)
      } catch (error) {
        const err = error as Error
        logger.debug(`Failed to delete branch '${branch}': ${err.message}`)
        preserved.push({branch, path, reason: `deletion failed: ${err.message}`})
      }
    }

    logger.log('')
    logger.logSuccess('✓ Worktree cleanup complete')
    logger.log('')

    if (deleted.length > 0) {
      logger.logInfo(`Deleted ${deleted.length} worktree${deleted.length === 1 ? '' : 's'}:`)
      for (const {branch, path} of deleted) {
        logger.log(`  - ${branch} (${path})`)
      }

      logger.log('')
    } else {
      logger.logInfo('No worktrees were deleted.')
      logger.log('')
    }

    if (preserved.length > 0) {
      logger.logInfo(`Preserved ${preserved.length} worktree${preserved.length === 1 ? '' : 's'}:`)
      for (const {branch, path, reason} of preserved) {
        logger.log(`  - ${branch ?? 'detached'} (${path})`)
        logger.log(`    Reason: ${reason}`)
      }
    }
  } catch (error) {
    const err = error as Error
    if (err.message?.includes('EEXIT')) throw error

    logger.error(`Failed to clean up worktrees: ${err.message}`, {
      exit: EXIT_CODES.GENERAL_ERROR,
    })
  }
}

async function handleMainBranch(
  cwd: string,
  logger: BranchCommandLogger,
  dependencies: BranchCommandDependencies,
): Promise<void> {
  try {
    logger.debug('Checking if current directory is a git repository...')
    const isGitRepo = await isGitRepository(cwd, dependencies)
    if (!isGitRepo) {
      logger.error('Not a git repository. This command only works inside a git repository.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug('✓ Git repository detected')
    logger.debug('Getting current branch name...')
    let currentBranch: string
    try {
      currentBranch = dependencies.getCurrentBranch()
    } catch (error_) {
      const error = error_ as Error
      logger.error(`Failed to get current branch: ${error.message}`, {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug(`Current branch: ${currentBranch}`)

    if (currentBranch === 'main' || currentBranch === 'master') {
      logger.error(`Already on ${currentBranch} branch. This command is for switching to main/master from another branch.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.debug('✓ Currently on a feature branch')
    logger.debug('Checking which main branch exists...')
    const mainBranch = dependencies.getMainBranch()

    if (!mainBranch) {
      logger.error('Neither "main" nor "master" branch exists in this repository.', {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.debug(`✓ Found main branch: ${mainBranch}`)
    logger.debug(`Finding worktree path for ${mainBranch} branch...`)
    const mainBranchPath = dependencies.getWorktreePath(mainBranch)

    if (!mainBranchPath) {
      logger.error(`Could not find worktree for ${mainBranch} branch.`, {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    logger.debug(`✓ Found ${mainBranch} worktree at: ${mainBranchPath}`)
    logger.logInfo(`Opening new terminal with aiw launch in ${mainBranch} branch...`)
    const result = await dependencies.launchTerminal({
      command: 'aiw launch',
      cwd: mainBranchPath,
      debugLog: (message: string) => logger.debug(message),
    })

    if (!result.success) {
      logger.error(`Failed to launch terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
    }

    logger.logSuccess(`✓ New terminal launched with aiw in ${mainBranch} branch`)
  } catch (error) {
    const err = error as Error
    if (err.message?.includes('EEXIT')) throw error

    logger.error(`Failed to launch terminal: ${err.message}`, {
      exit: EXIT_CODES.GENERAL_ERROR,
    })
  }
}

async function handleWorktreeLaunch(
  cwd: string,
  branchName: string | undefined,
  logger: BranchCommandLogger,
  dependencies: BranchCommandDependencies,
): Promise<void> {
  const validatedBranchName = validateLaunchBranchName(branchName)

  try {
    const isGitRepo = await isGitRepository(cwd, dependencies)
    if (!isGitRepo) {
      logger.error('Not a git repository. This command only works inside a git repository.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    const worktreePath = deriveWorktreePath(cwd, validatedBranchName)

    logger.debug(`Checking for existing worktree at: ${worktreePath}`)

    let worktreeExists = false
    try {
      await dependencies.access(worktreePath)
      worktreeExists = true
      logger.logInfo(`Worktree already exists at: ${worktreePath}`)
      logger.logInfo('Opening terminal in existing worktree...')
    } catch {
      logger.logInfo(`Creating worktree for branch: ${validatedBranchName}`)
      logger.logInfo(`Worktree location: ${worktreePath}`)
    }

    if (!worktreeExists) {
      await dependencies.createWorktree(validatedBranchName, worktreePath)
      logger.logSuccess(`✓ Created worktree at ${worktreePath}`)
      logger.logSuccess(`✓ Created and checked out branch: ${validatedBranchName}`)
    }

    const result = await dependencies.launchTerminal({
      command: 'aiw launch',
      cwd: worktreePath,
      debugLog: (message: string) => logger.debug(message),
    })

    if (!result.success) {
      logger.error(`Failed to launch terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
    }

    logger.logSuccess('✓ Launched terminal with aiw launch')
    logger.log('')
    logger.logInfo('New terminal window opened at worktree location.')
    logger.logInfo('Claude Code should be launching automatically.')
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {code?: string; stderr?: string}
    if (err.message?.includes('EEXIT')) throw error

    if (err.message?.includes('already exists')) {
      logger.error(`Branch '${validatedBranchName}' already exists. Choose a different name.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    if (err.stderr?.includes('fatal: not a git repository')) {
      logger.error('Not a git repository. Please run this command from a git repository root.', {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    logger.error(`Failed to create/open worktree: ${err.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
  }
}

async function isGitRepository(cwd: string, dependencies: BranchCommandDependencies): Promise<boolean> {
  try {
    await dependencies.access(join(cwd, '.git'))
    return true
  } catch {
    return false
  }
}

function isUsageFailure(error: unknown): error is {exit: number; message: string} {
  return typeof error === 'object'
    && error !== null
    && 'exit' in error
    && 'message' in error
    && typeof (error as {exit: unknown}).exit === 'number'
    && typeof (error as {message: unknown}).message === 'string'
}
