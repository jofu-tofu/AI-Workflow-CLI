/**
 * Formatting module for context display output.
 * See SPEC.md §11
 *
 * All functions accept a ContextState with fields:
 *   id, summary, mode, last_active, plan_path, handoff_path,
 *   tasks[], last_session, session_ids, status, method, tags
 */

import * as fs from "node:fs";
import path from "node:path";

import { getContextDir } from "../runtime/constants.js";
import { displayPath, parseIsoTimestamp } from "../runtime/utils.js";
import type { ContextState, Task } from "../types.js";

const MAX_PLAN_INLINE_CHARS = 30_000;


// ---------------------------------------------------------------------------
// Mode display
// ---------------------------------------------------------------------------

const MODE_DISPLAY_MAP: Record<string, string> = {
  idle: "",
  has_staged_work: "[Staged]", // CHANGED: unified mode (plan or handoff)
  active: "[Active]",
};

/**
 * Get bracketed display string for mode, or empty for idle.
 * See SPEC.md §11.2
 */
export function getModeDisplay(mode: string): string {
  return MODE_DISPLAY_MAP[mode] ?? "";
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Format ISO timestamp as '2 hours ago', 'yesterday', etc.
 * See SPEC.md §11.3
 */
export function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "unknown";

  const dt = parseIsoTimestamp(isoTimestamp);
  if (!dt) return isoTimestamp.slice(0, 16);

  const now = new Date();

  // Strip timezone info for comparison
  const diffMs = now.getTime() - dt.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMin === 0) return "just now";
      return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;
    }
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  // Older: show date
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function taskAttr(task: Task | Record<string, unknown>, key: string, defaultVal = ""): string {
  if (typeof task === "object" && task !== null) {
    const value = (task as Record<string, unknown>)[key];
    return typeof value === "string" ? value : defaultVal;
  }
  return defaultVal;
}

function readPlanContent(planPath: string): [string | null, boolean, number] {
  try {
    if (!fs.existsSync(planPath)) return [null, false, 0];
    const content = fs.readFileSync(planPath, "utf8");
    const total = content.length;
    if (total > MAX_PLAN_INLINE_CHARS) {
      return [content.slice(0, MAX_PLAN_INLINE_CHARS), true, total];
    }
    return [content, false, total];
  } catch {
    return [null, false, 0];
  }
}

function modeLabel(ctx: ContextState): string {
  const d = getModeDisplay(ctx.mode ?? "idle");
  return d ? d.replaceAll(/^\[|\]$/g, "") : "Active";
}

/**
 * Build restore sections from last_session, tasks, and plan_path.
 * See SPEC.md §11.4
 */
