import {debug} from '../../lib/debug.js'
import BaseCommand from '../base.js'

export default class World extends BaseCommand {
  static override args = {}
  static override description = 'Say hello world'
  static override examples = [
    `<%= config.bin %> <%= command.id %>
hello world! (./src/commands/hello/world.ts)
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
  }

  async run(): Promise<void> {
    await this.parse(World)
    // Note: debugVersion() is now called automatically by BaseCommand.init()
    debug('Executing hello world command')
    this.log('hello world! (./src/commands/hello/world.ts)')
  }
}
