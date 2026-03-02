import { createHash } from "node:crypto";
import * as fs from "node:fs";

import type { PaneLaunchOptions, PaneLaunchResult, PaneLauncher } from "../pane-launcher.js";
import { execFileAsync, findExecutable } from "../subprocess-utils.js";
import { findBestSplit, type TmuxPaneInfo } from "../tmux-pane-placement.js";
import { TMUX_SOCKET_PATH, quoteForSh, toMsysPosixPath } from "../tmux-primitives.js";
import { logWarn } from "../logger.js";

/**
 * Route all tmux commands through bash to ensure a consistent POSIX runtime,
 * even when the caller is PowerShell/cmd.exe.
 *
 * Socket path is inserted as a literal into the command string (not the args
 * array) — it's a simple tmpdir path with no special chars.
 * MSYS_NO_PATHCONV=1 prevents MSYS2 from auto-translating arguments that
 * look like paths (e.g., sentinel paths, CWD arguments).
 */
async function tmuxViaBash(
  bashPath: string,
  tmuxArgs: string[],
  timeoutMs = 5000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const argStr = tmuxArgs.map(quoteForSh).join(" ");
  const cmd = `tmux -S ${TMUX_SOCKET_PATH} ${argStr}`;
  return execFileAsync(bashPath, ["-lc", cmd], {
    timeout: timeoutMs,
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
}

/** Parse tmux list-panes text output into TmuxPaneInfo[]. */
function parsePaneList(stdout: string): TmuxPaneInfo[] {
  const panes: TmuxPaneInfo[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    const paneId = parts[0] ?? "";
    const width = Number.parseInt(parts[1] ?? "", 10);
    const height = Number.parseInt(parts[2] ?? "", 10);
    const activeRaw = parts[3] ?? "";

    if (!paneId || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    panes.push({ paneId, width, height, active: activeRaw === "1" });
  }
  return panes;
}

/**
 * Git Bash tmux launcher for Windows.
 *
 * Creates a project-scoped tmux session via MSYS2/Git Bash, splits panes
 * into it, and opens a mintty/git-bash window for visibility. Provides real
 * pane IDs, reliable CWD, and reuses existing tmux infrastructure.
 *
 * Falls through to WindowLauncher when tmux is unavailable.
 */
export class GitBashTmuxLauncher implements PaneLauncher {
  readonly backend = "tmux" as const;

  async available(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (process.env.TMUX) return false; // Already in tmux → TmuxLauncher handles it

    const bashPath = findExecutable("bash");
    if (!bashPath) return false;

    // Probe tmux availability *through bash*, not via host PATH.
    // This catches setups where tmux is only visible inside the MSYS2 env.
    const probe = await execFileAsync(bashPath, ["-lc", "tmux -V"], {
      timeout: 3000,
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    });
    if (probe.exitCode !== 0) return false;

    // Need a terminal emulator to show the tmux session
    return Boolean(findExecutable("mintty") ?? findExecutable("git-bash"));
  }

  async kill(paneId: string): Promise<void> {
    const bash = findExecutable("bash");
    if (!bash || !paneId) return;
    await tmuxViaBash(bash, ["kill-pane", "-t", paneId]);
  }

  async launch(options: PaneLaunchOptions): Promise<PaneLaunchResult> {
    const bash = findExecutable("bash");
    if (!bash) {
      return { launched: false, backend: this.backend, reason: "bash not found" };
    }

    // Step 1: Derive session name from project root for isolation
    const projectRoot = options.cwd?.trim() || process.cwd();
    const projectHash = createHash("md5").update(projectRoot).digest("hex").slice(0, 8);
    const sessionName = `aiwcli-${projectHash}`;

    // Step 2-3: Check if session exists; create if needed
    // Stale socket recovery: if has-session fails with a connection error,
    // delete the socket file and retry once.
    let existed: boolean;
    const hasResult = await tmuxViaBash(bash, ["has-session", "-t", sessionName]);
    if (hasResult.exitCode !== 0 && hasResult.stderr.includes("error connecting")) {
      try { fs.unlinkSync(TMUX_SOCKET_PATH); } catch { /* ignore */ }
      existed = (await tmuxViaBash(bash, ["has-session", "-t", sessionName])).exitCode === 0;
    } else {
      existed = hasResult.exitCode === 0;
    }

    if (!existed) {
      const posixCwd = toMsysPosixPath(projectRoot);
      const create = await tmuxViaBash(bash, ["new-session", "-d", "-s", sessionName, "-c", posixCwd]);
      if (create.exitCode !== 0) {
        return {
          launched: false,
          backend: this.backend,
          reason: "tmux new-session failed",
          stderr: create.stderr.trim() || undefined,
        };
      }
    }

    // Step 4: BSP split direction
    const listResult = await tmuxViaBash(bash, [
      "list-panes", "-t", sessionName, "-F", "#{pane_id} #{pane_width} #{pane_height} #{pane_active}",
    ]);
    const panes = parsePaneList(listResult.stdout);
    const placement = findBestSplit(panes);
    const splitFlag = placement?.splitFlag ?? "-h";
    const targetPane = placement?.targetPane ?? sessionName;

    // Step 5-6: Split-window with command and per-pane CWD
    const posixCwd = toMsysPosixPath(projectRoot);
    const splitArgs = [
      "split-window", splitFlag,
      "-c", posixCwd,
      "-P", "-F", "#{pane_id}",
      "-t", targetPane,
      options.command,
    ];
    const split = await tmuxViaBash(bash, splitArgs);

    if (split.exitCode !== 0) {
      // Clean up: if we just created an empty session, kill it
      if (!existed) {
        await tmuxViaBash(bash, ["kill-session", "-t", sessionName]).catch(() => {});
      }
      return {
        launched: false,
        backend: this.backend,
        reason: "tmux split-window failed",
        stderr: split.stderr.trim() || undefined,
      };
    }

    const paneId = split.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? undefined;

    // Step 7: Attach terminal if no clients are connected (fire-and-forget)
    const clients = await tmuxViaBash(bash, ["list-clients", "-t", sessionName]);
    if (clients.exitCode !== 0 || !clients.stdout.trim()) {
      const terminal = findExecutable("mintty") ?? findExecutable("git-bash");
      if (terminal) {
        const attachCmd = `tmux -S ${quoteForSh(TMUX_SOCKET_PATH)} attach -t ${quoteForSh(sessionName)}`;
        // mintty/git-bash are GUI apps that fork immediately — execFileAsync resolves
        // when the spawn succeeds, not when the terminal exits.
        execFileAsync(terminal, ["-e", bash, "-lc", attachCmd], { timeout: 5000 })
          .catch((err) => logWarn("gitbash-tmux", `terminal attach failed: ${String(err)}`));
      }
    }

    return {
      launched: true,
      backend: this.backend,
      paneId,
    };
  }
}
