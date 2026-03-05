#!/usr/bin/env bun
/**
 * PostToolUse:Task Hook: Plan Quality Review Context
 *
 * Fires after Task tool completes with a Plan subagent. Emits plan quality review guidance
 * as context for the main agent to review the plan before ExitPlanMode.
 *
 * Design:
 * - Never blocks (all errors exit 0)
 * - Emits context via emitContext() — no file mutation
 * - Only fires for Task tool with subagent_type="Plan"
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  logDebug,
  emitContext,
  getToolInput,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getPlanQualityReviewContext } from "../lib-ts/plan-enhancement.js";

function main(): void {
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) {
    logDebug("enhance_plan_post_subagent", "No payload received");
    return;
  }

  // Check if this is a Task tool call
  if (payload.tool_name !== "Task") {
    logDebug("enhance_plan_post_subagent", `Skipping: tool_name is "${payload.tool_name}", not "Task"`);
    return;
  }

  // Check if the Task is spawning a Plan subagent
  const toolInput = getToolInput(payload);
  const subagentType = toolInput?.subagent_type;
  logDebug("enhance_plan_post_subagent", `subagent_type: ${subagentType ?? "undefined"}`);

  if (subagentType !== "Plan") {
    logDebug("enhance_plan_post_subagent", `Skipping: subagent_type is "${subagentType}", not "Plan"`);
    return;
  }

  logInfo("enhance_plan_post_subagent", "Emitting plan quality review context");
  emitContext(getPlanQualityReviewContext());
}

runHook(main, "enhance_plan_post_subagent");
