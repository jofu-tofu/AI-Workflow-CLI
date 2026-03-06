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

const boundaryOverrides = {
  files: ['src/**/*.ts'],
  rules: {
    'import/no-restricted-paths': ['error', {
      zones: [
        {
          target: './src/capabilities/*/runtime-core',
          from: './src/commands',
          message: 'Commands must go through capability control-plane modules, not runtime-core.',
        },
        {
          target: './src/capabilities/*/runtime-core',
          from: './src/cli',
          message: 'CLI helpers must go through capability control-plane modules, not runtime-core.',
        },
        {
          target: './src/capabilities/*/runtime-core',
          from: './src/cli',
          message: 'Runtime-core must not depend on CLI modules.',
        },
        {
          target: './src/capabilities/*/runtime-core',
          from: './src/platform',
          message: 'Platform adapters must not depend on capability runtime-core.',
        },
      ],
    }],
  },
}

// Template files are runtime code (executed via bun, not compiled by CLI).
// They have different conventions: snake_case for JSON fields, process.exit()
// in hooks, explicit any for dynamic hook I/O, and relative imports that
// resolve at runtime in a different directory structure.
const templateOverrides = {
  files: ['src/templates/**/*.ts'],
  rules: {
    'camelcase': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    'import/no-unresolved': 'off',
    'unicorn/import-style': 'off',
    'unicorn/filename-case': 'off',
    'unicorn/text-encoding-identifier-case': 'off',
    'unicorn/no-process-exit': 'off',
    'n/no-process-exit': 'off',
    'unicorn/prefer-number-properties': 'off',
    'unicorn/no-array-push-push': 'off',
    'unicorn/no-negated-condition': 'off',
    'unicorn/prefer-ternary': 'off',
    'unicorn/prefer-module': 'off',
    'no-await-in-loop': 'off',
    'max-params': 'off',
    'max-depth': 'off',
    'complexity': 'off',
    'prefer-destructuring': 'off',
    'jsdoc/check-param-names': 'off',
    'perfectionist/sort-interfaces': 'off',
    'perfectionist/sort-named-imports': 'off',
    'perfectionist/sort-union-types': 'off',
    'perfectionist/sort-object-types': 'off',
    '@stylistic/padding-line-between-statements': 'off',
  },
}

// Shared runtime/context library uses snake_case data contracts and
// portability-first patterns that intentionally differ from app-level style rules.
const sharedLibOverrides = {
  files: [
    'src/lib/context/**/*.ts',
    'src/lib/runtime/**/*.ts',
    'src/lib/hooks/**/*.ts',
    'src/lib/types.ts',
    'src/lib/pane-driver.ts',
    'src/lib/tmux-session.ts',
  ],
  rules: {
    'camelcase': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    'n/no-process-exit': 'off',
    'unicorn/no-process-exit': 'off',
    'unicorn/prefer-number-properties': 'off',
    'unicorn/no-array-push-push': 'off',
    'unicorn/no-negated-condition': 'off',
    'unicorn/prefer-ternary': 'off',
    'unicorn/prefer-string-raw': 'off',
    'unicorn/prefer-module': 'off',
    'no-await-in-loop': 'off',
    'max-params': 'off',
    'max-depth': 'off',
    'complexity': 'off',
    'prefer-destructuring': 'off',
    'perfectionist/sort-interfaces': 'off',
    'perfectionist/sort-named-imports': 'off',
    'perfectionist/sort-union-types': 'off',
    'perfectionist/sort-object-types': 'off',
    '@stylistic/padding-line-between-statements': 'off',
  },
}

// Test files interact with template runtime code that uses snake_case data
// contracts. They also use patterns (await-in-loop for sequential setup,
// top-level hooks) that are appropriate in tests but flagged in app code.
const testOverrides = {
  files: ['test/**/*.ts'],
  rules: {
    'arrow-body-style': 'off',
    'camelcase': 'off',
    'complexity': 'off',
    'mocha/no-top-level-hooks': 'off',
    'no-await-in-loop': 'off',
    'no-promise-executor-return': 'off',
    'no-return-await': 'off',
    '@stylistic/padding-line-between-statements': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    'perfectionist/sort-interfaces': 'off',
    'unicorn/no-array-callback-reference': 'off',
    'unicorn/no-array-reduce': 'off',
    'unicorn/no-negated-condition': 'off',
    'unicorn/no-useless-undefined': 'off',
    'unicorn/numeric-separators-style': 'off',
    'unicorn/prefer-string-raw': 'off',
  },
}

// bin/ scripts import from dist/ which doesn't exist until after build.
// Suppress import/no-unresolved for bin files since they only run post-build.
const binOverrides = {
  files: ['bin/**/*.js'],
  rules: {
    'import/no-unresolved': 'off',
  },
}

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  paiCliRules,
  boundaryOverrides,
  templateOverrides,
  sharedLibOverrides,
  testOverrides,
  binOverrides,
  prettier,
]
