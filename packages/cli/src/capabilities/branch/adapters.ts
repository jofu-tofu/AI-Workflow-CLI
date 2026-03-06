import {promises as fs} from 'node:fs'

import clipboardy from 'clipboardy'

import type {BranchCommandDependencies} from './contracts.js'
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
} from '../../lib/git/index.js'
import {launchTerminal} from '../../lib/terminal.js'


export function createBranchCommandDependencies(): BranchCommandDependencies {
  return {
    access: fs.access,
    branchExists,
    copyToClipboard: clipboardy.write,
    createWorktree,
    deleteBranch,
    deleteWorktreeFolder,
    getAllWorktrees,
    getCurrentBranch,
    getMainBranch,
    getWorktreePath,
    hasMergeRequest,
    hasUnpushedCommits,
    launchTerminal,
  }
}
