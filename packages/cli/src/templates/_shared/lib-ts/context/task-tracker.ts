/**
 * Task tracker — direct state.json CRUD for tasks.
 * See SPEC.md §10
 *
 * Writes tasks directly to the tasks[] array in state.json.
 * Uses state-io for I/O to avoid circular imports with context-store.
 */

import { logWarn } from "../runtime/logger.js";
import { readStateJson, toDict as _toDict, writeStateJson } from "../runtime/state-io.js";
import { nowIso } from "../runtime/utils.js";
import type { ContextState as _ContextState, Task } from "../types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan tasks[] for highest aiw-N, return aiw-(N+1).
 * See SPEC.md §10.2
 */
export function generateNextTaskId(contextId: string, projectRoot?: string): string {
  const state = readStateJson(contextId, projectRoot);
  const tasks = state?.tasks ?? [];

  let maxNum = 0;
  for (const t of tasks) {
    const match = /^aiw-(\d+)$/.exec(t.id);
    if (match) {
      const num = Number.parseInt(match[1]!, 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `aiw-${maxNum + 1}`;
}

/**
 * Add a new task to state.json tasks[] and return the task object.
 * See SPEC.md §10.3
 */
export function addTask(
  contextId: string,
  subject: string,
  description = "",
  activeForm = "",
  sessionId = "",
  projectRoot?: string,
): null | Task {
  const state = readStateJson(contextId, projectRoot);
  if (!state) return null;

  const taskId = generateNextTaskId(contextId, projectRoot);
  const task: Task = {
    id: taskId,
    subject,
    description,
    active_form: activeForm,
    status: "pending",
    created_at: nowIso(),
    completed_at: null,
    evidence: "",
    work_summary: "",
    files_changed: [],
    session_id: sessionId,
  };

  state.tasks.push(task);
  state.last_active = nowIso();

  const [success] = writeStateJson(contextId, state, projectRoot);
  return success ? task : null;
}

/**
 * Find task by task_id in tasks[], update fields, return true on success.
 * See SPEC.md §10.4
 */
export function updateTask(
  contextId: string,
  taskId: string,
  opts?: {
    evidence?: string;
    files_changed?: string[];
    session_id?: string;
    status?: string;
    work_summary?: string;
  },
  projectRoot?: string,
): boolean {
  const state = readStateJson(contextId, projectRoot);
  if (!state) return false;

  for (const task of state.tasks) {
    if (task.id === taskId) {
      if (opts?.status !== undefined) {
        task.status = opts.status as Task["status"];
        if (opts.status === "completed") {
          task.completed_at = nowIso();
        }
      }

      if (opts?.evidence) task.evidence = opts.evidence;
      if (opts?.work_summary) task.work_summary = opts.work_summary;
      if (opts?.files_changed !== undefined) task.files_changed = opts.files_changed;
      if (opts?.session_id) task.session_id = opts.session_id;
      state.last_active = nowIso();
      const [success] = writeStateJson(contextId, state, projectRoot);
      return success;
    }
  }

  logWarn("task_tracker", `Task '${taskId}' not found in context '${contextId}'`);
  return false;
}

/**
 * Remove task from tasks[] and return true on success.
 * See SPEC.md §10.5
 */
export function deleteTask(
  contextId: string,
  taskId: string,
  projectRoot?: string,
): boolean {
  const state = readStateJson(contextId, projectRoot);
  if (!state) return false;

  const originalLen = state.tasks.length;
  state.tasks = state.tasks.filter(t => t.id !== taskId);

  if (state.tasks.length === originalLen) {
    logWarn("task_tracker", `Task '${taskId}' not found in context '${contextId}'`);
    return false;
  }

  state.last_active = nowIso();
  const [success] = writeStateJson(contextId, state, projectRoot);
  return success;
}

/**
 * Return tasks[] from state.json.
 * See SPEC.md §10.6
 */
export function getTasks(contextId: string, projectRoot?: string): Task[] {
  const state = readStateJson(contextId, projectRoot);
  if (!state) return [];
  return state.tasks;
}

/**
 * Partition tasks and format as markdown checklist.
 * See SPEC.md §10.7
 */
export function generateTaskSummary(contextId: string, projectRoot?: string): string {
  const tasks = getTasks(contextId, projectRoot);
  if (tasks.length === 0) return "No tasks in this context.";

  const completed = tasks.filter(t => t.status === "completed");
  const inProgress = tasks.filter(t => t.status === "in_progress");
  const pending = tasks.filter(t => t.status === "pending");
  const blocked = tasks.filter(t => t.status === "blocked");

  const lines: string[] = [`### Tasks (${tasks.length} total)`, ""];

  for (const t of completed) {
    const ws = t.work_summary ? `\n  Work: ${t.work_summary}` : "";
    lines.push(`- [x] ${t.id}: ${t.subject}${ws}`);
  }

  for (const t of inProgress) {
    lines.push(`- [~] ${t.id}: ${t.subject}`);
  }

  for (const t of pending) {
    lines.push(`- [ ] ${t.id}: ${t.subject}`);
  }

  for (const t of blocked) {
    lines.push(`- [!] ${t.id}: ${t.subject}`);
  }

  return lines.join("\n");
}
