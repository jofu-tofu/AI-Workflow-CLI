import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

// Custom rules for AIW CLI ESM patterns
const paiCliRules = {
  rules: {
    // Enforce import extensions (ESM requirement)
    'import/extensions': ['error', 'ignorePackages', {
      js: 'always',
      ts: 'never',
    }],

    // Import ordering: builtins → external → internal → relative
    'import/order': ['error', {
      alphabetize: {
        caseInsensitive: true,
        order: 'asc',
      },
      groups: [
        'builtin',
        'external',
        'internal',
        ['parent', 'sibling', 'index'],
      ],
      'newlines-between': 'always',
    }],

    // Disable perfectionist sort plugins to avoid conflicts
    // We use import/order for imports, and prefer semantic ordering for objects
    'perfectionist/sort-imports': 'off',
    'perfectionist/sort-objects': 'off',

    // Enforce node: prefix for Node.js builtins
    'unicorn/prefer-node-protocol': 'error',

    // Allow bracket notation for env vars (required with noUncheckedIndexedAccess)
    // process.env["VAR"] is needed because process.env.VAR is unsafe with strict TS
    'dot-notation': 'off',
    '@typescript-eslint/dot-notation': 'off',
  },
}

export default [includeIgnoreFile(gitignorePath), ...oclif, paiCliRules, prettier]
