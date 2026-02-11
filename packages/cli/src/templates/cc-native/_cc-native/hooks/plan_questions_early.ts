#!/usr/bin/env bun
/**
 * UserPromptSubmit hook — injects Phase A clarification prompt in plan mode.
 *
 * On the first prompt in plan mode (before any code exploration), injects
 * a system-reminder telling Claude to ask clarification questions via
 * AskUserQuestion before exploring the codebase.
 *
 * Skips if questions were already asked this session.
 */

import { loadHookInput, runHook, logDebug, logInfo, emitContext } from "../../_shared/lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { wasQuestionsAsked } from "../lib-ts/cc-native-state.js";

const PHASE_A_PROMPT = `## Plan Mode: Clarify Before Exploring

Use AskUserQuestion now — one call, 3-4 questions — before reading any code.

### Why This Matters
Once you explore the codebase, you anchor on what you find. Questions asked after exploration confirm your assumptions instead of challenging them. Ask now, while your interpretation is still flexible.

### What to Ask About
Only ask about things you cannot discover from code — the user's intent, constraints, history, and priorities:

- **Ambiguity:** If you can read this request two different ways, ask which interpretation is correct. Provide your top 2-3 readings as options.
- **Invisible context:** What does the user assume "everyone knows" about this system that isn't documented? What's obvious to them but hidden to you?
- **Success criteria:** What does "done well" look like beyond the literal request? What would make them rate this a 10?
- **Constraints and history:** Has this been attempted before? Are there parts of the system that are off-limits or sensitive?

### How to Select Questions
1. Generate 5+ candidate questions across the lenses above
2. For each, evaluate: "If they answered A vs B, would I explore different files or take a different approach?" If no — discard it.
3. Keep the 3-4 where different answers lead to meaningfully different exploration strategies
4. Frame each with 2-3 concrete options so the user can react rather than generate from scratch`;

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const permissionMode = payload.permission_mode ?? "";
  if (permissionMode !== "plan") return;

  const sessionId = String(payload.session_id ?? "");
  if (!sessionId) {
    logDebug("plan_questions_early", "No session_id, skipping");
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);

  if (wasQuestionsAsked(sessionId, projectRoot)) {
    logDebug("plan_questions_early", "Questions already asked, skipping");
    return;
  }

  logInfo("plan_questions_early", "Plan mode detected, injecting Phase A prompt");
  emitContext(PHASE_A_PROMPT);
}

runHook(main, "plan_questions_early");
