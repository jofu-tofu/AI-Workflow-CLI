#!/usr/bin/env bun
/**
 * PostToolUse:TaskUpdate hook: Persist Claude's TaskUpdate calls to state.json.
 * Maps Claude's ephemeral task IDs to persistent aiw-N IDs.
 */
import { deleteTask, updateTask } from "../lib-ts/context/task-tracker.js";
import {
  logInfo, logWarn, requirePersistenceContext, runHook,
} from "../lib-ts/hooks/hook-utils.js";

function main(): void {
  const context = requirePersistenceContext("TaskUpdate", "task_update_capture");
  if (!context) return;
  const { toolInput, sessionId, projectRoot, state } = context;

  const claudeTaskId = toolInput.taskId as string | undefined;
  if (!claudeTaskId) {
    logWarn("task_update_capture", "TaskUpdate missing taskId");
    return;
  }

  // Map Claude's ephemeral ID to persistent ID
  const metadata = (toolInput.metadata ?? {}) as Record<string, unknown>;
  const persistentId = (metadata.persistent_id as string) ?? `aiw-${claudeTaskId}`;

  const status = toolInput.status as string | undefined;

  if (status === "deleted") {
    const ok = deleteTask(state.id, persistentId, projectRoot);
    if (ok) {
      logInfo("task_update_capture", `Deleted task ${persistentId}`);
    } else {
      logWarn("task_update_capture", `Task ${persistentId} not found for deletion`);
    }

    return;
  }

  if (status) {
    const opts: Record<string, unknown> = { status };
    if (metadata.evidence) opts.evidence = metadata.evidence;
    if (metadata.work_summary) opts.work_summary = metadata.work_summary;
    if (metadata.files_changed && Array.isArray(metadata.files_changed)) {
      opts.files_changed = metadata.files_changed;
    }

    opts.session_id = sessionId;

    const ok = updateTask(state.id, persistentId, opts, projectRoot);
    if (ok) {
      logInfo("task_update_capture", `Updated task ${persistentId} → ${status}`);
    } else {
      logWarn("task_update_capture", `Task ${persistentId} not found for update`);
    }
  }
}

runHook(main, "task_update_capture");

