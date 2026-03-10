/**
 * Centralized env var management for REPL nesting detection.
 * Replaces scattered cleanClaudeEnv(), UNSET_NESTING_SH, etc.
 */

/**
 * Env vars set by REPL tools (Claude Code, Codex, Devin) that trigger
 * nesting detection. Must be cleared when spawning a new REPL pane so
 * the child tool starts fresh instead of refusing to launch.
 */
export const REPL_NESTING_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_SESSION_ID',
  'CODEX_THREAD_ID',
  'AIWCLI_INTERNAL_CALL',
] as const

/**
 * Check whether the current process was invoked from a REPL tool.
 * Must be called BEFORE clearProcessNestingVars().
 */
export function isCalledFromRepl(): boolean {
  return REPL_NESTING_VARS.some((v) => Boolean(process.env[v]))
}

/**
 * Clear REPL nesting vars from the current process environment.
 * Call once at orchestrator startup so inline launches don't see them.
 */
export function clearProcessNestingVars(): void {
  for (const v of REPL_NESTING_VARS) {
    delete process.env[v]
  }
}

/**
 * Build a clean process env with nesting vars removed and optional extras merged.
 * Used for createSession() spawn calls that inherit process.env.
 */
export function sanitizedProcessEnv(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
  }
  for (const key of REPL_NESTING_VARS) {
    delete env[key]
  }
  return env
}
