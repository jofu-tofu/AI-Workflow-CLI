/**
 * Unified multiplexer abstraction.
 * Single interface for tmux (Unix) and psmux (Windows) backends.
 * Factory: detectMultiplexer() → Multiplexer | null
 */

export type MultiplexerBackend = 'psmux' | 'tmux'
export type SplitDirection = 'auto' | 'h' | 'v'

export interface SplitPaneOptions {
  args: string[]
  autoClose?: boolean | undefined
  cwd?: string | undefined
  env?: Record<string, string> | undefined
  holdMessage?: string | undefined
  holdPane?: boolean | undefined
  mode?: 'exec' | 'repl' | undefined
  promptPath?: string | undefined
  sentinel?: boolean | undefined
  split?: SplitDirection | undefined
  splitTarget?: string | undefined
  toolName: string
}

export interface SplitPaneResult {
  backend: MultiplexerBackend
  exitCode?: number | undefined
  launched: boolean
  paneId?: string | undefined
  reason?: string | undefined
  sentinelPath?: string | undefined
  stderr?: string | undefined
}

export interface CreateSessionOptions {
  enableMouse?: boolean | undefined
  promptText?: string | undefined
  reattach?: boolean | undefined
  sessionName: string
  toolArgs: string[]
  toolPath: string
}

export interface CreateSessionResult {
  exitCode: number
  reason?: string | undefined
  usedMux: boolean
}

export interface Multiplexer {
  readonly backend: MultiplexerBackend
  createSession(options: CreateSessionOptions): Promise<CreateSessionResult>
  isInsideSession(): boolean
  kill(paneId: string): Promise<void>
  splitPane(options: SplitPaneOptions): Promise<SplitPaneResult>
}

/**
 * Detect the best available multiplexer for the current platform.
 * Windows → PsmuxMultiplexer (if installed and meets version requirement)
 * Unix → TmuxMultiplexer (if tmux binary on PATH)
 * Returns null if no multiplexer is available.
 */
export async function detectMultiplexer(
  platform: NodeJS.Platform = process.platform,
): Promise<Multiplexer | null> {
  if (platform === 'win32') {
    const {PsmuxMultiplexer} = await import('./multiplexers/psmux.js')
    return PsmuxMultiplexer.create()
  }

  const {TmuxMultiplexer} = await import('./multiplexers/tmux.js')
  return TmuxMultiplexer.create()
}
