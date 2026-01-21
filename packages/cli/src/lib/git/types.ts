/**
 * @file Git-related type definitions.
 *
 * @module lib/git/types
 */

/**
 * Information about a git worktree.
 */
export interface WorktreeInfo {
  /**
   * Branch name, or null if detached HEAD.
   */
  branch: null | string

  /**
   * Commit hash of the worktree HEAD.
   */
  head: string

  /**
   * Absolute path to the worktree directory.
   */
  path: string
}

/**
 * Options for git command execution.
 */
export interface GitCommandOptions {
  /**
   * Optional debug logging function.
   */
  debugLog?: (message: string) => void
}
