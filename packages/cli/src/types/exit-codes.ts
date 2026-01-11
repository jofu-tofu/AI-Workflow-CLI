/**
 * Exit codes for AI Workflow CLI commands.
 * Used consistently across all commands for scripting and automation.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  ENVIRONMENT_ERROR: 3,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]
