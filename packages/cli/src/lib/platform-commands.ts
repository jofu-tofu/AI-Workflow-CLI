/**
 * Platform-specific hook command adaptation.
 *
 * Claude Code on Windows uses cmd.exe to execute hook commands (Node.js
 * child_process.exec defaults to process.env.ComSpec). Template commands use
 * bash syntax (~/ expansion, env-var prefixes) that cmd.exe can't parse.
 *
 * This module rewrites commands at settings-reconstruction time so they work
 * in cmd.exe while remaining valid in bash on Unix (where it's a no-op).
 */

import {homedir} from 'node:os'

/**
 * Resolver path token that appears in all template hook commands.
 * Shared between templates and adapter — changing this requires updating
 * all template settings.json files AND tests.
 */
export const RESOLVER_TOKEN = '~/.aiwcli/bin/resolve-run.ts'

/** Matches leading bash-style env-var prefixes: KEY=VALUE KEY2= ... */
const BASH_ENV_PREFIX_RE = /^(?:[A-Z_]+=\S*\s+)+/

/**
 * Adapt a hook command for the current platform.
 * On Windows: strips bash env prefixes, expands ~ to quoted absolute home path.
 * On Unix: no-op (returns input unchanged).
 */
export function adaptHookCommand(command: string): string {
  if (process.platform !== 'win32') return command

  const home = homedir().replace(/\\/g, '/')
  const absoluteResolver = `"${home}/.aiwcli/bin/resolve-run.ts"`

  let result = command.replace(BASH_ENV_PREFIX_RE, '')
  result = result.replace(RESOLVER_TOKEN, absoluteResolver)
  return result
}

/**
 * Post-reconstruction validation. On Windows, asserts no command contains
 * bash-only syntax. Throws with actionable message if validation fails.
 */
export function validateCommandsForPlatform(commands: string[]): void {
  if (process.platform !== 'win32') return

  for (const cmd of commands) {
    if (cmd.includes('~/')) {
      throw new Error(
        `Hook command contains unexpanded ~/: "${cmd}". ` +
        'All hook commands must use RESOLVER_TOKEN from platform-commands.ts.',
      )
    }

    if (BASH_ENV_PREFIX_RE.test(cmd)) {
      throw new Error(
        `Hook command contains bash env prefix: "${cmd}". ` +
        'Move env vars into resolve-run.ts spawn env instead.',
      )
    }
  }
}
