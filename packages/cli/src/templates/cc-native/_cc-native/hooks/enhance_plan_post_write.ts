#!/usr/bin/env bun
/**
 * PostToolUse:Write Hook: Enhance Plan on Direct Write
 *
 * Fires after Write tool completes. Detects writes to ~/.claude/plans/*.md files
 * and appends three enhancement sections (Skills Reference, Quality Criteria,
 * Documentation Requirements) if this is the first write to the plan.
 *
 * Design:
 * - Never blocks (all paths exit 0)
 * - Uses normalized path comparison (cross-platform)
 * - Shares enhancement logic with SubagentStop hook via plan-enhancement.ts
 * - State tracked per-plan-path to handle multiple plans in one session
 * - Emits context when enhancement is applied
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  logWarn,
  emitContext,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { enhancePlanIfNeeded } from "../lib-ts/plan-enhancement.js";
import * as path from "path";
import * as os from "os";

function main(): void {
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) return;

  const toolInput = payload.tool_input;
  if (!toolInput || typeof toolInput !== "object") return;

  const filePath = toolInput.file_path as string | undefined;
  if (!filePath) return;

  // Normalize paths for cross-platform comparison
  const normalizedPath = path.normalize(path.resolve(filePath));
  const plansDir = path.normalize(path.join(os.homedir(), ".claude", "plans"));

  // Check if file is in plans directory
  if (!normalizedPath.startsWith(plansDir)) {
    return; // Not a plan file write
  }

  // Check if it's a markdown file
  if (!normalizedPath.endsWith(".md")) {
    return;
  }

  logInfo("enhance_plan_write", `Detected plan file write: ${filePath}`);

  const projectRoot = getProjectRoot(payload.cwd);

  try {
    const result = enhancePlanIfNeeded(sessionId, normalizedPath, projectRoot, "enhance_plan_write");
    if (result.applied) {
      logInfo("enhance_plan_write", `Enhanced plan: ${result.reason}`);

      // Emit context to make enhancement visible to Claude
      emitContext(`📋 Plan enhancement: ${result.reason}

The following sections have been automatically appended to your plan:
- Skills Reference
- Quality Criteria
- Documentation Requirements

These sections provide guidance for the implementation phase.`);
    } else {
      logInfo("enhance_plan_write", `Skipped enhancement: ${result.reason}`);
    }
  } catch (e: unknown) {
    logWarn("enhance_plan_write", `Enhancement failed (non-critical): ${e}`);
    // Don't throw - let Write complete normally
  }

  // No blocking - always exit 0
}

runHook(main, "enhance_plan_post_write");