export function buildRestoreSections(
  ctx: ContextState,
  projectRoot?: string,
  inlinePlan = false,
): string {
  const sections: string[] = [];
  const lastSession = ctx.last_session ?? {};

  if (lastSession) {
    const savedAt = lastSession.saved_at ?? "";
    if (savedAt) {
      const reason = lastSession.save_reason ?? "";
      const reasonDisplay = reason ? reason.replaceAll('_', " ") : "unknown";
      sections.push(`**Last session ended:** ${formatRelativeTime(savedAt)} (${reasonDisplay})`);
    }
  }

  const tasks = ctx.tasks ?? [];
  if (tasks.length > 0) {
    const buckets: Record<string, string[]> = {
      completed: [],
      in_progress: [],
      pending: [],
      blocked: [],
    };
    for (const t of tasks) {
      const s = taskAttr(t, "status", "pending");
      if (buckets[s]) {
        buckets[s]!.push(taskAttr(t, "subject"));
      }
    }
    if (Object.values(buckets).some(b => b.length > 0)) {
      sections.push("", `### Previous Work (${tasks.length} tasks)`, "");
      const marks: Record<string, string> = {
        completed: "[x]",
        in_progress: "[~]",
        pending: "[ ]",
        blocked: "[!]",
      };
      for (const [status, mark] of Object.entries(marks)) {
        for (const subj of buckets[status] ?? []) {
          sections.push(`- ${mark} ${subj}`);
        }
      }
    }
  }

  const planPath = ctx.plan_path;
  if (planPath) {
    if (inlinePlan) {
      const [content, truncated, totalChars] = readPlanContent(planPath);
      if (content) {
        let header = `Plan loaded from: \`${displayPath(planPath)}\``;
        if (truncated) header += ` (truncated, ${totalChars} chars total)`;
        sections.push("", "### Plan", header, "", content);
        if (truncated) {
          sections.push(`\n*Plan truncated at ${MAX_PLAN_INLINE_CHARS} characters. Full plan at: \`${displayPath(planPath)}\`*`);
        }
      } else {
        sections.push("", "### Plan", `*Plan file not found at \`${displayPath(planPath)}\`.*`);
      }
    } else {
      sections.push("", "### Plan", `Read the plan at: \`${displayPath(planPath)}\``);
    }
  }

  const gitState = lastSession?.git_state ?? {};
  if (gitState && Object.keys(gitState).length > 0) {
    const branch = gitState.branch ?? "unknown";
    const uncommitted: string[] = gitState.uncommitted_files ?? [];
    const lastCommit = gitState.last_commit_short ?? "";
    let uncStr = uncommitted.length > 0 ? uncommitted.slice(0, 5).join(", ") : "none";
    if (uncommitted.length > 5) uncStr += ` (+${uncommitted.length - 5} more)`;
    sections.push("", "### Git State", `Branch: ${branch} | Uncommitted: ${uncStr}`);
    if (lastCommit) sections.push(`Last commit: ${lastCommit}`);
  }

  return sections.join("\n");
}

