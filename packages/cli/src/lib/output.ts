/**
 * Output Utilities
 *
 * Provides TTY-aware output functions with automatic color support.
 * Colors automatically disabled when output is piped or redirected.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 */

import chalk from 'chalk'

import {shouldUseColors} from './tty-detection.js'

// Configure chalk globally based on context
const useColors = shouldUseColors()
if (!useColors) {
  chalk.level = 0 // Disable all ANSI codes
}

/**
 * Log informational message (stdout, no color).
 * Suppressed in quiet mode.
 */
export function logInfo(message: string, quiet = false): void {
  if (quiet) return
  console.log(message)
}

/**
 * Log success message (stdout, green in TTY).
 * Suppressed in quiet mode.
 */
export function logSuccess(message: string, quiet = false): void {
  if (quiet) return
  const formatted = useColors ? chalk.green(message) : message
  console.log(formatted)
}

/**
 * Log error message (stderr, red in TTY).
 * NEVER suppressed - errors always output even in quiet mode.
 */
export function logError(message: string): void {
  const formatted = useColors ? chalk.red(message) : message
  console.error(formatted)
}

/**
 * Log warning message (stdout, yellow in TTY).
 * Suppressed in quiet mode.
 */
export function logWarning(message: string, quiet = false): void {
  if (quiet) return
  const formatted = useColors ? chalk.yellow(message) : message
  console.log(formatted)
}

/**
 * Log debug message (stdout, dim in TTY).
 */
export function logDebug(message: string): void {
  const formatted = useColors ? chalk.dim(message) : message
  console.log(formatted)
}
