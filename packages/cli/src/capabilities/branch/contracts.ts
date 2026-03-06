export interface BranchTerminalLaunchOptions {
  command: string
  cwd: string
  debugLog?: (message: string) => void
}

export interface BranchTerminalLaunchResult {
  error?: string
  success: boolean
}

export interface BranchCommandRequest {
  args: {
    branchName?: string | undefined
  }
  cwd: string
  flags: {
    all?: boolean | undefined
    delete?: boolean | undefined
    launch?: boolean | undefined
    main?: boolean | undefined
  }
}

export interface BranchCommandLogger {
  debug: (...args: unknown[]) => void
  error: (message: string, options?: {exit?: number | undefined}) => never
  log: (message?: string) => void
  logInfo: (message: string) => void
  logSuccess: (message: string) => void
}

export interface WorktreeRecord {
  branch: null | string
  path: string
}

export interface BranchCommandDependencies {
  access(path: string): Promise<void>
  branchExists(branchName: string): boolean
  copyToClipboard(text: string): Promise<void>
  createWorktree(branchName: string, worktreePath: string): Promise<void>
  deleteBranch(branchName: string, options?: {debugLog?: ((message: string) => void) | undefined}): void
  deleteWorktreeFolder(worktreePath: string, options?: {debugLog?: ((message: string) => void) | undefined}): Promise<void>
  getAllWorktrees(): WorktreeRecord[]
  getCurrentBranch(): string
  getMainBranch(): null | string
  getWorktreePath(branchName: string): null | string
  hasMergeRequest(branchName: string, options?: {debugLog?: ((message: string) => void) | undefined}): boolean
  hasUnpushedCommits(branchName: string, options?: {debugLog?: ((message: string) => void) | undefined}): boolean
  launchTerminal(options: BranchTerminalLaunchOptions): Promise<BranchTerminalLaunchResult>
}
