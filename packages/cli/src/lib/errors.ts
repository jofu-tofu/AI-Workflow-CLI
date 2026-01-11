/**
 * @file Error handling classes and utilities for AI Workflow CLI.
 *
 * This module provides:
 * - Custom error classes with exit codes
 * - Error message formatting utilities
 * - Error handling patterns for commands
 *
 * ## Error Handling Patterns for Commands
 *
 * ### Basic Pattern (Recommended)
 * ```typescript
 * import {Command} from '@oclif/core'
 * import {ConfigNotFoundError, InvalidUsageError} from '../lib/errors.js'
 *
 * export default class LaunchCommand extends Command {
 *   async run() {
 *     try {
 *       const config = await loadConfig()
 *       await launchClaude(config)
 *     } catch (error) {
 *       if (error instanceof ConfigNotFoundError) {
 *         this.error(error.message, {exit: error.exitCode})
 *       }
 *       if (error instanceof InvalidUsageError) {
 *         this.error(error.message, {exit: error.exitCode})
 *       }
 *       this.error(`Unexpected error: ${error.message}`, {exit: EXIT_CODES.GENERAL_ERROR})
 *     }
 *   }
 * }
 * ```
 *
 * ### Using this.error() vs throwing custom errors
 * - **Throw custom errors** in library code (src/lib/) for business logic failures
 * - **Catch and translate** in commands using this.error() for user-facing output
 * - **this.error()** automatically outputs to stderr and exits with specified code
 *
 * ### Exit Code Guidelines
 * - **EXIT_CODES.SUCCESS (0)**: Command completed successfully
 * - **EXIT_CODES.GENERAL_ERROR (1)**: Unexpected errors, system failures, unhandled exceptions
 * - **EXIT_CODES.INVALID_USAGE (2)**: User provided invalid arguments, flags, or usage patterns
 * - **EXIT_CODES.ENVIRONMENT_ERROR (3)**: Missing prerequisites, config not found, environment setup issues
 *
 * @module lib/errors
 */

import {EXIT_CODES, type ExitCode} from '../types/index.js'

/**
 * Base error class for AI Workflow CLI.
 * All custom errors extend this class and include an exit code.
 *
 * @example
 * ```typescript
 * throw new PaiError('Unexpected system error occurred. Check logs for details.', EXIT_CODES.GENERAL_ERROR)
 * ```
 */
export class PaiError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode = EXIT_CODES.GENERAL_ERROR,
  ) {
    super(message)
    this.name = 'PaiError'
  }
}

/**
 * Error thrown when PAI configuration cannot be found.
 * Indicates AIWCLI_HOME is not set or points to a non-existent directory.
 * Exit code: 3 (ENVIRONMENT_ERROR)
 *
 * @example
 * ```typescript
 * throw new ConfigNotFoundError('AIWCLI_HOME not found. Set AIWCLI_HOME env var or run \'pai setup\'.')
 * ```
 */
export class ConfigNotFoundError extends PaiError {
  constructor(message: string) {
    super(message, EXIT_CODES.ENVIRONMENT_ERROR)
    this.name = 'ConfigNotFoundError'
  }
}

/**
 * Error thrown when environment prerequisites are missing.
 * Used for missing dependencies, required tools not in PATH, or system requirements not met.
 * Exit code: 3 (ENVIRONMENT_ERROR)
 *
 * @example
 * ```typescript
 * throw new EnvironmentError('Claude Code CLI not found in PATH. Install from https://claude.ai.')
 * ```
 */
export class EnvironmentError extends PaiError {
  constructor(message: string) {
    super(message, EXIT_CODES.ENVIRONMENT_ERROR)
    this.name = 'EnvironmentError'
  }
}

/**
 * Error thrown when user provides invalid arguments or usage.
 * Used for user-fixable errors like invalid flags or missing required arguments.
 * Exit code: 2 (INVALID_USAGE)
 *
 * @example
 * ```typescript
 * throw new InvalidUsageError('Invalid --format value \'xyz\'. Use \'json\' or \'text\'.')
 * ```
 */
export class InvalidUsageError extends PaiError {
  constructor(message: string) {
    super(message, EXIT_CODES.INVALID_USAGE)
    this.name = 'InvalidUsageError'
  }
}

/**
 * Error thrown when process spawning fails.
 * Used for spawn errors like ENOENT (command not found) or EACCES (permission denied).
 * Exit code: 3 (ENVIRONMENT_ERROR)
 *
 * @example
 * ```typescript
 * throw new ProcessSpawnError('Command not found: claude. Install Claude Code from https://claude.ai/download.')
 * ```
 */
export class ProcessSpawnError extends PaiError {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message, EXIT_CODES.ENVIRONMENT_ERROR)
    this.name = 'ProcessSpawnError'
  }
}

/**
 * Format error message following AI Workflow CLI convention.
 * @param what - Description of what went wrong
 * @param howToFix - Actionable steps to fix the problem
 * @returns Formatted error message in format: "{what}. {howToFix}."
 * @example
 * formatErrorMessage(
 *   'AIWCLI_HOME directory not found',
 *   'Set AIWCLI_HOME env var or run "aiwcli setup"'
 * )
 * // Returns: "AIWCLI_HOME directory not found. Set AIWCLI_HOME env var or run \"pai setup\"."
 */
export function formatErrorMessage(what: string, howToFix: string): string {
  return `${what}. ${howToFix}.`
}
