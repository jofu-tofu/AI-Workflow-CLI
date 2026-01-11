import {Command, Flags} from '@oclif/core'
import {type Ora} from 'ora'

import {debugVersion, setDebugEnabled} from '../lib/debug.js'
import {logDebug, logError, logInfo, logSuccess, logWarning} from '../lib/output.js'
import {isQuietMode, setQuietMode} from '../lib/quiet.js'
import {createSpinner} from '../lib/spinner.js'

/**
 * Base command class that all AI Workflow CLI commands should extend.
 * Provides global --debug flag support for verbose logging.
 *
 * @example Basic command with debug support
 * import {debug} from '../lib/debug.js'
 *
 * export default class MyCommand extends BaseCommand {
 *   static override flags = {
 *     ...BaseCommand.baseFlags,
 *     // command-specific flags
 *   }
 *
 *   async run() {
 *     // debug mode is already enabled if --debug flag was passed
 *     // version info is automatically logged when debug enabled
 *     debug('My debug message')
 *   }
 * }
 *
 * @example Command with spinner progress feedback
 * import {ux} from '@oclif/core'
 *
 * export default class LongCommand extends BaseCommand {
 *   async run() {
 *     // Check if output is piped (suppress spinners for piped output)
 *     const isPiped = !process.stdout.isTTY
 *
 *     if (!isPiped) {
 *       // Show spinner for long operations in interactive terminal
 *       ux.action.start('Processing')
 *       await longRunningOperation()
 *       ux.action.stop()
 *     } else {
 *       // Piped output - suppress spinner
 *       await longRunningOperation()
 *     }
 *   }
 * }
 *
 * @example Spinner with status updates
 * import {ux} from '@oclif/core'
 *
 * export default class MultiStepCommand extends BaseCommand {
 *   async run() {
 *     if (process.stdout.isTTY) {
 *       ux.action.start('Installing packages')
 *       await installPackages()
 *
 *       // Update spinner status
 *       ux.action.status = 'Configuring'
 *       await configure()
 *
 *       ux.action.stop('Done!')
 *     } else {
 *       await installPackages()
 *       await configure()
 *     }
 *   }
 * }
 */
export default abstract class BaseCommand extends Command {
  /**
   * Global flags inherited by all AI Workflow CLI commands.
   * All command classes should spread these flags into their own flag definitions:
   * `static override flags = { ...BaseCommand.baseFlags, /* command-specific flags *\/ }`
   *
   * @see Command Development Guide in README.md for usage patterns
   */
  static override baseFlags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Enable verbose debug logging',
      default: false,
    }),
    help: Flags.help({
      char: 'h',
      description: 'Show help for command',
    }),
    quiet: Flags.boolean({
      char: 'q',
      description: 'Suppress informational output (errors still shown)',
      default: false,
    }),
  }

  override async init() {
    await super.init()
    const {flags} = await this.parse(this.constructor as typeof BaseCommand)
    const debugEnabled = flags.debug ?? false
    const quietEnabled = flags.quiet ?? false

    setDebugEnabled(debugEnabled)
    setQuietMode(quietEnabled)

    // Automatically show version info in debug mode (AC4, FR24)
    if (debugEnabled) {
      debugVersion()
    }
  }

  /**
   * Check if quiet mode is enabled.
   * Returns true if --quiet/-q flag was passed.
   */
  protected isQuiet(): boolean {
    // Access via module-level state (set in init())
    return isQuietMode()
  }

  /**
   * Log debug message (stdout, dim in TTY).
   * Debug output is independent of quiet mode.
   */
  protected logDebug(message: string): void {
    logDebug(message)
  }

  /**
   * Log error message (stderr, red in TTY).
   * Errors are NEVER suppressed, even in quiet mode.
   */
  protected logError(message: string): void {
    logError(message)
  }

  /**
   * Log informational message (stdout, no color).
   * Suppressed in quiet mode.
   */
  protected logInfo(message: string): void {
    logInfo(message, this.isQuiet())
  }

  /**
   * Log success message (stdout, green in TTY).
   * Suppressed in quiet mode.
   */
  protected logSuccess(message: string): void {
    logSuccess(message, this.isQuiet())
  }

  /**
   * Log warning message (stdout, yellow in TTY).
   * Suppressed in quiet mode.
   */
  protected logWarning(message: string): void {
    logWarning(message, this.isQuiet())
  }

  // Force subclasses to implement run method
  abstract override run(): Promise<void>

  /**
   * Create a TTY-aware spinner for long-running operations.
   * Automatically disabled when output is piped, in CI environments, or in quiet mode.
   */
  protected spinner(text: string): Ora {
    return createSpinner(text, {quiet: isQuietMode()})
  }
}
