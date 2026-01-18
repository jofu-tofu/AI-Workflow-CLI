/**
 * TTY Detection Utilities
 *
 * Provides cross-platform TTY detection for controlling color output and spinners.
 * Respects NO_COLOR and FORCE_COLOR environment variables per standard conventions.
 */

import {isQuietMode as getQuietMode} from './quiet.js'

/**
 * Minimal interface for process-like objects used in TTY detection.
 * Allows dependency injection for testing without mutating Node's process global.
 */
export interface ProcessLike {
  env?: NodeJS.ProcessEnv
  stderr?: {isTTY?: boolean | undefined}
  stdout: {isTTY?: boolean | undefined}
}

/**
 * Check if stdout is a TTY (terminal).
 * Returns true for interactive terminal, false for piped/redirected output.
 * @param proc - Optional process-like object for testing (defaults to global process)
 */
export function isTTY(proc: ProcessLike = process): boolean {
  return proc.stdout.isTTY === true
}

/**
 * Check if stderr is a TTY (terminal).
 * Useful for determining if error output should use colors.
 * @param proc - Optional process-like object for testing (defaults to global process)
 */
export function isStderrTTY(proc: ProcessLike = process): boolean {
  return proc.stderr?.isTTY === true
}

/**
 * Determine if colors should be used in output.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 *
 * Priority:
 * 1. NO_COLOR (if set, always disable)
 * 2. FORCE_COLOR (if set, use level 0-3)
 * 3. TTY detection (colors only in TTY)
 *
 * @param proc - Optional process-like object for testing (defaults to global process)
 */
export function shouldUseColors(proc: ProcessLike = process): boolean {
  const env = proc.env ?? process.env
  const noColor = env.NO_COLOR
  const forceColor = env.FORCE_COLOR

  // NO_COLOR takes precedence (any value disables colors)
  if (noColor !== undefined) {
    return false
  }

  // FORCE_COLOR overrides TTY detection
  if (forceColor !== undefined) {
    const level = Number.parseInt(forceColor, 10)
    return level > 0
  }

  // Default: colors only in TTY
  return isTTY(proc)
}

/**
 * Check if quiet mode is enabled from flags.
 * Quiet mode suppresses informational output (errors still shown).
 * @param flags - Optional flags object
 * @param flags.quiet - Quiet mode flag
 */
export function isQuietMode(flags?: {quiet?: boolean}): boolean {
  // If flags provided, use them directly (for testing)
  if (flags !== undefined) {
    return flags?.quiet === true
  }

  // Otherwise use module-level state
  return getQuietMode()
}

/**
 * Determine if progress spinners should be shown.
 * Spinners only make sense in interactive terminals.
 * Automatically disabled in CI environments and quiet mode.
 * @param flags - Optional flags object with quiet mode
 * @param proc - Optional process-like object for testing (defaults to global process)
 */
export function shouldShowSpinners(flags?: {quiet?: boolean}, proc: ProcessLike = process): boolean {
  const env = proc.env ?? process.env

  // Spinners disabled in CI environments
  if (env.CI) {
    return false
  }

  // Spinners disabled in quiet mode
  if (isQuietMode(flags)) {
    return false
  }

  return isTTY(proc)
}
