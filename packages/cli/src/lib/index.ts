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
export {debug, debugConfig, debugSpawn, debugVersion, isDebugEnabled, setDebugEnabled} from './debug.js'

// Environment variable compatibility
export {
  getAiwConfig,
  getAiwDir as getAiwDirFromEnv,
  isUsingLegacyEnvVars,
  loadEnvWithCompatibility,
} from './env-compat.js'

// Custom error classes and utilities
export {
  AiwError,
  ConfigNotFoundError,
  EnvironmentError,
  formatErrorMessage,
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
  expandPath,
  findWorkspaceRoot,
  getHomePath,
  getWorkspacePath,
  isWorkspace,
  normalizePath,
  pathExists,
  resolvePath,
  toUnixPath,
  toWindowsPath,
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
