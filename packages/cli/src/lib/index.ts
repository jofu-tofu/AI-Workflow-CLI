/**
 * Shared library code for AI Workflow CLI.
 * Re-exports all library modules from this barrel file.
 */

// Configuration resolution
export {
  type AiwcliConfig,
  getAiwDir,
  getPaiHome,
  loadConfig,
  type PaiConfig,
  validateAiwDir,
  validatePaiHome,
} from './config.js'

// Debug logging
export {debug, debugConfig, debugSpawn, debugVersion, isDebugEnabled, setDebugEnabled} from './debug.js'

// Environment variable compatibility
export {
  getAiwConfig,
  getAiwDir as getAiwDirFromEnv,
  getAiwcliConfig,
  getAiwcliDir,
  getAiwcliHome,
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
  // Legacy exports (deprecated)
  PaiError,
  ProcessSpawnError,
} from './errors.js'

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
