#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {execute} from '@oclif/core'

// Handle default command: inject 'launch' when no command is specified
// but preserve --help and --version behavior for general CLI help
const args = process.argv.slice(2)
const firstArg = args[0] ?? ''
const hasCommand = args.length > 0 && !firstArg.startsWith('-')
const isHelpOrVersion = firstArg === '--help' || firstArg === '-h' || firstArg === '--version'

await execute({
  development: true,
  dir: import.meta.url,
  args: hasCommand || isHelpOrVersion ? args : ['launch', ...args],
})
