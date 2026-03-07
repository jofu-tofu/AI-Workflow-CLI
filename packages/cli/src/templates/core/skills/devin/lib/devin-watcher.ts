/**
 * Devin session discovery and summarization.
 *
 * Session discovery strategy (priority order):
 * 1. `devin list --format json` — parse session metadata, match by cwd + timestamp
 * 2. File scan of `~/.config/cognition/cli/` for session files
 * 3. Tmux pane scrollback capture (`tmux capture-pane -p -t <paneId>`)
 *
 * If no session transcript is found, falls back to SUMMARY_UNAVAILABLE_MESSAGE.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

import { inference } from "../../../lib-ts/runtime/inference.js";
import { logDebug, logWarn } from "../../../lib-ts/runtime/logger.js";
import { execFileAsync, findExecutable } from "../../../lib-ts/runtime/subprocess-utils.js";

// Re-export shared symbols for consumers
export {
  type PaneWatchTarget,
  persistSummary,
  waitForPaneClose,
} from "../../../lib-ts/runtime/agent-launcher.js";

export const SUMMARY_UNAVAILABLE_MESSAGE = "Devin session completed. Summary unavailable.";

const DEVIN_LIST_TIMEOUT_MS = 10_000;
const SUMMARY_TIMEOUT_SEC = 10;
const MAX_SCROLLBACK_LINES = 300;
const MAX_LINE_LENGTH = 500;

const TRANSCRIPT_SUMMARY_PROMPT = `Summarize this Devin session transcript excerpt.
Return 3-5 concise bullet points.
Focus on:
- what was accomplished
- files changed
- errors or blockers
Do not ask follow-up questions.
Do not request additional input.
If information is partial, provide best-effort summary from available text.`;

// ---------------------------------------------------------------------------
// Session Discovery via `devin list`
// ---------------------------------------------------------------------------

interface DevinSession {
  id?: string;
  session_id?: string;
  cwd?: string;
  created_at?: string;
  status?: string;
  title?: string;
  model?: string;
}

async function getDevinSessions(): Promise<DevinSession[]> {
  try {
    const result = await execFileAsync("devin", ["list", "--format", "json"], {
      timeout: DEVIN_LIST_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      logDebug("devin-watcher", `devin list failed: exit=${result.exitCode}`);
      return [];
    }

    const parsed = JSON.parse(result.stdout.trim());
    if (!Array.isArray(parsed)) return [];
    return parsed as DevinSession[];
  } catch (error) {
    logDebug("devin-watcher", `devin list parse failed: ${String(error)}`);
    return [];
  }
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

async function findDevinSessionViaList(
  projectRoot: string,
  launchStartedAtMs: number,
): Promise<DevinSession | null> {
  const sessions = await getDevinSessions();
  if (sessions.length === 0) return null;

  // Find sessions matching cwd and started after launch
  const candidates = sessions.filter((s) => {
    if (s.cwd && !samePath(s.cwd, projectRoot)) return false;
    if (s.created_at) {
      const createdMs = Date.parse(s.created_at);
      if (createdMs > 0 && createdMs < launchStartedAtMs - 5000) return false;
    }
    return true;
  });

  // Return the most recent matching session
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aMs = a.created_at ? Date.parse(a.created_at) : 0;
    const bMs = b.created_at ? Date.parse(b.created_at) : 0;
    return bMs - aMs;
  });

  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Session Discovery via File System
// ---------------------------------------------------------------------------

function findDevinSessionFiles(launchStartedAtMs: number): string[] {
  const cliDir = path.join(os.homedir(), ".config", "cognition", "cli");
  if (!fs.existsSync(cliDir)) return [];

  const files: string[] = [];
  try {
    const entries = fs.readdirSync(cliDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(cliDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        // Only consider files modified after launch
        if (stat.mtimeMs >= launchStartedAtMs - 5000) {
          files.push(fullPath);
        }
      } catch { /* skip */ }
    }
  } catch {
    logDebug("devin-watcher", "Failed to read ~/.config/cognition/cli/");
  }

  return files;
}

function readSessionFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Tmux Pane Scrollback Capture
// ---------------------------------------------------------------------------

async function capturePaneScrollback(paneId: string | null | undefined): Promise<string | null> {
  if (!paneId) return null;

  const tmuxPath = findExecutable("tmux");
  if (!tmuxPath) return null;

  try {
    const result = await execFileAsync(tmuxPath, [
      "capture-pane", "-p", "-t", paneId, "-S", `-${MAX_SCROLLBACK_LINES}`,
    ], { timeout: 5000 });

    if (result.exitCode !== 0 || !result.stdout.trim()) return null;

    const lines = result.stdout.split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        return trimmed.length > MAX_LINE_LENGTH
          ? `${trimmed.slice(0, MAX_LINE_LENGTH)}...`
          : trimmed;
      })
      .filter(Boolean);

    return lines.length > 0 ? lines.join("\n") : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------

function looksLikeBadSummary(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("don't see") ||
    normalized.includes("no output") ||
    normalized.includes("could you provide") ||
    normalized.includes("paste")
  );
}

function buildTranscriptFromSession(session: DevinSession): string | null {
  const parts: string[] = [];
  if (session.title) parts.push(`Title: ${session.title}`);
  if (session.status) parts.push(`Status: ${session.status}`);
  if (session.model) parts.push(`Model: ${session.model}`);
  if (session.id || session.session_id) parts.push(`Session: ${session.id ?? session.session_id}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

async function summarizeTranscript(transcript: string): Promise<string | null> {
  const result = inference(
    TRANSCRIPT_SUMMARY_PROMPT,
    `Session transcript excerpt:\n\n${transcript}`,
    "fast",
    SUMMARY_TIMEOUT_SEC,
  );

  if (result.success && result.output?.trim() && !looksLikeBadSummary(result.output)) {
    return result.output.trim();
  }

  logWarn("devin-watcher", `Transcript summary failed: ${result.error ?? "empty or low-signal output"}`);
  return null;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Discover and summarize a Devin session.
 * Tries multiple sources in priority order:
 * 1. devin list --format json → session metadata summary
 * 2. ~/.config/cognition/cli/ session files → parse transcript
 * 3. tmux pane scrollback → raw text summary
 */
export async function summarizeDevinSession(
  projectRoot: string,
  launchStartedAtMs: number,
  paneId?: string | null,
): Promise<string | null> {
  // Source 1: devin list metadata
  const session = await findDevinSessionViaList(projectRoot, launchStartedAtMs);
  if (session) {
    logDebug("devin-watcher", `Found session via devin list: ${session.id ?? session.session_id ?? "unknown"}`);
    const sessionMeta = buildTranscriptFromSession(session);
    if (sessionMeta) {
      const summary = await summarizeTranscript(sessionMeta);
      if (summary) return summary;
    }
  }

  // Source 2: session files in ~/.config/cognition/cli/
  const sessionFiles = findDevinSessionFiles(launchStartedAtMs);
  if (sessionFiles.length > 0) {
    logDebug("devin-watcher", `Found ${sessionFiles.length} session file(s) in cognition cli dir`);
    for (const filePath of sessionFiles) {
      const content = readSessionFileContent(filePath);
      if (content.length > 50) {
        const summary = await summarizeTranscript(content);
        if (summary) return summary;
      }
    }
  }

  // Source 3: tmux pane scrollback
  const scrollback = await capturePaneScrollback(paneId);
  if (scrollback) {
    logDebug("devin-watcher", `Using tmux scrollback (${scrollback.length} chars)`);
    const summary = await summarizeTranscript(scrollback);
    if (summary) return summary;

    // Raw fallback: return scrollback lines directly
    const lines = scrollback.split("\n").slice(-12);
    if (lines.length > 0) {
      return `Devin session completed. Transcript fallback:\n- ${lines.join("\n- ")}`;
    }
  }

  logWarn("devin-watcher", "No session data found from any source");
  return null;
}
