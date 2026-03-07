/**
 * Shared agent-launcher utilities used by Codex, Devin, and future agent skills.
 * Extracted from codex skill to avoid duplication across agent launch scripts.
 */

import { execFileSync } from "node:child_process";
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

/** Well-known directory for agent output files, keyed by tmux session. */
const AGENT_OUTPUT_DIR_NAME = "aiw-agent-output";

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

// ---------------------------------------------------------------------------
// Session Key — multi-backend multiplexer identity
// ---------------------------------------------------------------------------

/**
 * Derive a stable session key that is shared by ALL panes in the same
 * multiplexer session.  Works across backends:
 *
 *  tmux  → parse $TMUX ("<socket>,<pid>,<idx>") → "tmux-<socket-name>-<pid>"
 *  psmux → query `psmux display-message -p '#{session_name}'` → "psmux-<name>"
 *  none  → null  (caller should fall back to project-root key)
 */
export function getSessionKey(): string | null {
  // --- tmux -----------------------------------------------------------------
  const tmuxEnv = process.env.TMUX;
  if (tmuxEnv) {
    const parts = tmuxEnv.split(",");
    if (parts.length >= 2) {
      const socketName = path.basename(parts[0]); // e.g. "default"
      return `tmux-${socketName}-${parts[1]}`;
    }
  }

  // --- psmux ----------------------------------------------------------------
  // $PSMUX_PANE is set by createSession() and inherited by split panes.
  // psmux supports tmux-compatible display-message, so we can query the
  // session name synchronously (fast local call).
  if (process.env.PSMUX_PANE || process.platform === "win32") {
    try {
      const psmuxPath = findExecutable("psmux");
      if (psmuxPath) {
        const name = execFileSync(psmuxPath, [
          "display-message", "-p", "#{session_name}",
        ], { encoding: "utf8", timeout: 3000 }).trim();
        if (name) return `psmux-${name}`;
      }
    } catch {
      // Not inside a psmux session, or psmux not available
    }
  }

  return null;
}

/**
 * Simple deterministic hash for project root paths.
 * Produces a short alphanumeric suffix for directory names.
 */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Get the well-known output directory for the current session.
 * Creates the directory if it doesn't exist.
 *
 * Resolution order:
 *  1. Multiplexer session key (tmux/psmux) — shared across all panes
 *  2. Project root fallback — used for exec/window modes where there is
 *     no multiplexer session context.  Keyed on project dir so concurrent
 *     runs in different projects don't collide.
 *
 * Pattern: `$TMPDIR/aiw-agent-output/<session-key>/`
 */
export function getAgentOutputDir(projectRoot?: string): string {
  const sessionKey = getSessionKey();
  const key = sessionKey
    ?? `project-${path.basename(projectRoot ?? process.cwd())}-${simpleHash(projectRoot ?? process.cwd())}`;
  const dir = path.join(os.tmpdir(), AGENT_OUTPUT_DIR_NAME, key);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* best-effort */ }
  return dir;
}

/**
 * Sanitize an identifier for use in filenames.
 * tmux/psmux pane IDs `%42` → `p42`, other special chars → `_`.
 */
function sanitizeId(id: string): string {
  return id.replace(/^%/, "p").replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Get the well-known (predictable) path for an agent task's summary.
 *
 * With taskId: `<outputDir>/<prefix>-<taskId>.md`   (concurrency-safe, direct lookup)
 * Without:     `<outputDir>/<prefix>-latest.md`      (single-agent fallback)
 *
 * The caller generates the taskId before launching the agent, passes it via
 * `--task-id`, and can read the exact file path afterward without needing the
 * background task's stdout.  Multiple concurrent agents use different taskIds.
 */
export function getWellKnownSummaryPath(
  prefix: string,
  taskId?: string | null,
  projectRoot?: string,
): string {
  const dir = getAgentOutputDir(projectRoot);
  const suffix = taskId ? sanitizeId(taskId) : "latest";
  return path.join(dir, `${prefix}-${suffix}.md`);
}

/**
 * List all well-known summary files for a given agent prefix.
 * Returns file paths sorted by mtime (newest first).
 * Useful for discovering all completed task summaries.
 */
export function listWellKnownSummaries(prefix: string, projectRoot?: string): string[] {
  const dir = getAgentOutputDir(projectRoot);
  try {
    const entries = fs.readdirSync(dir)
      .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".md"));
    const withMtime = entries.map((name) => {
      const fullPath = path.join(dir, name);
      try {
        return { path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
      } catch {
        return null;
      }
    }).filter((e): e is { path: string; mtimeMs: number } => e !== null);
    withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withMtime.map((e) => e.path);
  } catch {
    return [];
  }
}

export function persistSummary(
  summary: string,
  prefix: string,
  sessionId?: string,
  taskId?: string | null,
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

    // Also write to well-known path so the calling session can find it
    // without needing the background task's stdout.
    try {
      const wellKnown = getWellKnownSummaryPath(prefix, taskId, projectRoot);
      fs.writeFileSync(wellKnown, summary, "utf8");
    } catch (wkError) {
      logWarn("agent-launcher", `Failed to write well-known summary: ${String(wkError)}`);
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
