/**
 * @file Git safety check operations.
 *
 * Provides utilities for checking if branches are safe to delete.
 *
 * @module lib/git/safety-checks
 */

import {execSync} from 'node:child_process'

import type {GitCommandOptions} from './types.js'

/**
 * Check if a branch has unpushed commits.
 *
 * Returns true if there are commits not pushed to remote, or if
 * the branch has no remote tracking branch (safer assumption).
 *
 * @param branchName - Name of the branch to check
 * @param options - Command options including debug logging
 * @returns True if there are unpushed commits
 *
 * @example
 * ```typescript
 * if (hasUnpushedCommits('feature-branch')) {
 *   console.log('Branch has unpushed commits, cannot delete')
 * }
 * ```
 */
export function hasUnpushedCommits(branchName: string, options?: GitCommandOptions): boolean {
  const {debugLog} = options || {}

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
      debugLog?.(`Branch '${branchName}' has no remote tracking branch`)
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
    debugLog?.(`Error checking unpushed commits for '${branchName}': ${error}`)
    return true
  }
}

/**
 * Check if a branch has an open merge request/pull request.
 *
 * Uses GitHub CLI (gh) to check for open PRs. Returns false if gh is
 * not available or if unable to check.
 *
 * @param branchName - Name of the branch to check
 * @param options - Command options including debug logging
 * @returns True if an open PR exists for this branch
 *
 * @example
 * ```typescript
 * if (hasMergeRequest('feature-branch')) {
 *   console.log('Branch has an open PR, cannot delete')
 * }
 * ```
 */
export function hasMergeRequest(branchName: string, options?: GitCommandOptions): boolean {
  const {debugLog} = options || {}

  try {
    // Check if gh CLI is available
    try {
      execSync('gh --version', {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      // gh CLI not available, can't check for PRs
      debugLog?.('gh CLI not available, skipping PR check')
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
    debugLog?.(`Error checking for PR on branch '${branchName}': ${error}`)
    return false
  }
}
