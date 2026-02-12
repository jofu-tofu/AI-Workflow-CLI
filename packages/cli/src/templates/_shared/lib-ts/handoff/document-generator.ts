/**
 * Handoff document generator for context-aware session management.
 * See SPEC.md §12
 *
 * Creates structured handoff documents when a session needs to transfer
 * work to a new session (typically due to context window limits).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { atomicWrite } from "../base/atomic-write.js";
import { getContextDir, getContextHandoffsDir } from "../base/constants.js";
import { logError, logInfo } from "../base/logger.js";
import { nowIso } from "../base/utils.js";
import { getContext, saveState as _saveState } from "../context/context-store.js";
import { getTasks } from "../context/task-tracker.js";
import { formatContinuationHeader, formatReason, renderTaskList } from "../templates/formatters.js";
import type { HandoffDocument, Task as _Task } from "../types.js";

/**
 * Generate and save a handoff document for a context.
 * See SPEC.md §12.2
 */
export function generateHandoffDocument(
  contextId: string,
  reason = "low_context",
  workSummary = "",
  nextSteps?: string[],
  importantNotes?: string[],
  completedThisSession?: string[],
  projectRoot?: string,
): HandoffDocument | null {
  const context = getContext(contextId, projectRoot);
  if (!context) {
    logError("handoff", `Context '${contextId}' not found`);
    return null;
  }

  // Generate session ID
  const sessionId = crypto.randomUUID().slice(0, 8);

  // Get pending tasks from state.json
  const allTasks = getTasks(contextId, projectRoot);
  const pendingTasks = allTasks.filter(
    t => t.status === "pending" || t.status === "in_progress" || t.status === "blocked",
  );

  // Build document
  const now = nowIso();
  const contextDir = getContextDir(contextId, projectRoot);

  const doc: HandoffDocument = {
    context_id: contextId,
    context_summary: context.summary,
    session_id: sessionId,
    reason,
    created_at: now,
    plan_path: context.plan_path,
    context_folder: contextDir,
    events_log_path: path.join(contextDir, "state.json"),
    active_tasks: pendingTasks,
    completed_tasks_this_session: (completedThisSession ?? []).map(s => ({ subject: s })),
    work_summary: workSummary,
    next_steps: nextSteps ?? [],
    important_notes: importantNotes ?? [],
    file_path: null,
  };

  // Compute file path BEFORE rendering markdown
  const handoffsDir = getContextHandoffsDir(contextId, projectRoot);
  fs.mkdirSync(handoffsDir, { recursive: true });

  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const filename = `${dateStr}-session-${sessionId}.md`;
  const filePath = path.join(handoffsDir, filename);

  // Set file_path on doc BEFORE rendering markdown
  doc.file_path = filePath;

  // Generate markdown content
  const markdown = renderHandoffMarkdown(doc);

  // Save to handoffs folder
  const [success, error] = atomicWrite(filePath, markdown);
  if (!success) {
    logError("handoff", `Failed to write handoff document: ${error}`);
    return null;
  }

  logInfo("handoff", `Created handoff document: ${filePath}`);
  return doc;
}

/**
 * Render handoff document as markdown.
 */
function renderHandoffMarkdown(doc: HandoffDocument): string {
  const lines: string[] = [
    formatContinuationHeader("handoff", doc.context_id),
    "",
    `**Created**: ${doc.created_at}`,
    `**Context ID**: ${doc.context_id}`,
    `**Session ID**: ${doc.session_id}`,
    `**Reason**: ${formatReason(doc.reason)}`,
    "",
    "## Links",
    "",
  ];

  // Plan link
  if (doc.plan_path) {
    const planName = path.basename(doc.plan_path);
    lines.push(`- **Plan**: [${planName}](${doc.plan_path})`);
  }

  lines.push(
    `- **Context Folder**: \`${doc.context_folder}\``,
    `- **Events Log**: \`${doc.events_log_path}\``,
    "",
    "## Current State",
    "",
  );

  // Active tasks
  lines.push(renderTaskList(doc.active_tasks, "Active Tasks", true).trimEnd(), "");

  // Completed this session
  if (doc.completed_tasks_this_session.length > 0) {
    lines.push(renderTaskList(
      doc.completed_tasks_this_session as any[],
      "Completed This Session",
      false,
    ).trimEnd(), "");
  }

  // Work summary
  if (doc.work_summary) {
    lines.push("## Context Summary", "", doc.work_summary, "");
  }

  // Next steps
  if (doc.next_steps.length > 0) {
    lines.push("## Next Steps", "");
    for (let i = 0; i < doc.next_steps.length; i++) {
      lines.push(`${i + 1}. ${doc.next_steps[i]}`);
    }

    lines.push("");
  }

  // Important notes
  if (doc.important_notes.length > 0) {
    lines.push("## Important Notes", "");
    for (const note of doc.important_notes) {
      lines.push(`- ${note}`);
    }

    lines.push("");
  }

  // Continuation prompt
  lines.push(
    "---",
    "",
    "**Continuation Prompt**:",
    "```",
    `Continue working on context "${doc.context_id}".`,
    "",
    `Handoff document: ${doc.file_path ?? "See above"}`,
    "",
    "Read the handoff document, restore tasks with TaskCreate, and continue implementation.",
    "```",
  );

  return lines.join("\n");
}

/**
 * Generate the prompt to paste into new session for continuation.
 * See SPEC.md §12.3
 */
export function getHandoffContinuationPrompt(doc: HandoffDocument): string {
  return `Continue working on context "${doc.context_id}".\n\nHandoff document: ${doc.file_path}\n\nRead the handoff document, restore tasks with TaskCreate, and continue implementation.`;
}

/**
 * Generate system reminder for low context warning.
 * See SPEC.md §12.4
 */
export function getLowContextWarning(contextRemainingPercent: number, contextId: string): string {
  return `<system-reminder>
## LOW CONTEXT WARNING (${contextRemainingPercent}% remaining)

Your context window is running low. Please:

1. **Finish current task** if 1-2 steps away, OR save current progress
2. **Create handoff document** by calling:
   \`\`\`python
   from _shared.lib.handoff import generate_handoff_document
   doc = generate_handoff_document(
       context_id="${contextId}",
       reason="low_context",
       work_summary="<describe current work>",
       next_steps=["<step 1>", "<step 2>"],
       important_notes=["<key decision 1>"]
   )
   \`\`\`
3. **Ask permission** to clear and paste continuation prompt

After creating handoff, ask the user:
"Context is low. I've created a handoff document. May I clear and continue in a new session?"
</system-reminder>`;
}
