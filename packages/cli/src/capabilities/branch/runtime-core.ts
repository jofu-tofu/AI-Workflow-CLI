import {basename, dirname, resolve} from 'node:path'

import type {BranchCommandRequest} from './contracts.js'
import {EXIT_CODES} from '../../types/index.js'


export type BranchMode = 'delete' | 'delete-all' | 'launch' | 'main'

const VALID_BRANCH_NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/

export function determineBranchMode(request: BranchCommandRequest): BranchMode {
  const {args, flags} = request

  if (!flags.main && !flags.launch && !flags.delete) {
    if (args.branchName) {
      return 'launch'
    }

    throw usageFailure(
      'Either provide a branch name directly (aiw branch <name>) or use --main, --launch, or --delete',
    )
  }

  if (flags.main) return 'main'
  if (flags.launch) return 'launch'
  if (flags.delete && flags.all) return 'delete-all'
  return 'delete'
}

export function validateLaunchBranchName(branchName: string | undefined): string {
  if (!branchName || branchName.trim().length === 0) {
    throw usageFailure('Branch name is required. Usage: aiw branch <name> or aiw branch --launch <name>')
  }

  if (!VALID_BRANCH_NAME_PATTERN.test(branchName)) {
    throw usageFailure(
      'Branch name contains invalid characters. Use only letters, numbers, dots, dashes, underscores, and slashes.',
    )
  }

  return branchName
}

export function deriveWorktreePath(cwd: string, branchName: string): string {
  const currentDirName = basename(cwd)
  const parentDir = dirname(cwd)
  return resolve(parentDir, `${currentDirName}-${branchName}`)
}

function usageFailure(message: string): Error & {exit: number} {
  return Object.assign(new Error(message), {exit: EXIT_CODES.INVALID_USAGE})
}
