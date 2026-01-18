/**
 * Output Utilities
 *
 * Provides TTY-aware output functions with automatic color support.
 * Colors automatically disabled when output is piped or redirected.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 */

import chalk from 'chalk'

import {type ProcessLike, shouldUseColors} from './tty-detection.js'

/**
 * Dependencies for output functions.
 * Allows tests to inject mock values without mutating global state.
 */
export interface OutputDependencies {
  proc?: ProcessLike
}

/**
 * Get whether colors should be used, evaluating lazily.
 * Internal helper that checks TTY state at call time.
 */
function getUseColors(deps?: OutputDependencies): boolean {
  return shouldUseColors(deps?.proc)
}

/**
 * Log informational message (stdout, no color).
 * Suppressed in quiet mode.
 * @param message - Message to log
 * @param quiet - If true, suppress output
 */
export function logInfo(message: string, quiet = false): void {
  if (quiet) return
  console.log(message)
}

/**
 * Log success message (stdout, green in TTY).
 * Suppressed in quiet mode.
 * @param message - Message to log
 * @param quiet - If true, suppress output
 * @param deps - Optional dependencies for testing
 */
export function logSuccess(message: string, quiet = false, deps?: OutputDependencies): void {
  if (quiet) return
  const useColors = getUseColors(deps)
  const formatted = useColors ? chalk.green(message) : message
  console.log(formatted)
}

/**
 * Log error message (stderr, red in TTY).
 * NEVER suppressed - errors always output even in quiet mode.
 * @param message - Message to log
 * @param deps - Optional dependencies for testing
 */
export function logError(message: string, deps?: OutputDependencies): void {
  const useColors = getUseColors(deps)
  const formatted = useColors ? chalk.red(message) : message
  console.error(formatted)
}

/**
 * Log warning message (stdout, yellow in TTY).
 * Suppressed in quiet mode.
 * @param message - Message to log
 * @param quiet - If true, suppress output
 * @param deps - Optional dependencies for testing
 */
export function logWarning(message: string, quiet = false, deps?: OutputDependencies): void {
  if (quiet) return
  const useColors = getUseColors(deps)
  const formatted = useColors ? chalk.yellow(message) : message
  console.log(formatted)
}

/**
 * Log debug message (stdout, dim in TTY).
 * @param message - Message to log
 * @param deps - Optional dependencies for testing
 */
export function logDebug(message: string, deps?: OutputDependencies): void {
  const useColors = getUseColors(deps)
  const formatted = useColors ? chalk.dim(message) : message
  console.log(formatted)
}
