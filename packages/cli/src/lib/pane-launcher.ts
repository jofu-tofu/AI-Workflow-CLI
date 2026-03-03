/**
 * Abstract pane launcher interface and factory.
 * Extracted from template _shared/lib-ts/base/pane-launcher.ts.
 */

import {GitBashTmuxLauncher} from './launchers/gitbash-tmux-launcher.js'
import {TmuxLauncher} from './launchers/tmux-launcher.js'
import {WindowLauncher} from './launchers/window-launcher.js'

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
 * Detection order: tmux (in-session) -> Git Bash tmux -> window fallback.
 */
export async function createPaneLauncher(
  options?: PaneLauncherFactoryOptions,
): Promise<PaneLauncher | null> {
  const requireTmuxSession = options?.requireTmuxSession ?? true

  const tmux = new TmuxLauncher({requireSessionEnv: requireTmuxSession})
  if (await tmux.available()) return tmux

  const gitBashTmux = new GitBashTmuxLauncher()
  if (await gitBashTmux.available()) return gitBashTmux

  const win = new WindowLauncher()
  if (await win.available()) return win

  return null
}
