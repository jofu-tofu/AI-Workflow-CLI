import type {LaunchResult} from '../../platform/launch.js'

export type ToolMode = 'claude' | 'codex' | 'devin'

export interface ToolConfig {
  cliCommand: string
  cliArgs: string[]
  launchFlag: string
  toolMode: ToolMode
  retryOnQuickExit: boolean
  skipVersionCheck: boolean
}

export interface InlineFallbackContext {
  disableMux: boolean
  hasMux: boolean
  interactiveTty: boolean
  platform: NodeJS.Platform
  resolvedReason?: string
}

export interface SplitRequestParams {
  toolArgs: string[]
  splitPromptPath: string | undefined
  env: Record<string, string>
  cwd: string
  mode: 'repl'
  split: 'auto' | 'horizontal' | 'vertical'
  sentinelPath: string
  holdPane: boolean
  retryOnQuickExit: boolean
}

export interface SessionRequestParams {
  sessionName: string
  reattach: boolean
  toolArgs: string[]
  promptText: string | undefined
}

export interface LaunchFlags {
  codex: boolean
  devin: boolean
  env?: string | undefined
  json: boolean
  new: boolean
  'no-tmux': boolean
  prompt?: string | undefined
  'prompt-file'?: string | undefined
  'prompt-path'?: string | undefined
  'spawned-window': boolean
  split?: 'auto' | 'horizontal' | 'vertical' | undefined
  'tmux-session'?: string | undefined
  wait: boolean
}

export interface LaunchCommandHost {
  debug(message: string, ...args: unknown[]): void
  error(input: Error | string, options?: {exit?: number}): never
  exit(code?: number): never
  log(message?: string): void
  logInfo(message: string): void
  logWarning(message: string): void
  warn(input: Error | string, options?: {code?: string}): Error | string
}

export interface LaunchRequest {
  cwd: string
  flags: LaunchFlags
  interactiveTty: boolean
  platform: NodeJS.Platform
  readPromptFile(filePath: string): string | undefined
}

export interface LaunchDependencies {
  host: LaunchCommandHost
  now: () => number
  pid: number
  tempDir: string
  writePromptFile(filePath: string, content: string): void
  isCalledFromRepl?: () => boolean
  clearNestingVars?: () => void
}

export interface JsonLaunchResult {
  backend: string
  exitCode: null | number
  handle: null | string
  launched: boolean
  reason: null | string
  sentinelPath: null | string
}
