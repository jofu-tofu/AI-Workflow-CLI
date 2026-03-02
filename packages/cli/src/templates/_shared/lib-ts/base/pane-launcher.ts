import { GitBashTmuxLauncher } from "./launchers/gitbash-tmux-launcher.js";
import { TmuxLauncher } from "./launchers/tmux-launcher.js";
import { WindowLauncher } from "./launchers/window-launcher.js";

export type PaneBackend = "tmux" | "window" | "exec";
export type PaneSplitDirection = "h" | "v" | "auto";

export interface PaneLaunchOptions {
  command: string;
  splitDirection?: PaneSplitDirection;
  splitTarget?: string;
  cwd?: string;
  title?: string;
}

export interface PaneLaunchResult {
  launched: boolean;
  backend: PaneBackend;
  paneId?: string;
  reason?: string;
  stderr?: string;
}

export interface PaneLauncher {
  readonly backend: PaneBackend;
  available(): Promise<boolean>;
  launch(options: PaneLaunchOptions): Promise<PaneLaunchResult>;
  kill?(paneId: string): Promise<void>;
}

export interface PaneLauncherFactoryOptions {
  /** Include tmux launcher only when running inside a tmux session. Default: true. */
  requireTmuxSession?: boolean;
}

/**
 * Resolve the first available pane launcher for the current environment.
 * Detection order: tmux (in-session) -> Git Bash tmux -> window fallback.
 */
export async function createPaneLauncher(
  options?: PaneLauncherFactoryOptions,
): Promise<PaneLauncher | null> {
  const requireTmuxSession = options?.requireTmuxSession ?? true;

  const tmux = new TmuxLauncher({ requireSessionEnv: requireTmuxSession });
  if (await tmux.available()) return tmux;

  const gitBashTmux = new GitBashTmuxLauncher();
  if (await gitBashTmux.available()) return gitBashTmux;

  const window = new WindowLauncher();
  if (await window.available()) return window;

  return null;
}
