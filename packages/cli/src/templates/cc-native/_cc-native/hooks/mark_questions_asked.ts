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

import { getProjectRoot } from "../../_core/lib-ts/runtime/constants.js";
import {
  loadHookInput,
  runHook,
  logInfo,
  logDiagnostic,
} from "../../_core/lib-ts/hooks/hook-utils.js";
import { isInternalCall } from "../../_core/lib-ts/runtime/subprocess-utils.js";
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

  // PostToolUse: AskUserQuestion — mark that early questions (Phase A) were asked
  if (toolName === "AskUserQuestion") {
    const sessionId = String(payload.session_id ?? "");
    if (sessionId) {
      markQuestionsAsked(sessionId, projectRoot, "early");
      logInfo("add_plan_context", `Marked early questions asked for session ${sessionId.slice(0, 8)}...`);
    }
    
  }
}

runHook(main, "mark_questions_asked");
