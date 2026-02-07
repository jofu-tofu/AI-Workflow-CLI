#!/usr/bin/env node

// Load environment variable compatibility layer first
const {loadEnvWithCompatibility} = await import('../dist/lib/env-compat.js')
loadEnvWithCompatibility()

import {execute} from '@oclif/core'

// Handle default command: inject 'launch' when no command is specified
// but preserve --help and --version behavior for general CLI help
const args = process.argv.slice(2)
const firstArg = args[0] ?? ''
const hasCommand = args.length > 0 && !firstArg.startsWith('-')
const isHelpOrVersion = firstArg === '--help' || firstArg === '-h' || firstArg === '--version' || firstArg === '-v'

// Map -v to --version since oclif doesn't natively understand -v
const resolvedArgs = firstArg === '-v' ? ['--version', ...args.slice(1)] : args

await execute({
  dir: import.meta.url,
  args: hasCommand || isHelpOrVersion ? resolvedArgs : ['launch', ...resolvedArgs],
})
