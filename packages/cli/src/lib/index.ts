/**
 * Shared library code for AI Workflow CLI.
 * Re-exports all library modules from this barrel file.
 */

// Configuration resolution
export {
  type AiwcliConfig,
  getAiwDir,
  loadConfig,
  validateAiwDir,
} from './config.js'

// Debug logging
export {debug, debugSpawn, debugVersion, isDebugEnabled, setDebugEnabled} from './debug.js'

// Custom error classes and utilities
export {
  AiwError,
  ConfigNotFoundError,
  EnvironmentError,
  InvalidUsageError,
  ProcessSpawnError,
} from './errors.js'

// Generic merge utilities
export {mergeArraysWithDedup, mergeConfigByEventType} from './generic-merge.js'

// Git utilities
export {
  branchExists,
  createWorktree,
  deleteBranch,
  deleteWorktreeFolder,
  getAllWorktrees,
  getCurrentBranch,
  getMainBranch,
  getWorktreePath,
  type GitCommandOptions,
  hasMergeRequest,
  hasUnpushedCommits,
  type WorktreeInfo,
} from './git/index.js'

// Cross-platform path utilities
export {
  findWorkspaceRoot,
  isWorkspace,
  pathExists,
  resolvePath,
} from './paths.js'

// Process spawning utilities
export {spawnProcess, type SpawnProcessOptions} from './spawn.js'

// Cross-platform terminal launching
export {
  escapeShellArg,
  launchTerminal,
  type TerminalLaunchOptions,
  type TerminalLaunchResult,
} from './terminal.js'
