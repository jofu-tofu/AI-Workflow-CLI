/**
 * Unified multiplexer abstraction.
 * Backends implement the Multiplexer interface: resolveStrategy() for context-aware
 * decision making, split()/createSession() for pane management.
 * Factory: detectMultiplexer() → Multiplexer | null
 */

export type LaunchStrategy = 'split' | 'create-session' | 'inline' | 'unavailable'

export interface StrategyContext {
  calledFromRepl: boolean
  platform: NodeJS.Platform
  disableMux: boolean
}

export interface ResolvedStrategy {
  strategy: LaunchStrategy
  reason: string
}

export type SplitDirection = 'auto' | 'horizontal' | 'vertical'

export interface SplitOptions {
  toolName: string
  args: string[]
  cwd: string
  env: Record<string, string>
  mode: 'exec' | 'repl'
  split: SplitDirection
  promptPath?: string | undefined
  sentinelPath: string
  holdPane: boolean
  retryOnQuickExit: boolean
}

export interface LaunchResult {
  launched: boolean
  backend: string
  handle?: string | undefined
  sentinelPath?: string | undefined
  exitCode?: number | undefined
  reason?: string | undefined
}

export interface CreateSessionOptions {
  sessionName: string
  toolPath: string
  toolArgs: string[]
  cwd: string
  promptText?: string | undefined
  reattach: boolean
  enableMouse?: boolean | undefined
}

export interface Multiplexer {
  readonly backend: string
  resolveStrategy(ctx: StrategyContext): ResolvedStrategy
  split(options: SplitOptions): Promise<LaunchResult>
  createSession(options: CreateSessionOptions): Promise<LaunchResult>
  kill(handle: string): Promise<void>
}

/**
 * Resolve the priority order of multiplexer backends for a given platform.
 * Pure function — no I/O, no PATH checks. Used by detectMultiplexer().
 */
export function resolveMultiplexerPriority(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = {},
): string[] {
  if (platform === 'win32') {
    // Prefer WezTerm if we detect a WezTerm environment
    if (env.WEZTERM_PANE || env.TERM_PROGRAM === 'WezTerm') {
      return ['wezterm', 'psmux']
    }
    return ['psmux']
  }
  return ['tmux']
}

/**
 * Detect the best available multiplexer for the current platform.
 * Windows → WeztermMultiplexer (if inside WezTerm) → PsmuxMultiplexer (fallback)
 * Unix → TmuxMultiplexer (if tmux binary on PATH)
 * Returns null if no multiplexer is available.
 */
export async function detectMultiplexer(
  platform: NodeJS.Platform = process.platform,
): Promise<Multiplexer | null> {
  if (platform === 'win32') {
    const {WeztermMultiplexer} = await import('./multiplexers/wezterm.js')
    const wezterm = WeztermMultiplexer.create()
    if (wezterm) return wezterm

    const {PsmuxMultiplexer} = await import('./multiplexers/psmux.js')
    return PsmuxMultiplexer.create()
  }

  const {TmuxMultiplexer} = await import('./multiplexers/tmux.js')
  return TmuxMultiplexer.create()
}
