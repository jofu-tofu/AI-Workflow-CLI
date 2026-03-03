/**
 * Formatters for context management templates.
 * Constants and helpers for consistent formatting across hooks and display.
 * See SPEC.md §13
 */

import type { Task } from "../types.js";

// §13.1 — Legacy mode display mapping (used by handoff/document_generator)
export const LEGACY_MODE_MAP: Record<string, string> = {
  planning: "[Planning]",
  pending_implementation: "[Plan Ready]",
  implementing: "[Implementing]",
  none: "",
};

// §13.2 — Status icon mapping
export const STATUS_ICONS: Record<string, string> = {
  pending: "⬜",
  in_progress: "🔄",
  blocked: "🚫",
  completed: "✅",
};

export function getModeDisplay(mode: string): string {
  return LEGACY_MODE_MAP[mode] ?? "";
}

export function getStatusIcon(status: string): string {
  return STATUS_ICONS[status] ?? "⬜";
}

// §13.3 — Task rendering
export function renderTaskItem(
  task: Record<string, unknown> | Task,
  showDescription = true,
  maxDescriptionLength = 100,
): string {
  const status = (task as unknown).status ?? "pending";
  const subject = (task as unknown).subject ?? "";
  const description = (task as unknown).description ?? "";

  const icon = getStatusIcon(status);
  const statusText = `[${status.toUpperCase()}]`;
  const line = `- ${icon} ${statusText} ${subject}`;

  if (showDescription && description) {
    let truncated = description.slice(0, maxDescriptionLength);
    if (description.length > maxDescriptionLength) {
      truncated += "...";
    }

    return `${line}\n  - ${truncated}`;
  }

  return line;
}

export function renderTaskList(
  tasks: Array<Record<string, unknown> | Task>,
  header = "Active Tasks",
  showDescription = true,
): string {
  const lines = [`### ${header}`, ""];

  if (tasks.length === 0) {
    lines.push("No active tasks.");
  } else {
    for (const task of tasks) {
      lines.push(renderTaskItem(task, showDescription));
    }
  }

  lines.push("");
  return lines.join("\n");
}

// §13.4 — Continuation headers
const CONTINUATION_HEADERS: Record<string, (id: string) => string> = {
  context: (id) => `## CONTINUING CONTEXT: ${id}`,
  resuming: (id) => `## RESUMING FROM HANDOFF: ${id}`,
  implementing: (id) => `## CONTINUING IMPLEMENTATION: ${id}`,
  handoff: (id) => `# Session Handoff: ${id}`,
};

export function formatContinuationHeader(
  headerType: string,
  contextId: string,
): string {
  const fn = CONTINUATION_HEADERS[headerType];
  return fn ? fn(contextId) : `## ${contextId}`;
}

// §13.5 — Reason formatting
export const REASON_MAP: Record<string, string> = {
  low_context: "Context window running low",
  user_requested: "User requested handoff",
  error_recovery: "Error recovery",
  session_end: "Session ending",
};

export function formatReason(reason: string): string {
  return REASON_MAP[reason] ?? reason;
}

