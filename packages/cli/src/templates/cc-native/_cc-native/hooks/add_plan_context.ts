#!/usr/bin/env bun
/**
 * Plan context hook — handles question marking and advisory question nudges.
 *
 * Registered for two events:
 * - PostToolUse: AskUserQuestion — marks that questions were asked this session.
 * - PreToolUse: Task — nudges Plan subagent to ask questions first (advisory, never blocks).
 *
 * All enforcement is advisory: injects additionalContext to guide Claude toward asking
 * non-obvious questions, but never blocks the tool call. Claude can proceed regardless.
 *
 * Fail-safe: Any error allows the action silently.
 */

import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import {
  emitContext,
  loadHookInput,
  logDebug,
  logDiagnostic,
  logInfo,
  runHook,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getEvaluationContextReminder } from "../../_shared/lib-ts/templates/plan-context.js";
import { markQuestionsAsked, wasQuestionsAsked } from "../lib-ts/cc-native-state.js";

const CONTEXT_REMINDER = getEvaluationContextReminder();

const TASK_ENFORCEMENT_CONTEXT =
  "Before spawning a Plan agent, consider asking the user non-obvious questions " +
  "via AskUserQuestion. Code exploration reveals WHAT exists — questions reveal WHAT MATTERS.\n\n" +
  "Generate 5+ candidate questions across these categories, then keep only 3-4 where " +
  "different answers would lead to meaningfully different plans:\n\n" +
  "1. INTENT & SUCCESS CRITERIA — What does 'done well' look like? Are there multiple " +
  "interpretations of this request? What's a 10 vs a 6?\n\n" +
  "2. CONSTRAINTS & HISTORY — Has this been attempted before? Are there off-limits areas, " +
  "performance requirements, or security considerations not visible in the code?\n\n" +
  "3. TRADE-OFF PREFERENCES — Speed vs thoroughness? Minimal change vs clean architecture? " +
  "Backward compatibility vs clean break?\n\n" +
  "Frame each question with 2-3 concrete options so the user can choose rather than compose. " +
  "Use AskUserQuestion with structured options — never ask questions as inline text.";

function isPlanTask(payload: Record<string, unknown>): boolean {
  const toolInput = payload.tool_input;
  if (!toolInput || typeof toolInput !== "object") return false;
  return String((toolInput as Record<string, unknown>).subagent_type ?? "") === "Plan";
}

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

  // PreToolUse: Task — nudge Plan subagent to ask questions first (advisory)
  if (toolName === "Task") {
    if (!isPlanTask(payload)) return; // Only gate Plan subagent spawns

    const permissionMode = payload.permission_mode ?? "";
    if (permissionMode !== "plan") return; // Only enforce during plan mode

    const sessionId = payload.session_id;
    if (!sessionId) {
      logDebug("add_plan_context", "No session_id for Task gate, skipping enforcement");
      return;
    }

    const sessionIdStr = String(sessionId);

    if (wasQuestionsAsked(sessionIdStr, projectRoot)) {
      logInfo("add_plan_context", "Questions asked, allowing Plan Task with eval context");
      logDiagnostic(
        "add_plan_context",
        "decide",
        "Questions asked, allowing Plan Task",
        { decision: "allow_with_context", reasoning: "was_questions_asked=True" },
      );
      emitContext(CONTEXT_REMINDER);
      return;
    }

    // Questions NOT asked: nudge toward asking questions (advisory only)
    logInfo("add_plan_context", "Questions not asked - nudging Plan Task to ask first");
    logDiagnostic(
      "add_plan_context",
      "decide",
      "Questions not asked, nudging Plan Task",
      { decision: "nudge", reasoning: "was_questions_asked=False, advisory context" },
    );
    emitContext(TASK_ENFORCEMENT_CONTEXT);
    
  }
}

runHook(main, "add_plan_context");
