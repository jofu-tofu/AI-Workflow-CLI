/**
 * Shared agent-launcher utilities used by Codex, Devin, and future agent skills.
 * Extracted from codex skill to avoid duplication across agent launch scripts.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

import { logDebug, logWarn } from "./logger.js";
import { execFileAsync, findExecutable } from "./subprocess-utils.js";
import { buildExternalAgentContext } from "../context/context-formatter.js";
import { getContextBySessionId, getContext } from "../context/context-store.js";
import type { ContextState } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 3000;
export const WAIT_TIMEOUT_MS_DEFAULT = 14_400_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaneBackend = "tmux" | "window" | "exec";

export interface PaneWatchTarget {
  backend?: PaneBackend;
  paneId?: string;
  sentinelPath?: string;
}

// ---------------------------------------------------------------------------
// Generic Helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Return a deterministic summary file path for a given agent prefix + task ID.
 * Callers can advertise this path before the session finishes so consumers
 * know where to look for the summary once it's written.
 */
export function getWellKnownSummaryPath(
  prefix: string,
  taskId: string,
  projectRoot?: string,
): string {
  const sessionKey = projectRoot
    ? path.basename(projectRoot)
    : "unknown";
  const dir = path.join(os.tmpdir(), "aiw-agent-output", sessionKey);
  return path.join(dir, `${prefix}-${taskId}.md`).replaceAll("\\", "/");
}

