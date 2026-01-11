#!/usr/bin/env node

// Load environment variable compatibility layer first
import('../dist/lib/env-compat.js').then(({loadEnvWithCompatibility}) => {
  loadEnvWithCompatibility()
})

import {execute} from '@oclif/core'

await execute({dir: import.meta.url})
