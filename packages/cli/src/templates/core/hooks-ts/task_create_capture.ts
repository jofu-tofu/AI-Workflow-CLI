#!/usr/bin/env bun
/**
 * PostToolUse:TaskCreate hook: Persist Claude's TaskCreate calls to state.json.
 */
import { addTask } from "../lib-ts/context/task-tracker.js";
import {
  logError, logInfo, logWarn, requirePersistenceContext, runHook,
} from "../lib-ts/hooks/hook-utils.js";

function main(): void {
  const context = requirePersistenceContext("TaskCreate", "task_create_capture");
  if (!context) return;
  const { toolInput, sessionId, projectRoot, state } = context;

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
