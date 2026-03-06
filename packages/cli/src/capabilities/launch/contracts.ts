import type {SplitPaneResult} from '../../platform/launch.js'

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
  split?: 'auto' | 'h' | 'v' | undefined
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
}

export interface JsonLaunchResult {
  backend: SplitPaneResult['backend']
  exitCode: null | number
  launched: boolean
  paneId: null | string
  reason: null | string
  sentinelPath: null | string
}
