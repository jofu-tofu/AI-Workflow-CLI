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

