/**
 * @file In-process command runner for tests.
 *
 * Uses @oclif/core's Config.runCommand() with @oclif/test's captureOutput()
 * to run CLI commands in-process, eliminating the ~1-3s subprocess overhead
 * per CLI invocation on Windows.
 *
 * Use this instead of execSync for tests that don't need real shell behavior
 * (exit code propagation through shell, piping, stdio detection).
 */

import {Config} from '@oclif/core'
import {captureOutput} from '@oclif/test'

export interface RunResult {
  /** Error if command failed */
  error: (Error & {code?: string; exitCode?: number; oclif?: {exit?: number}}) | undefined
  /** Captured stderr output */
  stderr: string
  /** Captured stdout output */
  stdout: string
}

let cachedConfig: Config | undefined

/**
 * Reset the cached oclif config for test isolation.
 *
 * Some test suites modify process-level state (cwd/env), and reusing a cached
 * Config across those suites can retain stale command wiring.
 */
export function resetCommandCache(): void {
  cachedConfig = undefined
}

/**
 * Run an oclif command in-process, capturing stdout/stderr.
 *
 * @param args - Command arguments, e.g. ['branch', '--help'] or 'branch --help'
 * @returns Captured output and optional error
 *
 * @example
 * ```ts
 * const {stdout} = await runCommand('launch --help')
 * expect(stdout).to.include('Launch Claude Code')
 *
 * const {error} = await runCommand('branch')
 * expect(error?.message).to.match(/--main|--launch|--delete/)
 * ```
 */
export async function runCommand(args: string | string[]): Promise<RunResult> {
  const argv = typeof args === 'string' ? args.split(' ') : args
  const [command = '', ...flags] = argv

  if (!cachedConfig) {
    cachedConfig = await Config.load(process.cwd())
  }

  const config = cachedConfig

  const {error, stderr, stdout} = await captureOutput(
    async () => config.runCommand(command, flags),
    {stripAnsi: true},
  )

  return {
    error: error as RunResult['error'],
    stderr,
    stdout,
  }
}