export function persistSummary(
  summary: string,
  prefix: string,
  sessionId?: string,
  taskId?: string,
  projectRoot?: string,
): string | null {
  try {
    const suffix = sessionId
      ? sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "").slice(0, 8)
      : String(process.pid);
    const filePath = path.join(
      os.tmpdir(),
      `${prefix}-summary-${Date.now()}-${suffix}.md`,
    );
    fs.writeFileSync(filePath, summary, "utf8");

    // Also write to the well-known path for deterministic discovery.
    if (taskId) {
      try {
        const wkPath = getWellKnownSummaryPath(prefix, taskId, projectRoot);
        fs.mkdirSync(path.dirname(wkPath), { recursive: true });
        fs.writeFileSync(wkPath, summary, "utf8");
      } catch {
        logWarn("agent-launcher", "Failed to write well-known summary path");
      }
    }

    return filePath.replaceAll("\\", "/");
  } catch (error) {
    logWarn("agent-launcher", `Failed to persist summary: ${String(error)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plan Discovery
// ---------------------------------------------------------------------------

/** Fallback plan discovery: scan all context plan dirs by mtime. */
export function findLatestPlanByMtime(projectRoot: string): string | null {
  const contextsDir = path.join(projectRoot, "_output", "contexts");
  if (!fs.existsSync(contextsDir)) return null;

  let best: { path: string; mtime: number } | null = null;

  for (const ctxEntry of fs.readdirSync(contextsDir)) {
    if (ctxEntry.startsWith("_")) continue;
    const plansDir = path.join(contextsDir, ctxEntry, "plans");
    if (!fs.existsSync(plansDir)) continue;

    for (const file of fs.readdirSync(plansDir)) {
      if (!file.endsWith(".md")) continue;
      const fullPath = path.join(plansDir, file);
      try {
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (!best || mtime > best.mtime) {
          best = { path: fullPath, mtime };
        }
      } catch { /* skip unreadable */ }
    }
  }

  return best?.path ?? null;
}

// ---------------------------------------------------------------------------
// Bootstrap Prompt Construction
// ---------------------------------------------------------------------------

export function buildFileModeBootstrapPrompt(
  targetPath: string,
  sourceLabel: "plan" | "file",
  extraPrompt?: string,
  orientation?: string,
): string {
  const absolutePath = path.resolve(targetPath);
  const sourceTitle = sourceLabel === "plan" ? "Plan Source" : "File Source";
  const sections: string[] = ["## Startup Brief", ""];

  if (orientation?.trim()) {
    sections.push(orientation.trim(), "", "---", "");
  }

  sections.push(
    `## ${sourceTitle}`,
    "",
    `Primary input path: ${absolutePath}`,
    "",
    "Read this file directly from disk before taking action.",
    "Treat its contents as the source of truth.",
    "Do not ask for the file contents to be pasted inline.",
  );

  if (extraPrompt?.trim()) {
    sections.push("", "## Additional Instructions", "", extraPrompt.trim());
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Context Resolution
// ---------------------------------------------------------------------------

export function resolveContextForLaunch(
  contextFlag: string | undefined,
  projectRoot: string,
): ContextState | null {
  if (contextFlag) {
    return getContext(contextFlag, projectRoot) ?? null;
  }
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId) {
    return getContextBySessionId(sessionId, projectRoot) ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt File Writers
// ---------------------------------------------------------------------------

export interface WritePromptFileOpts {
  ctx?: ContextState | null;
  extraPrompt?: string;
  projectRoot: string;
  tempFilePrefix: string;
}

export interface WriteFileRefPromptFileOpts extends WritePromptFileOpts {
  fileReferencePath: string;
  label: "plan" | "file";
}

export interface WriteInlinePromptFileOpts extends WritePromptFileOpts {
  text: string;
}

/**
 * Build a file-reference bootstrap prompt and write it to a temp file.
 * Returns the temp file path.
 */
export function writeFileRefPromptFile(opts: WriteFileRefPromptFileOpts): string {
  let orientation = "";
  if (opts.ctx) {
    try {
      orientation = buildExternalAgentContext(opts.ctx, opts.projectRoot);
    } catch {
      logWarn("agent-launcher", `Context orientation build failed for ${opts.ctx.id}`);
    }
  }

  const bootstrap = buildFileModeBootstrapPrompt(
    opts.fileReferencePath,
    opts.label,
    opts.extraPrompt,
    orientation,
  );
  const tempFile = path.join(os.tmpdir(), `${opts.tempFilePrefix}-file-ref-${Date.now()}.md`);
  fs.writeFileSync(tempFile, bootstrap, "utf8");
  return tempFile;
}

/**
 * Write inline text to a temp file, prepend context orientation, append extra prompt.
 * Returns the temp file path.
 */
export function writeInlinePromptFile(opts: WriteInlinePromptFileOpts): string {
  let content = opts.text;

  if (opts.ctx) {
    try {
      const orientation = buildExternalAgentContext(opts.ctx, opts.projectRoot);
      content = `${orientation}\n\n---\n\n${content}`;
    } catch {
      logWarn("agent-launcher", `Context orientation prepend failed for ${opts.ctx.id}`);
    }
  }

  if (opts.extraPrompt?.trim()) {
    content = `${content}\n\n---\n\n## Additional Instructions\n\n${opts.extraPrompt}`;
  }

  const tempFile = path.join(os.tmpdir(), `${opts.tempFilePrefix}-prompt-${Date.now()}.md`);
  fs.writeFileSync(tempFile, content, "utf8");
  return tempFile;
}

// ---------------------------------------------------------------------------
// Pane Watching
// ---------------------------------------------------------------------------

async function waitForSentinelClose(sentinelPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (fs.existsSync(sentinelPath)) return;
    if (Date.now() >= deadline) {
      logDebug("agent-launcher", `watch timeout reached waiting for sentinel ${sentinelPath}`);
      return;
    }

    const remainingMs = deadline - Date.now();
    await sleep(Math.max(0, Math.min(POLL_INTERVAL_MS, remainingMs)));
  }
}

function normalizeWatchTarget(target: string | PaneWatchTarget): PaneWatchTarget {
  if (typeof target === "string") {
    return { backend: "tmux", paneId: target };
  }
  return target;
}

export async function waitForPaneClose(
  target: string | PaneWatchTarget,
  timeoutMs = WAIT_TIMEOUT_MS_DEFAULT,
): Promise<void> {
  const watch = normalizeWatchTarget(target);

  if (watch.sentinelPath) {
    await waitForSentinelClose(watch.sentinelPath, timeoutMs);
    return;
  }

  const backend = watch.backend ?? "tmux";
  const paneId = watch.paneId ?? "";

  if (backend !== "tmux") {
    logDebug("agent-launcher", `No pane watcher for backend=${backend}; continuing without wait`);
    return;
  }

  if (!paneId) return;

  const tmuxPath = findExecutable("tmux");
  if (!tmuxPath) {
    logWarn("agent-launcher", `tmux unavailable while watching pane ${paneId}`);
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (Date.now() >= deadline) {
      logDebug("agent-launcher", `watch timeout reached for pane ${paneId} after ${timeoutMs}ms`);
      return;
    }

    const result = await execFileAsync(tmuxPath, ["list-panes", "-a", "-F", "#{pane_id}"], {
      timeout: POLL_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      logDebug("agent-launcher", `list-panes failed; assuming pane closed (${result.stderr.trim() || "no stderr"})`);
      return;
    }

    const activePaneIds = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!activePaneIds.includes(paneId)) return;

    const remainingMs = deadline - Date.now();
    await sleep(Math.max(0, Math.min(POLL_INTERVAL_MS, remainingMs)));
  }
}
