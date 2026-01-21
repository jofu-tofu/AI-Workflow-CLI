/**
 * @file Git utilities module.
 *
 * Provides reusable git operations for branch, worktree, and safety checks.
 *
 * @module lib/git
 */

// Branch operations
export {branchExists, deleteBranch, getCurrentBranch, getMainBranch} from './branch.js'

// Safety checks
export {hasMergeRequest, hasUnpushedCommits} from './safety-checks.js'

// Types
export type {GitCommandOptions, WorktreeInfo} from './types.js'

// Worktree operations
export {createWorktree, deleteWorktreeFolder, getAllWorktrees, getWorktreePath} from './worktree.js'
