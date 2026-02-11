#!/usr/bin/env bun
/**
 * PostToolUse:TaskCreate hook: Persist Claude's TaskCreate calls to state.json.
 */
import {
  loadHookInput, validateHookEvent, getToolInput, checkSkipPersistence,
  runHook, logDebug, logInfo, logWarn, logError,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { getContextBySessionId } from "../lib-ts/context/context-store.js";
import { addTask } from "../lib-ts/context/task-tracker.js";

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;
  if (!validateHookEvent(payload, "PostToolUse", "TaskCreate")) return;

  const toolInput = getToolInput(payload);
  if (!toolInput) return;
  if (checkSkipPersistence(payload, "task_create_capture")) return;

  const projectRoot = getProjectRoot(payload.cwd);
  const sessionId = payload.session_id ?? "unknown";

  const state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("task_create_capture", `No context for session ${sessionId}`);
    return;
  }

  const subject = toolInput.subject as string | undefined;
  if (!subject) {
    logWarn("task_create_capture", "TaskCreate missing subject field");
    return;
  }

  const description = (toolInput.description as string) ?? "";
  const activeForm = (toolInput.activeForm as string) ?? "";

  const task = addTask(state.id, subject, description, activeForm, sessionId, projectRoot);
  if (task) {
    logInfo("task_create_capture", `Persisted task ${task.id}: ${subject}`);
  } else {
    logError("task_create_capture", `Failed to persist task: ${subject}`);
  }
}

runHook(main, "task_create_capture");
