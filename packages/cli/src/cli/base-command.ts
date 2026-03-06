import {Command, Flags} from '@oclif/core'
import {type Ora} from 'ora'

import {debugVersion, setDebugEnabled} from '../lib/debug.js'
import {logDebug, logError, logInfo, logSuccess, logWarning} from '../lib/output.js'
import {isQuietMode, setQuietMode} from '../lib/quiet.js'
import {createSpinner} from '../lib/spinner.js'

export default abstract class BaseCommand extends Command {
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

    if (debugEnabled) {
      debugVersion()
    }
  }

  protected isQuiet(): boolean {
    return isQuietMode()
  }

  protected logDebug(message: string): void {
    logDebug(message)
  }

  protected logError(message: string): void {
    logError(message)
  }

  protected logInfo(message: string): void {
    logInfo(message, this.isQuiet())
  }

  protected logSuccess(message: string): void {
    logSuccess(message, this.isQuiet())
  }

  protected logWarning(message: string): void {
    logWarning(message, this.isQuiet())
  }

  abstract override run(): Promise<void>

  protected spinner(text: string): Ora {
    return createSpinner(text, {quiet: isQuietMode()})
  }
}
