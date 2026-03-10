/**
 * PowerShellAdapter — ShellAdapter for PowerShell (Windows, psmux backend).
 * Delegates to low-level primitives in shell-quoting.ts, sentinel-wrapper.ts, etc.
 */

import path from 'node:path'

import {REPL_NESTING_VARS} from '../env-sanitizer.js'
import {wrapSentinelPowerShell} from '../sentinel-wrapper.js'
import {quoteForPowerShell, toEncodedPowerShell} from '../shell-quoting.js'
import type {SentinelWrapOptions, ShellAdapter, ToolCommandParams} from './shell-adapter.js'

export class PowerShellAdapter implements ShellAdapter {
  readonly dialect = 'powershell' as const

  quote(value: string): string {
    return quoteForPowerShell(value)
  }

  buildEnvPreamble(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `$env:${key}=${this.quote(value)}`)
      .join('; ')
  }

  buildToolCommand(params: ToolCommandParams): string {
    const {toolPath, args, env, mode, promptPath} = params
    const envPrefix = this.buildEnvPreamble(env)

    const commandArgs = this.appendPromptArg(args, mode, promptPath)
    const argArray = commandArgs.map((arg) => this.quote(arg)).join(', ')
    const invocation = `& ${this.quote(toolPath)}${argArray ? ` @(${argArray})` : ''}`

    const body = mode === 'exec' && promptPath
      ? `Get-Content -Raw -Path ${this.quote(promptPath)} | ${invocation}`
      : invocation

    return [envPrefix, body].filter(Boolean).join('; ')
  }

  wrapSentinel(params: SentinelWrapOptions): string {
    return wrapSentinelPowerShell(params)
  }

  async resolveToolPath(_toolName: string, nativePath: string): Promise<string | null> {
    return nativePath
  }

  buildNestingCleanup(): string {
    return REPL_NESTING_VARS
      .map((v) => `Remove-Item Env:\\${v} -ErrorAction SilentlyContinue`)
      .join('; ') + ';'
  }

  normalizeCwd(cwd: string): string {
    return cwd
  }

  wrapQuickExitRetry(command: string, _toolPath: string, _thresholdSec?: number): string {
    // Quick-exit retry not implemented for PowerShell — inline retry handles it
    return command
  }

  encodeForExecution(command: string): string {
    return toEncodedPowerShell(command)
  }

  private appendPromptArg(args: string[], mode: 'exec' | 'repl', promptPath?: string): string[] {
    if (mode !== 'repl' || !promptPath) return args
    const absolutePromptPath = path.resolve(promptPath)
    const formatted = process.platform === 'win32'
      ? absolutePromptPath.replaceAll('\\', '/')
      : absolutePromptPath
    const bootstrap = `Read startup instructions from this file path before taking action: ${formatted}. Use that file as the initial context.`
    return [...args, bootstrap]
  }
}
