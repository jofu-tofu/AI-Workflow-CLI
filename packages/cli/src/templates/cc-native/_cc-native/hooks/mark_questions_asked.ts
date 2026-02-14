#!/usr/bin/env bun
/**
 * Mark Questions Asked Hook
 *
 * Tracks when AskUserQuestion tool is used during a session.
 * Used by other hooks to determine if user clarification was gathered.
 *
 * Registered for:
 * - PostToolUse: AskUserQuestion — marks questions asked state for this session
 *
 * Fail-safe: Any error exits 0 (non-blocking).
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  logDiagnostic,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { markQuestionsAsked } from "../lib-ts/cc-native-state.js";

function main(): void {
  // Guard: skip for internal subprocess calls (prevents recursive hook execution)
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) return;

  const toolName = payload.tool_name;
  const hookEvent = payload.hook_event_name ?? "unknown";
  logDiagnostic(
    "add_plan_context",
    "receive",
    `tool=${toolName}, event=${hookEvent}`,
    { inputs: { tool_name: toolName, hook_event: hookEvent } },
  );

  const projectRoot = getProjectRoot(payload.cwd);

  // PostToolUse: AskUserQuestion — mark that questions were asked
  if (toolName === "AskUserQuestion") {
    const sessionId = String(payload.session_id ?? "");
    if (sessionId) {
      markQuestionsAsked(sessionId, projectRoot);
      logInfo("add_plan_context", `Marked questions asked for session ${sessionId.slice(0, 8)}...`);
    }
    return;
  }
}

runHook(main, "mark_questions_asked");
