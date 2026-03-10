/**
 * BashAdapter — ShellAdapter for bash (Unix + MSYS2/Git Bash on Windows).
 * Delegates to low-level primitives in shell-quoting.ts, sentinel-wrapper.ts, etc.
 */

import {REPL_NESTING_VARS} from '../env-sanitizer.js'
import {execFileAsync, findExecutable} from '../runtime/subprocess-utils.js'
import {wrapSentinelSh} from '../sentinel-wrapper.js'
import {quoteForSh} from '../shell-quoting.js'
import {toMsysPosixPath} from '../tmux-primitives.js'
import type {SentinelWrapOptions, ShellAdapter, ToolCommandParams} from './shell-adapter.js'

export class BashAdapter implements ShellAdapter {
  readonly dialect = 'bash' as const

  quote(value: string): string {
    return quoteForSh(value)
  }

  buildEnvPreamble(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `${key}=${this.quote(value)}`)
      .join(' ')
  }

  buildToolCommand(params: ToolCommandParams): string {
    const {toolPath, args, env, mode, promptPath, promptText} = params
    const envPrefix = this.buildEnvPreamble(env)
    const commandArgs = this.appendPromptArg(args, mode, promptText)
    const argPart = commandArgs.map((arg) => this.quote(arg)).join(' ')
    const base = [envPrefix, this.quote(toolPath), argPart]
      .filter(Boolean)
      .join(' ')

    if (mode === 'exec' && promptPath) {
      return `${base} < ${this.quote(promptPath)}`
    }

    return base
  }

  wrapSentinel(params: SentinelWrapOptions): string {
    return wrapSentinelSh(params)
  }

  async resolveToolPath(toolName: string, nativePath: string): Promise<string | null> {
    if (process.platform !== 'win32') return nativePath
    // On Windows, resolve tool from bash's perspective (MSYS2/Git Bash PATH)
    const bash = findExecutable('bash')
    if (!bash) return null
    const result = await execFileAsync(bash, ['-lc', `command -v ${toolName}`], {
      timeout: 3000,
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
    })
    return result.exitCode === 0 ? result.stdout.trim() || null : null
  }

  buildNestingCleanup(): string {
    const pathFix = 'export PATH="/usr/bin:/usr/local/bin:/mingw64/bin:$PATH";'
    const unset = `unset ${REPL_NESTING_VARS.join(' ')};`
    return `${pathFix} ${unset}`
  }

  normalizeCwd(cwd: string): string {
    return toMsysPosixPath(cwd)
  }

  wrapQuickExitRetry(command: string, toolPath: string, thresholdSec = 10): string {
    const warmup = `${toolPath} --version >/dev/null 2>&1`
    return `${warmup}; _qr_t0=$SECONDS; ${command}; if [ $((SECONDS - _qr_t0)) -lt ${thresholdSec} ]; then ${command}; fi`
  }

  encodeForExecution(command: string): string {
    return command
  }

  private appendPromptArg(args: string[], mode: 'exec' | 'repl', promptText?: string): string[] {
    if (mode !== 'repl' || promptText === undefined) return args
    return [...args, promptText]
  }
}
