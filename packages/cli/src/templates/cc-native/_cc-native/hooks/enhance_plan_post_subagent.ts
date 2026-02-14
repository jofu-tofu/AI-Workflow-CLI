#!/usr/bin/env bun
/**
 * SubagentStop Hook: Enhance Plan Post-Completion
 *
 * Fires after Plan subagent completes. Appends three enhancement sections to plan file:
 * - Skills Reference (available skills for implementation agent)
 * - Quality Criteria (self-check before marking complete)
 * - Documentation Requirements (CLAUDE.md and MEMORY.md update guidance)
 *
 * Design:
 * - Never blocks (all errors exit 0)
 * - Idempotent (detects existing sections, skips re-adding)
 * - Two-tier plan discovery (transcript parse → most recent file fallback)
 * - Append-only (preserves subagent's original structure)
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  logWarn,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { findPlanPathInTranscript } from "../../_shared/lib-ts/context/plan-manager.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { enhancePlanIfNeeded } from "../lib-ts/plan-enhancement.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function findMostRecentPlanFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());

  if (files.length === 0) return null;

  files.sort(
    (a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime()
  );
  return files[0];
}

function findPlanFile(payload: Record<string, unknown>): string | null {
  const agentTranscriptPath = payload.agent_transcript_path as
    | string
    | undefined;

  // Strategy 1: Parse subagent's transcript for Write to .claude/plans/
  if (agentTranscriptPath) {
    const planPath = findPlanPathInTranscript(agentTranscriptPath);
    if (planPath && fs.existsSync(planPath)) {
      logInfo("enhance_plan", `Found plan via transcript: ${planPath}`);
      return planPath;
    }
  }

  // Strategy 2: Most recent .md in ~/.claude/plans/
  const plansDir = path.join(os.homedir(), ".claude", "plans");
  const planPath = findMostRecentPlanFile(plansDir);
  if (planPath) {
    logInfo("enhance_plan", `Found most recent plan: ${planPath}`);
    return planPath;
  }

  return null;
}

function main(): void {
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) return;

  const agentType = payload.agent_type;
  if (agentType !== "Plan") {
    return; // Only enhance Plan agents
  }

  const sessionId = payload.session_id;
  if (!sessionId) return;

  const projectRoot = getProjectRoot(payload.cwd);
  const planPath = findPlanFile(payload);
  if (!planPath) {
    logWarn("enhance_plan", "No plan file found to enhance");
    return;
  }

  try {
    const result = enhancePlanIfNeeded(sessionId, planPath, projectRoot, "enhance_plan");
    if (result.applied) {
      logInfo("enhance_plan", `Enhanced plan: ${result.reason}`);
    } else {
      logInfo("enhance_plan", `Skipped enhancement: ${result.reason}`);
    }
  } catch (e: unknown) {
    logWarn("enhance_plan", `Enhancement failed (non-critical): ${e}`);
    // Don't throw - let subagent complete normally
  }

  // No JSON output - hook completes silently, never blocks
}

runHook(main, "enhance_plan_post_subagent");
