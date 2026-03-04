/**
 * Plan lifecycle management — archival, lookup, and path extraction.
 * See SPEC.md §9
 *
 * Provides pure-data operations on plan files:
 * - archivePlan: copy plan to context plans/ folder, compute hash + signature
 * - findLatestPlan: locate the most relevant plan for a context
 * - extractPlanPathFromResult: parse plan path from ExitPlanMode output
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

import { atomicWrite } from "../runtime/atomic-write.js";
import { getContextPlansDir, sanitizeTitle } from "../runtime/constants.js";
import { logDebug, logInfo, logWarn, logError } from "../runtime/logger.js";
import { generateSlug } from "../runtime/utils.js";

// ---------------------------------------------------------------------------
// Plan archival
// ---------------------------------------------------------------------------

/**
 * Archive a plan file to the context's plans/ folder.
 * Computes a content hash and signature.
 * Does NOT modify state.json or mode.
 * See SPEC.md §9.2
 *
 * Returns [archivedPath, planHash, planSignature] on success,
 * or [null, null, null] on error.
 */
export function archivePlan(
  planPath: string,
  contextId: string,
  projectRoot?: string,
): [string | null, string | null, string | null] {
  if (!fs.existsSync(planPath)) {
    logWarn("plan_manager", `Plan file not found: ${planPath}`);
    return [null, null, null];
  }

  let content: string;
  try {
    content = fs.readFileSync(planPath, "utf8");
  } catch (error_: unknown) {
    logError("plan_manager", `Failed to read plan: ${error_}`);
    return [null, null, null];
  }

  // Compute hash and signature
  const planHash = crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12);
  const planSignature = content.slice(0, 200);

  // Ensure plans directory exists
  const plansDir = getContextPlansDir(contextId, projectRoot);
  fs.mkdirSync(plansDir, { recursive: true });

  // Generate archive filename: YYYY-MM-DD-HHMM-<slug>.md
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    "-",
    String(now.getMonth() + 1).padStart(2, "0"),
    "-",
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");

  // Extract a clean summary from plan content for slug generation.
  // Headings describe the plan's intent better than raw markdown body.
  const summary = extractPlanSummary(content);
  const slug = generateSlug(summary, 60, sanitizeTitle(
    path.basename(planPath, path.extname(planPath)), 30,
  ));

  let archiveName = `${dateStr}-${slug}.md`;
  let archivePath = path.join(plansDir, archiveName);

  // Handle filename collisions
  let counter = 2;
  while (fs.existsSync(archivePath)) {
    archiveName = `${dateStr}-${slug}-${counter}.md`;
    archivePath = path.join(plansDir, archiveName);
    counter++;
  }

  // Write archived plan atomically
  const [success, error] = atomicWrite(archivePath, content);
  if (!success) {
    logError("plan_manager", `Failed to write archive: ${error}`);
    return [null, null, null];
  }

  logInfo("plan_manager", `Archived plan to: ${archivePath}`);
  return [archivePath, planHash, planSignature];
}

/**
 * Extract a human-readable summary from plan markdown content.
 * Pulls headings and the first substantial paragraph, producing
 * text suitable for the AI slug generator (which expects conversational input).
 */
function extractPlanSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  const parts: string[] = [];
  let firstParagraph = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Collect markdown headings (strip # prefix)
    if (trimmed.startsWith("#")) {
      const heading = trimmed.replace(/^#+\s*/, "");
      if (heading.length > 2) parts.push(heading);
    }
    // Grab first substantial non-heading line as context
    if (!firstParagraph && !trimmed.startsWith("#") && trimmed.length > 20) {
      firstParagraph = trimmed.slice(0, 120);
    }
    // Enough material for the AI
    if (parts.length >= 5) break;
  }

  if (firstParagraph) parts.push(firstParagraph);
  return parts.join(" ").slice(0, 500) || content.slice(0, 500);
}

// ---------------------------------------------------------------------------
// Plan lookup
// ---------------------------------------------------------------------------

/**
 * Find the most relevant plan file for a context.
 * Priority: state.json plan_path > most recent .md in plans/ dir.
 * See SPEC.md §9.3
 */
