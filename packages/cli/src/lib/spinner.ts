/**
 * Spinner Utilities
 *
 * Provides TTY-aware spinner wrapper using ora library.
 * Spinners automatically disable in non-TTY contexts (piped, redirected, CI).
 */

import ora, {type Ora} from 'ora'

import {shouldShowSpinners} from './tty-detection.js'

/**
 * Create a TTY-aware spinner.
 * Automatically disables in non-TTY contexts (piped, redirected, CI, quiet mode).
 */
export function createSpinner(text: string, flags?: {quiet?: boolean}): Ora {
  return ora({
    isEnabled: shouldShowSpinners(flags),
    text,
  })
}

/**
 * Helper for common "loading" operations with spinner.
 * Automatically handles success/failure and cleanup.
 */
export async function withSpinner<T>(text: string, operation: () => Promise<T>): Promise<T> {
  const spinner = createSpinner(text).start()

  try {
    const result = await operation()
    spinner.succeed()
    return result
  } catch (error) {
    spinner.fail()
    throw error
  }
}
