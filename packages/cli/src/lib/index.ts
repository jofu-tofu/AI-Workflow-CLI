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
export {debug, isDebugEnabled, setDebugEnabled} from './debug.js'

// Custom error classes and utilities
export {
  AiwError,
  ConfigNotFoundError,
  EnvironmentError,
} from './errors.js'

// Cross-platform path utilities
export {
  isWorkspace,
  resolvePath,
} from './paths.js'
