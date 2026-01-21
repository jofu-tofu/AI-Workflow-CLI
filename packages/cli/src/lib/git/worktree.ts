/**
 * @file Git worktree operations.
 *
 * Provides utilities for managing git worktrees.
 *
 * @module lib/git/worktree
 */

import {execSync, spawn} from 'node:child_process'
import {promises as fs} from 'node:fs'

import type {GitCommandOptions, WorktreeInfo} from './types.js'

/**
 * Get all worktrees in the repository.
 *
 * @returns Array of worktree info objects
 * @throws Error if unable to list worktrees
 *
 * @example
 * ```typescript
 * const worktrees = getAllWorktrees()
 * for (const wt of worktrees) {
 *   console.log(`${wt.branch}: ${wt.path}`)
 * }
 * ```
 */
export function getAllWorktrees(): WorktreeInfo[] {
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
    const worktrees: WorktreeInfo[] = []
    const lines = output.split('\n')
    let currentWorktree: null | WorktreeInfo = null

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
      } else if (line === '' && currentWorktree) {
        // Empty line marks end of worktree entry
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
 * Get the worktree path for a branch.
 *
 * @param branchName - Name of the branch
 * @returns Worktree path if found, null otherwise
 *
 * @example
 * ```typescript
 * const path = getWorktreePath('main')
 * if (path) {
 *   console.log(`Main branch worktree: ${path}`)
 * }
 * ```
 */
export function getWorktreePath(branchName: string): null | string {
  try {
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Parse worktree list output
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
 * Create a git worktree with the specified branch name.
 *
 * @param branchName - Name of the branch to create
 * @param worktreePath - Path where the worktree should be created
 * @returns Promise that resolves when worktree is created
 * @throws Error if unable to create worktree
 *
 * @example
 * ```typescript
 * await createWorktree('feature-branch', '/path/to/worktree')
 * ```
 */
export async function createWorktree(branchName: string, worktreePath: string): Promise<void> {
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
 * Delete a worktree folder and remove worktree from git.
 *
 * @param worktreePath - Path to the worktree to delete
 * @param options - Command options including debug logging
 * @throws Error if unable to delete worktree folder
 *
 * @example
 * ```typescript
 * await deleteWorktreeFolder('/path/to/worktree', {
 *   debugLog: (msg) => console.debug(msg)
 * })
 * ```
 */
export async function deleteWorktreeFolder(worktreePath: string, options?: GitCommandOptions): Promise<void> {
  const {debugLog} = options || {}

  // First, try to remove the worktree from git
  debugLog?.(`Removing worktree from git: ${worktreePath}`)

  // Platform-specific path escaping for git commands
  const escapedPath =
    process.platform === 'win32'
      ? `"${worktreePath.replaceAll('"', String.raw`\"`)}"`  // Windows: double quotes
      : `'${worktreePath.replaceAll('\'', String.raw`'\''`)}'`  // Unix/macOS: single quotes

  try {
    execSync(`git worktree remove ${escapedPath} --force`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    debugLog?.('Git worktree removed successfully')
  } catch (error) {
    const err = error as Error
    // If git reports the worktree doesn't exist, that's fine - the folder might be orphaned
    // We'll still try to delete the folder below
    if (err.message?.includes('not a working tree')) {
      debugLog?.(`Git worktree not found (orphaned folder): ${err.message}`)
    } else {
      // For other git errors, log but continue to folder deletion
      debugLog?.(`Git worktree remove failed: ${err.message}`)
    }
  }

  // Always try to delete the folder if it exists
  try {
    await fs.access(worktreePath)
    debugLog?.(`Deleting folder: ${worktreePath}`)
    await fs.rm(worktreePath, {recursive: true, force: true})
    debugLog?.('Folder deleted successfully')
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    // If folder doesn't exist, that's fine
    if (err.code === 'ENOENT') {
      debugLog?.('Folder already deleted')
    } else {
      // For real errors (permissions, locks, etc), throw
      throw new Error(`Failed to delete worktree folder: ${err.message}`)
    }
  }
}
