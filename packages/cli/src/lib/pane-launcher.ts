/**
 * Abstract pane launcher interface and factory.
 * Extracted from template _shared/lib-ts/base/pane-launcher.ts.
 */

import {TmuxLauncher} from './launchers/tmux-launcher.js'

export type PaneBackend = 'exec' | 'tmux' | 'window'
export type PaneSplitDirection = 'auto' | 'h' | 'v'

export interface PaneLaunchOptions {
  command: string
  cwd?: string | undefined
  splitDirection?: PaneSplitDirection | undefined
  splitTarget?: string | undefined
  title?: string | undefined
}

export interface PaneLaunchResult {
  backend: PaneBackend
  launched: boolean
  paneId?: string | undefined
  reason?: string | undefined
  stderr?: string | undefined
}

export interface PaneLauncher {
  available(): Promise<boolean>
  readonly backend: PaneBackend
  kill?(paneId: string): Promise<void>
  launch(options: PaneLaunchOptions): Promise<PaneLaunchResult>
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
): Promise<null | PaneLauncher> {
  const requireTmuxSession = options?.requireTmuxSession ?? true

  const tmux = new TmuxLauncher({requireSessionEnv: requireTmuxSession})
  if (await tmux.available()) return tmux

  return null
}
