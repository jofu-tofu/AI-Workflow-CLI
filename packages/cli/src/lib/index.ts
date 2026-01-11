/**
 * Shared library code for AI Workflow CLI.
 * Re-exports all library modules from this barrel file.
 */

// Configuration resolution
export {
  getAiwcliHomeDir,
  loadConfig,
  type AiwcliConfig,
  validateAiwcliHome,
  // Legacy exports (deprecated)
  getPaiHome,
  type PaiConfig,
  validatePaiHome,
} from './config.js'

// Debug logging
export {debug, debugConfig, debugSpawn, debugVersion, isDebugEnabled, setDebugEnabled} from './debug.js'

// Environment variable compatibility
export {
  getAiwcliConfig,
  getAiwcliDir,
  getAiwcliHome,
  isUsingLegacyEnvVars,
  loadEnvWithCompatibility,
} from './env-compat.js'

// Custom error classes and utilities
export {
  ConfigNotFoundError,
  EnvironmentError,
  formatErrorMessage,
  InvalidUsageError,
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
