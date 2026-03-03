/**
 * Abstract pane launcher interface and factory.
 * Extracted from template _shared/lib-ts/base/pane-launcher.ts.
 */

import {TmuxLauncher} from './launchers/tmux-launcher.js'

export type PaneBackend = 'tmux' | 'window' | 'exec'
export type PaneSplitDirection = 'h' | 'v' | 'auto'

export interface PaneLaunchOptions {
  command: string
  splitDirection?: PaneSplitDirection | undefined
  splitTarget?: string | undefined
  cwd?: string | undefined
  title?: string | undefined
}

export interface PaneLaunchResult {
  launched: boolean
  backend: PaneBackend
  paneId?: string | undefined
  reason?: string | undefined
  stderr?: string | undefined
}

export interface PaneLauncher {
  readonly backend: PaneBackend
  available(): Promise<boolean>
  launch(options: PaneLaunchOptions): Promise<PaneLaunchResult>
  kill?(paneId: string): Promise<void>
}

export interface PaneLauncherFactoryOptions {
  requireTmuxSession?: boolean
}

/**
 * Resolve the first available pane launcher for the current environment.
 * Only returns a launcher when already inside an active tmux session.
 * On Windows without tmux, returns null — callers fall through to inline execution.
 */
export async function createPaneLauncher(
  options?: PaneLauncherFactoryOptions,
): Promise<PaneLauncher | null> {
  const requireTmuxSession = options?.requireTmuxSession ?? true

  const tmux = new TmuxLauncher({requireSessionEnv: requireTmuxSession})
  if (await tmux.available()) return tmux

  return null
}
