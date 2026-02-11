#!/usr/bin/env bun
/**
 * PostToolUse:TaskUpdate hook: Persist Claude's TaskUpdate calls to state.json.
 * Maps Claude's ephemeral task IDs to persistent aiw-N IDs.
 */
import {
  loadHookInput, validateHookEvent, getToolInput, checkSkipPersistence,
  runHook, logDebug, logInfo, logWarn, logError,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { getContextBySessionId } from "../lib-ts/context/context-store.js";
import { updateTask, deleteTask } from "../lib-ts/context/task-tracker.js";

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;
  if (!validateHookEvent(payload, "PostToolUse", "TaskUpdate")) return;

  const toolInput = getToolInput(payload);
  if (!toolInput) return;
  if (checkSkipPersistence(payload, "task_update_capture")) return;

  const projectRoot = getProjectRoot(payload.cwd);
  const sessionId = payload.session_id ?? "unknown";

  const state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("task_update_capture", `No context for session ${sessionId}`);
    return;
  }

  const claudeTaskId = toolInput.taskId as string | undefined;
  if (!claudeTaskId) {
    logWarn("task_update_capture", "TaskUpdate missing taskId");
    return;
  }

  // Map Claude's ephemeral ID to persistent ID
  const metadata = (toolInput.metadata ?? {}) as Record<string, any>;
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
    const opts: Record<string, any> = { status };
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
