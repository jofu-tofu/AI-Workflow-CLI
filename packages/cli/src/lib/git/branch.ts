/**
 * @file Git branch operations.
 *
 * Provides utilities for checking, getting, and deleting git branches.
 *
 * @module lib/git/branch
 */

import {execSync} from 'node:child_process'

import type {GitCommandOptions} from './types.js'

/**
 * Check if a git branch exists (local).
 *
 * @param branchName - Name of the branch to check
 * @returns True if branch exists locally
 *
 * @example
 * ```typescript
 * if (await branchExists('feature-branch')) {
 *   console.log('Branch exists')
 * }
 * ```
 */
export function branchExists(branchName: string): boolean {
  try {
    execSync(`git show-ref --verify refs/heads/${branchName}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get the current git branch name.
 *
 * @returns Current branch name
 * @throws Error if not in a git repository or unable to determine branch
 *
 * @example
 * ```typescript
 * const branch = getCurrentBranch()
 * console.log(`Currently on: ${branch}`)
 * ```
 */
export function getCurrentBranch(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    return branch
  } catch (error) {
    const err = error as Error
    throw new Error(`Failed to get current branch: ${err.message}`)
  }
}

/**
 * Determine which main branch exists (main or master).
 *
 * Returns 'main' if it exists (preferred), 'master' if it exists,
 * or null if neither exists.
 *
 * @returns 'main', 'master', or null
 *
 * @example
 * ```typescript
 * const mainBranch = getMainBranch()
 * if (mainBranch) {
 *   console.log(`Main branch: ${mainBranch}`)
 * }
 * ```
 */
export function getMainBranch(): null | string {
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
 * Delete a git branch (local and remote if exists).
 *
 * @param branchName - Name of the branch to delete
 * @param options - Command options including debug logging
 * @throws Error if unable to delete branch
 *
 * @example
 * ```typescript
 * await deleteBranch('feature-branch', {
 *   debugLog: (msg) => console.debug(msg)
 * })
 * ```
 */
export function deleteBranch(branchName: string, options?: GitCommandOptions): void {
  const {debugLog} = options || {}

  // Platform-specific branch name escaping
  const escapedBranch =
    process.platform === 'win32'
      ? `"${branchName.replaceAll('"', String.raw`\"`)}"`  // Windows: double quotes
      : `'${branchName.replaceAll('\'', String.raw`'\''`)}'`  // Unix/macOS: single quotes

  // Delete local branch
  debugLog?.(`Deleting local branch '${branchName}'...`)
  try {
    execSync(`git branch -D ${escapedBranch}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    const err = error as Error
    // If branch doesn't exist (orphaned worktree), that's fine - just log it
    if (err.message?.includes('not found')) {
      debugLog?.(`Branch '${branchName}' not found (orphaned worktree)`)
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
    debugLog?.(`Deleting remote branch '${branchName}'...`)
    execSync(`git push origin --delete ${escapedBranch}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    // Remote branch doesn't exist, skip deletion
    debugLog?.('No remote branch to delete')
  }
}