function resumeBlock(ctx: ContextState, projectRoot: string | undefined, modeText: string, instructions: string[]): string {
  const lines = [
    `## Resuming Context: ${ctx.id}`, "",
    `**Summary:** ${ctx.summary}`,
    `**Mode:** ${modeText}`,
  ];
  const restore = buildRestoreSections(ctx, projectRoot, true);
  if (restore) lines.push(restore);
  lines.push("", "---", "", "**Instructions:**");
  lines.push(...instructions);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public formatters
// ---------------------------------------------------------------------------

/**
 * Format output when resuming a context with a pending handoff.
 * See SPEC.md §11.5
 */
export function formatHandoffContinuation(ctx: ContextState, projectRoot?: string): string {
  const handoffPath = ctx.handoff_path ?? "";
  const lines = [
    `## Resuming Context: ${ctx.id} (Handoff Available)`, "",
    `**Summary:** ${ctx.summary}`,
    `**Mode:** Implementing (handoff from previous session)`, "",
  ];

  try {
    if (handoffPath && fs.existsSync(handoffPath)) {
      lines.push("### Previous Session Handoff", "", fs.readFileSync(handoffPath, "utf8"), "");
    } else {
      lines.push(`*Handoff document not found at \`${displayPath(handoffPath)}\`*`, "");
    }
  } catch (error: unknown) {
    lines.push(`*Handoff document at \`${displayPath(handoffPath)}\` could not be read: ${error}*`, "");
  }

  const restore = buildRestoreSections(ctx, projectRoot, true);
  if (restore) lines.push(restore);

  lines.push("", "---", "", "**Instructions:**",
    "1. Review the handoff document above - especially dead ends",
    "2. Check the plan file for remaining tasks",
    "3. Continue implementation from where the previous session left off");
  return lines.join("\n");
}

/**
 * Build lightweight orientation for external agents (Codex, etc.).
 * Tells the agent where the context folder and key paths are — no session state.
 */
export function buildExternalAgentContext(
  ctx: ContextState,
  projectRoot: string,
): string {
  const contextDir = getContextDir(ctx.id, projectRoot);
  const notesDir = path.join(contextDir, "notes");
  const lines = [
    "## Project Context",
    "",
    `- **Context ID:** ${ctx.id}`,
    `- **Context folder:** ${displayPath(contextDir)}`,
    `- **Notes folder:** ${displayPath(notesDir)}`,
  ];
  return lines.join("\n");
}

/**
 * Format output for pending plan implementation (mode=has_plan).
 * See SPEC.md §11.6
 */
export function formatPlanContinuation(ctx: ContextState, projectRoot?: string): string {
  return resumeBlock(ctx, projectRoot, "Pending Implementation", [
    "1. Review the plan and previous work above",
    "2. Continue from where the previous session left off",
  ]);
}

/**
 * Format output for ongoing implementation (mode=active).
 * See SPEC.md §11.7
 */
export function formatActiveContinuation(ctx: ContextState, projectRoot?: string): string {
  return resumeBlock(ctx, projectRoot, "Implementing", [
    "1. Review the plan and previous work above",
    "2. Continue from where the previous session left off",
  ]);
}

/**
 * Format list of contexts for display.
 * See SPEC.md §11.8
 */
export function formatContextList(contexts: ContextState[]): string {
  if (contexts.length === 0) return "No active contexts found.";

  const lines = ["## Active Contexts\n"];
  for (const [i, context_] of contexts.entries()) {
    const ctx = context_!;
    const timeStr = formatRelativeTime(ctx.last_active);
    const md = getModeDisplay(ctx.mode ?? "idle");
    const si = md ? ` ${md}` : "";
    lines.push(`**${i + 1}. ${ctx.id}**${si}`);
    lines.push(`   ${ctx.summary}`);
    if (ctx.method) {
      lines.push(`   Method: ${ctx.method} | Last active: ${timeStr}`);
    } else {
      lines.push(`   Last active: ${timeStr}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Format notification for a newly created context.
 * See SPEC.md §11.9
 */
export function formatContextCreated(ctx: ContextState): string {
  return [
    `## Context Created: ${ctx.id}`, "",
    `**Summary:** ${ctx.summary}`, "",
    "A new context has been created for this work.",
    "Tasks created with TaskCreate will be persisted to this context.",
  ].join("\n");
}

/**
 * Format system reminder: lightweight (per-prompt) or rich (first-bind restore).
 * See SPEC.md §11.10
 */
export function formatActiveContextReminder(
  ctx: ContextState,
  projectRoot?: string,
  includeRestore = false,
): string {
  const timeStr = formatRelativeTime(ctx.last_active);
  const label = modeLabel(ctx);

  if (includeRestore) {
    const lines = [
      `## Resuming Context: ${ctx.id}`, "",
      `**Summary:** ${ctx.summary}`,
      `**Mode:** ${label}`,
    ];
    const restore = buildRestoreSections(ctx, projectRoot, true);
    if (restore) lines.push(restore);
    lines.push("", "---", "", "**Instructions:**",
      "1. Review the previous work above",
      "2. Continue from where the previous session left off");
    return lines.join("\n");
  }

  return [
    `## Active Context: ${ctx.id}`, "",
    `**Summary:** ${ctx.summary}`,
    `**Mode:** ${label}`,
    `**Last Active:** ${timeStr}`, "",
    `All work belongs to context "${ctx.id}".`,
    "Tasks created with TaskCreate will be persisted to this context.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Picker / command feedback
// ---------------------------------------------------------------------------

/**
 * Format the boxed picker shown on stderr when blocking for selection.
 * See SPEC.md §11.11
 */
export function formatContextPickerStderr(contexts: ContextState[]): string {
  const lines = [
    "",
    "+----------------------------------------------------------------+",
    "|                   CONTEXT SELECTION REQUIRED                   |",
    "+----------------------------------------------------------------+",
  ];

  let selectableCount = 0;
  for (const [i, context_] of contexts.entries()) {
    const ctx = context_!;
    const timeStr = formatRelativeTime(ctx.last_active);
    const mode = ctx.mode ?? "idle";
    const isSelectable = mode === "active" || Boolean(ctx.handoff_path);
    if (isSelectable) selectableCount++;

    let status = "";
    if (ctx.handoff_path) {
      status = " [Handoff Ready]";
    } else if (getModeDisplay(mode)) {
      status = ` ${getModeDisplay(mode)}`;
    }

    const summary = ctx.summary.length > 48 ? ctx.summary.slice(0, 45) + "..." : ctx.summary;
    const selTag = isSelectable ? " [selectable]" : " [end only]";

    lines.push(`|  ^${i + 1}  ${ctx.id}${status}${selTag}`);
    lines.push(`|       ${summary}`);
    lines.push(`|       [${timeStr}]`);
    lines.push("|");
  }

  lines.push(
    "+----------------------------------------------------------------+",
    "|  Usage:                                                        |",
    "|    ^S<N>                 - Select context by number            |",
    "|    ^E<N>                 - End/complete context by number      |",
    "|    ^S:query              - Select by ID match (race-safe)       |",
    "|    ^E:query              - End by ID match (race-safe)         |",
    "|    ^E<N>+                - End context N and all after         |",
    "|    ^E*                   - End ALL contexts                    |",
    "|    ^E1E2S3               - End #1 and #2, select #3           |",
    "|    ^E:fooS:bar           - End 'foo...', select 'bar...'       |",
    "|    ^0 work description   - Create new context (10+ chars)     |",
    "+----------------------------------------------------------------+",
  );

  if (selectableCount === 0) {
    lines.push(
      "|  NOTE: No selectable contexts.                                |",
      "|        Use ^E<N> to end old contexts, then ^0 to create new.  |",
      "+----------------------------------------------------------------+",
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Format feedback about caret command operations performed.
 * See SPEC.md §11.12
 */
export function formatCommandFeedback(
  endedContexts: ContextState[],
  selectedContext: ContextState | null,
): string {
  const lines: string[] = [];
  if (endedContexts.length > 0) {
    lines.push("## Contexts Ended", "");
    for (const ctx of endedContexts) {
      const s = ctx.summary.length > 50 ? ctx.summary.slice(0, 50) + "..." : ctx.summary;
      lines.push(`- **${ctx.id}**: ${s}`);
    }
    lines.push("");
  }

  if (selectedContext) {
    const label = modeLabel(selectedContext);
    const timeStr = formatRelativeTime(selectedContext.last_active);
    lines.push(
      `## Active Context: ${selectedContext.id}`, "",
      `**Summary:** ${selectedContext.summary}`,
      `**Mode:** ${label}`,
      `**Last Active:** ${timeStr}`, "",
      `All work belongs to context "${selectedContext.id}".`,
      "Tasks created with TaskCreate will be persisted to this context.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Context Inventory
// ---------------------------------------------------------------------------

/** Collector function: scans one aspect of the context folder, returns markdown or null. */
type InventoryCollector = (
  contextId: string,
  contextDir: string,
  state: ContextState,
) => string | null;

/** Descriptions for known context subfolders. */
const KNOWN_FOLDERS: Record<string, string> = {
  "plans": "Archived implementation plans from plan mode",
  "session-transcripts": "JSONL records of previous agent sessions — read these to understand prior work",
  "handoffs": "Structured briefing documents for session continuity",
  "reviews": "Plan review artifacts (reviewer verdicts, corroboration reports)",
  "notes": "Analysis files, reports, and documentation that don't belong in the codebase",
};

function collectFolderPath(contextId: string, contextDir: string, _state: ContextState): string | null {
  if (!fs.existsSync(contextDir)) return null;
  return `**Context folder:** \`${displayPath(contextDir)}\`\n**State file:** \`${displayPath(path.join(contextDir, "state.json"))}\` — contains session history, task records, plan/handoff metadata`;
}

function collectStatePointers(contextId: string, contextDir: string, state: ContextState): string | null {
  const pointers: string[] = [];
  if (state.plan_path) {
    const exists = fs.existsSync(state.plan_path);
    pointers.push(`- **Active plan:** \`${displayPath(state.plan_path)}\`${exists ? "" : " (not found)"}`);
  }
  if (state.handoff_path) {
    const exists = fs.existsSync(state.handoff_path);
    pointers.push(`- **Active handoff:** \`${displayPath(state.handoff_path)}\`${exists ? "" : " (not found)"}`);
  }
  if (pointers.length === 0) return null;
  return "**Key artifacts:**\n" + pointers.join("\n");
}

function countFiles(dirPath: string): number {
  try {
    return fs.readdirSync(dirPath).length;
  } catch { return 0; }
}

function collectFolderInventory(contextId: string, contextDir: string, _state: ContextState): string | null {
  if (!fs.existsSync(contextDir)) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(contextDir, { withFileTypes: true });
  } catch { return null; }

  const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  if (dirs.length === 0) return null;

  const lines: string[] = ["**Available folders:**"];
  for (const dir of dirs) {
    const dirPath = path.join(contextDir, dir.name);
    const desc = KNOWN_FOLDERS[dir.name] ?? "Project-specific artifacts";
    const fileCount = countFiles(dirPath);
    lines.push(`- \`${dir.name}/\` — ${desc} (${fileCount} file${fileCount !== 1 ? "s" : ""})`);
  }
  return lines.join("\n");
}

function collectSessionStats(contextId: string, contextDir: string, state: ContextState): string | null {
  const sessionCount = (state.session_ids ?? []).length;
  if (sessionCount === 0) return null;

  const transcriptsDir = path.join(contextDir, "session-transcripts");
  let transcriptCount = 0;
  let timeRange = "";

  if (fs.existsSync(transcriptsDir)) {
    try {
      const files = fs.readdirSync(transcriptsDir).filter(f => f.endsWith(".jsonl")).sort();
      transcriptCount = files.length;
      if (files.length > 1) {
        const oldest = files[0]!.slice(0, 10);
        const newest = files.at(-1)!.slice(0, 10);
        if (oldest !== newest) timeRange = ` (${oldest} to ${newest})`;
      }
    } catch { /* ignore */ }
  }

  let line = `**Sessions:** ${sessionCount} total`;
  if (transcriptCount > 0) {
    line += `, ${transcriptCount} transcript${transcriptCount !== 1 ? "s" : ""} archived${timeRange}`;
  }
  return line;
}

function collectNotesGuidance(contextId: string, contextDir: string, _state: ContextState): string | null {
  const notesDir = path.join(contextDir, "notes");
  return `**Notes:** Put notes and files that don't belong in the codebase here. Reference them in other documents as needed: \`${displayPath(notesDir)}\``;
}

/** Ordered list of inventory collectors. Append new collectors here. */
const INVENTORY_COLLECTORS: InventoryCollector[] = [
  collectFolderPath,
  collectStatePointers,
  collectFolderInventory,
  collectSessionStats,
  collectNotesGuidance,
];

/**
 * Build a markdown inventory of resources available in the context folder.
 * Returns null if the context folder doesn't exist yet (brand new context).
 */
export function buildContextInventory(
  state: ContextState,
  projectRoot: string,
): string | null {
  const contextDir = getContextDir(state.id, projectRoot);
  if (!fs.existsSync(contextDir)) return null;

  const sections = INVENTORY_COLLECTORS
    .map(c => c(state.id, contextDir, state))
    .filter((s): s is string => s !== null);

  if (sections.length === 0) return null;
  return "### Context Resources\n\n" + sections.join("\n\n");
}



