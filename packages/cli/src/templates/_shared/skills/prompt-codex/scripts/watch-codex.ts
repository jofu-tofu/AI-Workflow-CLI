#!/usr/bin/env bun

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { inference } from "../../../lib-ts/base/inference.js";
import { logDebug, logWarn } from "../../../lib-ts/base/logger.js";
import { CODEX_MODELS } from "../../../lib-ts/base/models.js";
import { execFileAsync } from "../../../lib-ts/base/subprocess-utils.js";
import { getTmuxAvailability } from "../../../lib-ts/base/tmux-driver.js";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3000;
const SUMMARY_TIMEOUT_SEC = 8;
const RESUME_TIMEOUT_MS = 45000;
const MAX_TRANSCRIPT_LINES = 220;
const MAX_LINE_LENGTH = 500;
const SUMMARY_UNAVAILABLE_MESSAGE = "Codex session completed. Summary unavailable.";

const TRANSCRIPT_SUMMARY_PROMPT = `Summarize this Codex session transcript excerpt.
Return 3-5 concise bullet points.
Focus on:
- what was accomplished
- files changed
- errors or blockers
Do not ask follow-up questions.
Do not request additional input.
If information is partial, provide best-effort summary from available text.`;

const RESUME_SUMMARY_PROMPT = `Summarize the previous Codex session in 3-5 concise bullet points.
Focus on:
- what was accomplished
- files changed
- errors or blockers
Do not ask follow-up questions.
Do not request additional input.
If the prior session was brief, still provide a best-effort summary.`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCleanup(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

function readTextIfExists(filePath: string): string {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getMessageContentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((entry: any) => {
      if (!entry || typeof entry !== "object") return "";
      if (typeof entry.text !== "string") return "";
      return entry.text;
    })
    .join("\n");
}

function collectTranscriptLines(sessionFile: string): string[] {
  if (!sessionFile || !fs.existsSync(sessionFile)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  try {
    const raw = fs.readFileSync(sessionFile, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

    for (const line of lines) {
      let parsed: any;
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

function looksLikeBadSummary(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("don't see") ||
    normalized.includes("no output") ||
    normalized.includes("could you provide") ||
    normalized.includes("paste")
  );
}

async function waitForPaneClose(paneId: string): Promise<void> {
  const tmux = getTmuxAvailability();
  if (!tmux.available || !tmux.tmuxPath) {
    logWarn("codex-capture", `tmux unavailable while watching pane ${paneId}: ${tmux.reason ?? "unknown reason"}`);
    return;
  }

  while (true) {
    const result = await execFileAsync(tmux.tmuxPath, ["list-panes", "-a", "-F", "#{pane_id}"], {
      timeout: POLL_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      logDebug("codex-capture", `list-panes failed; assuming pane closed (${result.stderr.trim() || "no stderr"})`);
      return;
    }

    const activePaneIds = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!activePaneIds.includes(paneId)) return;

    await sleep(POLL_INTERVAL_MS);
  }
}

function summarizeViaSessionFileSpark(sessionFile: string): string | null {
  const transcriptLines = collectTranscriptLines(sessionFile);
  if (transcriptLines.length === 0) return null;

  const transcript = transcriptLines.join("\n");
  const result = inference(
    TRANSCRIPT_SUMMARY_PROMPT,
    `Session transcript excerpt:\n\n${transcript}`,
    "fast",
    SUMMARY_TIMEOUT_SEC,
    { model: CODEX_MODELS.spark },
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

async function summarizeViaResume(sessionId: string): Promise<string | null> {
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
  logWarn("codex-capture", `codex exec resume failed for ${sessionId}: exit=${result.exitCode}, stderr=${result.stderr.trim() || "none"}`);
  return null;
}

function summarizeFromSessionFileFallback(sessionFile: string): string | null {
  const lines = collectTranscriptLines(sessionFile).slice(-12);
  if (lines.length === 0) return null;
  return `Codex session completed. Transcript fallback:\n- ${lines.join("\n- ")}`;
}

async function main(): Promise<void> {
  const [paneId, sessionId, sessionFile] = process.argv.slice(2);

  if (!paneId) {
    console.log(SUMMARY_UNAVAILABLE_MESSAGE);
    return;
  }

  await waitForPaneClose(paneId);

  const transcriptSummary = summarizeViaSessionFileSpark(sessionFile ?? "");
  if (transcriptSummary) {
    console.log(transcriptSummary);
    return;
  }

  if (sessionId) {
    const resumeSummary = await summarizeViaResume(sessionId);
    if (resumeSummary) {
      console.log(resumeSummary);
      return;
    }
  }

  const fallback = summarizeFromSessionFileFallback(sessionFile ?? "");
  if (fallback) {
    console.log(fallback);
    return;
  }

  console.log(SUMMARY_UNAVAILABLE_MESSAGE);
}

main().catch((error) => {
  logWarn("codex-capture", `watch-codex failed: ${String(error)}`);
  console.log(SUMMARY_UNAVAILABLE_MESSAGE);
  process.exit(0);
});