export function findLatestPlan(
  contextId: string,
  projectRoot?: string,
): string | null {
  // 1. Check state.json plan_path first
  try {
    // Dynamic import to avoid circular dependency at module level
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- dynamic require to avoid circular dependency
    const stateIo = require("../runtime/state-io.js");
    const state = stateIo.readStateJson(contextId, projectRoot);
    if (state?.plan_path && fs.existsSync(state.plan_path)) {
      return state.plan_path;
    }
  } catch (error: unknown) {
    logWarn("plan_manager", `Failed to check state.json plan_path: ${error}`);
  }

  // 2. Fall back to most recent .md in plans/ dir
  const plansDir = getContextPlansDir(contextId, projectRoot);
  if (fs.existsSync(plansDir)) {
    try {
      const files = fs.readdirSync(plansDir)
        .filter(f => f.endsWith(".md"))
        .map(f => {
          const fullPath = path.join(plansDir, f);
          return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        return files[0]!.path;
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plan identification and normalization
// ---------------------------------------------------------------------------

/**
 * Generate a short unique plan identifier (8 hex chars).
 * See SPEC.md §9.4
 */
export function generatePlanId(): string {
  return crypto.randomUUID().replaceAll('-', "").slice(0, 8);
}

/**
 * Aggressively normalize plan content for hashing.
 * Strips all XML/HTML tags and collapses whitespace.
 * See SPEC.md §9.5
 */
export function normalizePlanContent(text: string): string {
  let result = text.replaceAll(/<[^>]+>/g, "");
  result = result.replaceAll(/\s+/g, " ").trim();
  return result;
}

/**
 * Extract structural anchors from plan content.
 * Returns markdown headings + first substantial paragraph as short strings.
 * See SPEC.md §9.6
 */
export function extractPlanAnchors(content: string, maxAnchors = 5): string[] {
  const anchors: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") && trimmed.length > 3) {
      anchors.push(trimmed.slice(0, 80));
    } else if (anchors.length === 0 && trimmed.length > 20) {
      anchors.push(trimmed.slice(0, 80));
    }
    if (anchors.length >= maxAnchors) break;
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// Transcript-based plan path extraction
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Find the plan file path by parsing the session transcript JSONL.
 * Searches in reverse for the most recent Write tool call targeting .claude/plans/.
 * See SPEC.md §9.7
 */
export function findPlanPathInTranscript(transcriptPath: string): string | null {
  if (!transcriptPath) return null;

  if (!fs.existsSync(transcriptPath)) {
    logDebug("plan_manager", `Transcript not found: ${transcriptPath}`);
    return null;
  }

  let size: number;
  try {
    size = fs.statSync(transcriptPath).size;
  } catch {
    return null;
  }

  if (size > MAX_TRANSCRIPT_SIZE) {
    logWarn("plan_manager", `Transcript too large (${size} bytes), skipping`);
    return null;
  }

  let lines: string[];
  try {
    lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/);
  } catch (error: unknown) {
    logWarn("plan_manager", `Failed to read transcript: ${error}`);
    return null;
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;

    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    let contentArr: unknown;
    try {
      const message = (data as { message?: { content?: unknown } }).message;
      contentArr = message?.content;
    } catch {
      continue;
    }

    if (!Array.isArray(contentArr)) continue;

    for (const block of contentArr) {
      if (typeof block !== "object" || block === null) continue;
      if (block.type !== "tool_use" || block.name !== "Write") continue;

      const filePath = block.input?.file_path;
      if (!filePath) continue;

      // Check if path contains .claude/plans/ as consecutive parts
      const parts = filePath.replaceAll('\\', "/").split("/");
      for (let j = 0; j < parts.length - 1; j++) {
        if (parts[j] === ".claude" && parts[j + 1] === "plans") {
          logInfo("plan_manager", `Extracted plan path from transcript: ${filePath}`);
          return filePath;
        }
      }
    }
  }

  logDebug("plan_manager", "No plan Write found in transcript");
  return null;
}

// ---------------------------------------------------------------------------
// Path extraction from tool output
// ---------------------------------------------------------------------------

/**
 * Extract plan file path from ExitPlanMode tool result.
 * Parses the pattern: "Your plan has been saved to: <path>"
 * See SPEC.md §9.8
 */
export function extractPlanPathFromResult(toolResult: string): string | null {
  if (!toolResult) return null;
  const match = toolResult.match(/Your plan has been saved to:\s*(.+\.md)/);
  return match ? match[1]!.trim() : null;
}



