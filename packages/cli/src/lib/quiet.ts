/**
 * Quiet mode state management for AI Workflow CLI.
 * Provides global quiet mode state for suppressing informational output.
 */

let quietMode = false

/**
 * Check if quiet mode is enabled.
 */
export function isQuietMode(): boolean {
  return quietMode
}

/**
 * Enable or disable quiet mode.
 */
export function setQuietMode(enabled: boolean): void {
  quietMode = enabled
}
