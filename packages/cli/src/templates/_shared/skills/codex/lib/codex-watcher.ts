import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

import { inference } from "../../../lib-ts/runtime/inference.js";
import { logDebug, logWarn } from "../../../lib-ts/runtime/logger.js";
import { CODEX_MODELS } from "../../../lib-ts/runtime/models.js";
import { execFileAsync, findExecutable } from "../../../lib-ts/runtime/subprocess-utils.js";

type PaneBackend = "tmux" | "window" | "exec";

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 3000;
export const SUMMARY_TIMEOUT_SEC = 8;
export const RESUME_TIMEOUT_MS = 45_000;
export const MAX_TRANSCRIPT_LINES = 220;
export const MAX_LINE_LENGTH = 500;
export const WAIT_TIMEOUT_MS_DEFAULT = 14_400_000;
export const SUMMARY_UNAVAILABLE_MESSAGE = "Codex session completed. Summary unavailable.";

export interface PaneWatchTarget {
  backend?: PaneBackend;
  paneId?: string;
  sentinelPath?: string;
}

export const TRANSCRIPT_SUMMARY_PROMPT = `Summarize this Codex session transcript excerpt.
Return 3-5 concise bullet points.
Focus on:
- what was accomplished
- files changed
- errors or blockers
Do not ask follow-up questions.
Do not request additional input.
If information is partial, provide best-effort summary from available text.`;

export const RESUME_SUMMARY_PROMPT = `Summarize the previous Codex session in 3-5 concise bullet points.
Focus on:
- what was accomplished
- files changed
- errors or blockers
Do not ask follow-up questions.
Do not request additional input.
If the prior session was brief, still provide a best-effort summary.`;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function safeCleanup(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

export function readTextIfExists(filePath: string): string {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

export function persistSummary(
  summary: string,
  sessionId?: string,
): string | null {
  try {
    const suffix = sessionId
      ? sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "").slice(0, 8)
      : String(process.pid);
    const filePath = path.join(
      os.tmpdir(),
      `codex-summary-${Date.now()}-${suffix}.md`,
    );
    fs.writeFileSync(filePath, summary, "utf8");
    // Normalize to forward slashes for cross-platform path parsing
    return filePath.replaceAll("\\", "/");
  } catch (error) {
    logWarn("codex-capture", `Failed to persist summary: ${String(error)}`);
    return null;
  }
}

export function normalizeText(text: string): string {
  return text
    .replaceAll('\r', "")
    .replaceAll(/\p{Cc}/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function getMessageContentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((entry: unknown) => {
      if (!entry || typeof entry !== "object") return "";
      if (typeof entry.text !== "string") return "";
      return entry.text;
    })
    .join("\n");
}

export function collectTranscriptLines(sessionFile: string): string[] {
  if (!sessionFile || !fs.existsSync(sessionFile)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  try {
    const raw = fs.readFileSync(sessionFile, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      let role = "";
      let text = "";

      if (parsed?.type === "response_item" && parsed?.payload?.type === "message") {
        role = parsed?.payload?.role === "assistant" ? "assistant" : (parsed?.payload?.role === "user" ? "user" : "");
        text = getMessageContentText(parsed?.payload?.content);
      } else if (parsed?.type === "item.completed" && parsed?.item?.type === "agent_message" && typeof parsed?.item?.text === "string") {
        role = "assistant";
        text = parsed.item.text;
      } else if (parsed?.type === "event_msg" && parsed?.payload?.type === "agent_message" && typeof parsed?.payload?.message === "string") {
        role = "assistant";
        text = parsed.payload.message;
      }

      const normalized = normalizeText(text);
      if (!role || !normalized) continue;

      const truncated = normalized.length > MAX_LINE_LENGTH ? `${normalized.slice(0, MAX_LINE_LENGTH)}...` : normalized;
      const tagged = `${role}: ${truncated}`;
      if (seen.has(tagged)) continue;

      seen.add(tagged);
      out.push(tagged);
    }
  } catch (error) {
    logWarn("codex-capture", `Session transcript parse failed: ${String(error)}`);
  }

  return out.slice(-MAX_TRANSCRIPT_LINES);
}

export function looksLikeBadSummary(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("don't see") ||
    normalized.includes("no output") ||
    normalized.includes("could you provide") ||
    normalized.includes("paste")
  );
}

async function waitForSentinelClose(sentinelPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (fs.existsSync(sentinelPath)) return;
    if (Date.now() >= deadline) {
      logDebug("codex-capture", `watch timeout reached waiting for sentinel ${sentinelPath}`);
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
    logDebug("codex-capture", `No pane watcher for backend=${backend}; continuing without wait`);
    return;
  }

  if (!paneId) return;

  const tmuxPath = findExecutable("tmux");
  if (!tmuxPath) {
    logWarn("codex-capture", `tmux unavailable while watching pane ${paneId}`);
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (Date.now() >= deadline) {
      logDebug("codex-capture", `watch timeout reached for pane ${paneId} after ${timeoutMs}ms`);
      return;
    }

    const result = await execFileAsync(tmuxPath, ["list-panes", "-a", "-F", "#{pane_id}"], {
      timeout: POLL_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      logDebug("codex-capture", `list-panes failed; assuming pane closed (${result.stderr.trim() || "no stderr"})`);
      return;
    }

    const activePaneIds = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!activePaneIds.includes(paneId)) return;

    const remainingMs = deadline - Date.now();
    await sleep(Math.max(0, Math.min(POLL_INTERVAL_MS, remainingMs)));
  }
}

export async function summarizeViaSessionFile(sessionFile: string): Promise<string | null> {
  const transcriptLines = collectTranscriptLines(sessionFile);
  if (transcriptLines.length === 0) return null;

  const transcript = transcriptLines.join("\n");
  const fullPrompt = `${TRANSCRIPT_SUMMARY_PROMPT}\n\nSession transcript excerpt:\n\n${transcript}`;

  const codexResult = await execFileAsync(
    "codex",
    ["exec", fullPrompt, "--model", CODEX_MODELS.spark, "--json"],
    { timeout: SUMMARY_TIMEOUT_SEC * 1000 },
  );
  if (codexResult.exitCode === 0 && codexResult.stdout.trim()) {
    const output = codexResult.stdout.trim();
    if (!looksLikeBadSummary(output)) return output;
  }
  logWarn(
    "codex-capture",
    `Codex Spark transcript summary failed (exit=${codexResult.exitCode}), falling back to Haiku`,
  );

  const result = inference(
    TRANSCRIPT_SUMMARY_PROMPT,
    `Session transcript excerpt:\n\n${transcript}`,
    "fast",
    SUMMARY_TIMEOUT_SEC,
  );

  if (result.success && result.output && result.output.trim() && !looksLikeBadSummary(result.output)) {
    return result.output.trim();
  }

  logWarn(
    "codex-capture",
    `Session-file Spark summary failed: ${result.error ?? "empty or low-signal output"}`,
  );
  return null;
}

export function extractResumeSummary(text: string): string {
  if (!text) return "";

  const normalized = text.replaceAll("\r", "");
  const marker = /(?:^|\n)codex\n/.exec(normalized);
  if (!marker) return "";

  const lines = normalized.slice(marker.index + marker[0].length).split("\n");
  const bullets: string[] = [];
  let collecting = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!collecting && line.length === 0) continue;
    if (line.startsWith("- ")) {
      bullets.push(line);
      collecting = true;
      continue;
    }
    if (collecting) break;
  }

  return bullets.length >= 2 ? bullets.join("\n") : "";
}

