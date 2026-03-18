/**
 * Devin session discovery and summarization.
 *
 * Session discovery strategy (priority order):
 * 1. `devin list --format json` → match session by cwd + timestamp, then
 *    extract transcript from SQLite `message_nodes` table
 * 2. Tmux pane scrollback capture (`tmux capture-pane -p -t <paneId>`)
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
  looksLikeBadSummary,
  persistSummary,
  samePath,
  waitForPaneClose,
} from "../../../lib-ts/runtime/agent-launcher.js";

import {
  looksLikeBadSummary,
  samePath,
} from "../../../lib-ts/runtime/agent-launcher.js";

export const SUMMARY_UNAVAILABLE_MESSAGE = "Devin session completed. Summary unavailable.";

const DEVIN_LIST_TIMEOUT_MS = 10_000;
const SUMMARY_TIMEOUT_SEC = 10;
const MAX_SCROLLBACK_LINES = 300;
const MAX_LINE_LENGTH = 500;
const MAX_TRANSCRIPT_LINES = 220;

const SESSIONS_DB_PATH = path.join(
  os.homedir(), ".local", "share", "devin", "cli", "sessions.db",
);

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

/** Matches the actual `devin list --format json` output schema. */
interface DevinSession {
  id?: string;
  short_id?: string;
  title?: string;
  working_directory?: string;
  working_directory_display?: string;
  last_activity_at?: number;
  last_activity_ago?: string;
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

async function findDevinSessionViaList(
  projectRoot: string,
  launchStartedAtMs: number,
): Promise<DevinSession | null> {
  const sessions = await getDevinSessions();
  if (sessions.length === 0) return null;

  const launchStartedAtSec = Math.floor(launchStartedAtMs / 1000);

  const candidates = sessions.filter((s) => {
    if (s.working_directory && !samePath(s.working_directory, projectRoot)) return false;
    if (s.last_activity_at) {
      // last_activity_at is unix timestamp in seconds
      if (s.last_activity_at < launchStartedAtSec - 5) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Most recent first
  candidates.sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0));

  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Session Transcript Extraction via SQLite
// ---------------------------------------------------------------------------

/**
 * Extract user and assistant message text from the Devin session's
 * `message_nodes` table in `~/.local/share/devin/cli/sessions.db`.
 *
 * Uses `python3 -c` to query SQLite (avoids native module dependency).
 * Returns tagged transcript lines like `collectTranscriptLines` in
 * the Codex watcher.
 */
async function collectTranscriptFromDb(sessionId: string): Promise<string[]> {
  if (!fs.existsSync(SESSIONS_DB_PATH)) {
    logDebug("devin-watcher", "sessions.db not found");
    return [];
  }

  const script = `
import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute(
    "SELECT chat_message FROM message_nodes WHERE session_id = ? ORDER BY node_id",
    (sys.argv[2],),
)
for (raw,) in cur.fetchall():
    try:
        msg = json.loads(raw)
    except Exception:
        continue
    role = msg.get("role", "")
    if role not in ("user", "assistant"):
        continue
    content = msg.get("content", "")
    if isinstance(content, list):
        content = " ".join(
            c.get("text", "") for c in content if isinstance(c, dict)
        )
    if not isinstance(content, str) or not content.strip():
        continue
    print(json.dumps({"role": role, "text": content.strip()}))
conn.close()
`.trim();

  try {
    const result = await execFileAsync(
      "python3", ["-c", script, SESSIONS_DB_PATH, sessionId],
      { timeout: 10_000 },
    );

    if (result.exitCode !== 0) {
      logDebug("devin-watcher", `SQLite transcript query failed: exit=${result.exitCode}`);
      return [];
    }

    const out: string[] = [];
    const seen = new Set<string>();

    for (const line of result.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const { role, text } = JSON.parse(line) as { role: string; text: string };
        const normalized = text
          .replaceAll("\r", "")
          .replaceAll(/\p{Cc}/gu, "")
          .replaceAll(/\s+/g, " ")
          .trim();
        if (!normalized) continue;
        const truncated = normalized.length > MAX_LINE_LENGTH
          ? `${normalized.slice(0, MAX_LINE_LENGTH)}...`
          : normalized;
        const tagged = `${role}: ${truncated}`;
        if (seen.has(tagged)) continue;
        seen.add(tagged);
        out.push(tagged);
      } catch { /* skip malformed lines */ }
    }

    return out.slice(-MAX_TRANSCRIPT_LINES);
  } catch (error) {
    logDebug("devin-watcher", `SQLite transcript extraction failed: ${String(error)}`);
    return [];
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
 * 1. devin list → match session → extract transcript from SQLite message_nodes
 * 2. tmux pane scrollback → raw text summary
 */
export async function summarizeDevinSession(
  projectRoot: string,
  launchStartedAtMs: number,
  paneId?: string | null,
): Promise<string | null> {
  // Source 1: devin list → session ID → SQLite transcript
  const session = await findDevinSessionViaList(projectRoot, launchStartedAtMs);
  if (session?.id) {
    logDebug("devin-watcher", `Found session via devin list: ${session.id}`);

    const transcriptLines = await collectTranscriptFromDb(session.id);
    if (transcriptLines.length > 0) {
      logDebug("devin-watcher", `Extracted ${transcriptLines.length} transcript lines from SQLite`);
      const transcript = transcriptLines.join("\n");
      const summary = await summarizeTranscript(transcript);
      if (summary) return summary;
    }
  }

  // Source 2: tmux pane scrollback
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
