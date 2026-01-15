import {promises as fs} from 'node:fs'
import {resolve, sep} from 'node:path'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Git worktree branch management.
 *
 * Manages git worktree branches with safety checks for deletion.
 * Verifies git repository status and prevents deletion of protected branches.
 */
export default class BranchCommand extends BaseCommand {
  static override description =
    'Manage git worktree branches with safety checks\n\n' +
    'EXIT CODES\n' +
    '  0  Success - Branch cleaned successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - not a git repository or git not available'

  static override examples = [
    '<%= config.bin %> <%= command.id %> --clean feature-branch',
    '<%= config.bin %> <%= command.id %> --clean my-feature --debug',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    clean: Flags.string({
      char: 'c',
      description: 'Remove worktree and delete branch',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BranchCommand)

    if (!flags.clean) {
      this.error('Please specify a branch to clean with --clean <branch-name>', {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }

    const branchName = flags.clean

    try {
      // Check if current directory is a git repository
      await this.verifyGitRepository()

      // Check for protected branches
      this.checkProtectedBranch(branchName)

      // Verify branch exists
      await this.verifyBranchExists(branchName)

      // Get worktree information
      const worktreePath = await this.getWorktreePath(branchName)

      if (!worktreePath) {
        this.logWarning(`Branch '${branchName}' has no associated worktree.`)
        this.logInfo('Attempting to delete branch only...')
        await this.deleteBranch(branchName)
        this.logSuccess(`✓ Branch '${branchName}' deleted successfully`)
        return
      }

      // Check if user is in the worktree being deleted
      const currentDir = process.cwd()
      const isInWorktree = await this.isInDirectory(currentDir, worktreePath)

      if (isInWorktree) {
        this.logWarning(`⚠️  You are currently in the worktree directory: ${worktreePath}`)
        this.logWarning(
          '⚠️  Cannot remove worktree while you are inside it. Please change to a different directory and run this command again.',
        )
        this.error('Cannot clean branch - currently in worktree directory', {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      // Remove worktree
      this.logInfo(`Removing worktree for branch '${branchName}'...`)
      await this.removeWorktree(worktreePath)
      this.logSuccess(`✓ Worktree removed: ${worktreePath}`)

      // Delete branch
      this.logInfo(`Deleting branch '${branchName}'...`)
      await this.deleteBranch(branchName)
      this.logSuccess(`✓ Branch '${branchName}' deleted successfully`)
    } catch (error) {
      const err = error as Error & {exitCode?: number}

      // If error already has an exit code, it was thrown by this.error()
      if (err.exitCode) {
        throw err
      }

      this.error(`Failed to clean branch: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }
  }

  /**
   * Verify current directory is a git repository.
   */
  private async verifyGitRepository(): Promise<void> {
    try {
      const gitDir = resolve(process.cwd(), '.git')
      await fs.access(gitDir)
    } catch {
      this.error('Not a git repository. Please run this command from within a git repository.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }
  }

  /**
   * Check if branch is protected (master or main).
   */
  private checkProtectedBranch(branchName: string): void {
    const protectedBranches = ['master', 'main']
    if (protectedBranches.includes(branchName)) {
      this.error(`Cannot delete protected branch '${branchName}'.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }
  }

  /**
   * Verify branch exists in git repository.
   */
  private async verifyBranchExists(branchName: string): Promise<void> {
    try {
      // Use git show-ref to check if branch exists
      const {stdout, stderr} = await this.execGitCommand(['show-ref', '--verify', `refs/heads/${branchName}`])

      if (stderr && !stdout) {
        throw new Error(`Branch '${branchName}' does not exist`)
      }
    } catch {
      this.error(`Branch '${branchName}' does not exist.`, {
        exit: EXIT_CODES.INVALID_USAGE,
      })
    }
  }

  /**
   * Get worktree path for a branch.
   * Returns null if branch has no worktree.
   */
  private async getWorktreePath(branchName: string): Promise<string | null> {
    try {
      const {stdout} = await this.execGitCommand(['worktree', 'list', '--porcelain'])

      // Parse worktree list output
      const worktrees = this.parseWorktreeList(stdout)

      // Find worktree for this branch
      const worktree = worktrees.find((wt) => wt.branch === `refs/heads/${branchName}`)

      return worktree ? worktree.path : null
    } catch {
      return null
    }
  }

  /**
   * Parse git worktree list --porcelain output.
   */
  private parseWorktreeList(output: string): Array<{path: string; branch: string}> {
    const lines = output.split('\n').filter((line) => line.trim())
    const worktrees: Array<{path: string; branch: string}> = []
    let currentWorktree: {path?: string; branch?: string} = {}

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Save previous worktree if complete
        if (currentWorktree.path && currentWorktree.branch) {
          worktrees.push(currentWorktree as {path: string; branch: string})
        }

        currentWorktree = {path: line.slice('worktree '.length)}
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.slice('branch '.length)
      }
    }

    // Save last worktree
    if (currentWorktree.path && currentWorktree.branch) {
      worktrees.push(currentWorktree as {path: string; branch: string})
    }

    return worktrees
  }

  /**
   * Check if current directory is inside target directory.
   */
  private async isInDirectory(currentDir: string, targetDir: string): Promise<boolean> {
    const normalizedCurrent = resolve(currentDir)
    const normalizedTarget = resolve(targetDir)

    return normalizedCurrent === normalizedTarget || normalizedCurrent.startsWith(normalizedTarget + sep)
  }

  /**
   * Remove git worktree.
   */
  private async removeWorktree(worktreePath: string): Promise<void> {
    try {
      await this.execGitCommand(['worktree', 'remove', worktreePath, '--force'])
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to remove worktree: ${err.message}`)
    }
  }

  /**
   * Delete git branch.
   */
  private async deleteBranch(branchName: string): Promise<void> {
    try {
      // Use -D to force delete (branch might not be fully merged)
      await this.execGitCommand(['branch', '-D', branchName])
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to delete branch: ${err.message}`)
    }
  }

  /**
   * Execute git command and return output.
   */
  private async execGitCommand(args: string[]): Promise<{stdout: string; stderr: string}> {
    const {execFile} = await import('node:child_process')
    const {promisify} = await import('node:util')
    const execFileAsync = promisify(execFile)

    try {
      const result = await execFileAsync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
      })

      return {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      }
    } catch (error) {
      const err = error as {stdout?: string; stderr?: string; message: string}
      return {
        stdout: err.stdout?.trim() || '',
        stderr: err.stderr?.trim() || err.message,
      }
    }
  }
}