export async function summarizeViaResume(sessionId: string): Promise<string | null> {
  const outputFile = path.join(os.tmpdir(), `codex-resume-summary-${Date.now()}-${process.pid}.txt`);

  const result = await execFileAsync(
    "codex",
    [
      "exec",
      "resume",
      sessionId,
      RESUME_SUMMARY_PROMPT,
      "--json",
      "--model",
      CODEX_MODELS.spark,
      "--output-last-message",
      outputFile,
    ],
    { timeout: RESUME_TIMEOUT_MS },
  );

  const summary = readTextIfExists(outputFile);
  safeCleanup(outputFile);

  if (summary && !looksLikeBadSummary(summary)) return summary;

  const stdoutSummary = extractResumeSummary(result.stdout);
  if (stdoutSummary && !looksLikeBadSummary(stdoutSummary)) return stdoutSummary;

  const stderrSummary = extractResumeSummary(result.stderr);
  if (stderrSummary && !looksLikeBadSummary(stderrSummary)) return stderrSummary;

  const stderrTrimmed = result.stderr.trim();
  const stderrPreview = stderrTrimmed.length > 200 ? `${stderrTrimmed.slice(0, 200)}...` : (stderrTrimmed || "none");
  logWarn("codex-capture", `codex exec resume failed for ${sessionId}: exit=${result.exitCode}, stderr=${stderrPreview}`);
  return null;
}

export function summarizeFromSessionFileFallback(sessionFile: string): string | null {
  const lines = collectTranscriptLines(sessionFile).slice(-12);
  if (lines.length === 0) return null;
  return `Codex session completed. Transcript fallback:\n- ${lines.join("\n- ")}`;
}



