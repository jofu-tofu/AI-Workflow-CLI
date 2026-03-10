/**
 * ShellAdapter interface — abstracts shell-dialect differences for command building.
 * BashAdapter and PowerShellAdapter implement this for their respective shells.
 */

export interface ToolCommandParams {
  toolPath: string
  args: string[]
  env: Record<string, string>
  mode: 'exec' | 'repl'
  promptPath?: string | undefined
  promptText?: string | undefined
}

export interface SentinelWrapOptions {
  command: string
  sentinelPath: string
  autoClose: boolean
  autoCloseCommand?: string | undefined
  holdPane: boolean
  holdMessage: string
}

export interface ShellAdapter {
  readonly dialect: 'bash' | 'powershell'

  /** Quote a value for safe inclusion in a shell command. */
  quote(value: string): string

  /** Build env var assignments as a command preamble (KEY=val for bash, $env:KEY=val for PS). */
  buildEnvPreamble(env: Record<string, string>): string

  /** Build a complete tool invocation command (env + tool + args + prompt handling). */
  buildToolCommand(params: ToolCommandParams): string

  /** Wrap a command with sentinel exit-code tracking and optional pane hold. */
  wrapSentinel(params: SentinelWrapOptions): string

  /**
   * Resolve a tool path for the shell dialect.
   * On Windows with bash, resolves via `command -v` in bash.
   * On Unix or PowerShell, returns nativePath as-is.
   */
  resolveToolPath(toolName: string, nativePath: string): Promise<string | null>

  /** Build a shell snippet that clears REPL nesting env vars. */
  buildNestingCleanup(): string

  /** Normalize a cwd path for the shell dialect (e.g. Windows→POSIX for bash). */
  normalizeCwd(cwd: string): string

  /** Wrap a command with warmup + quick-exit retry logic. */
  wrapQuickExitRetry(command: string, toolPath: string, thresholdSec?: number): string

  /** Encode a command for safe execution (identity for bash, Base64 for PowerShell). */
  encodeForExecution(command: string): string
}
