#!/usr/bin/env bun
/**
 * UserPromptSubmit hook — injects post-exploration clarification prompt in plan mode.
 *
 * After explore agents finish examining the codebase, injects a system-reminder
 * telling Claude to ask clarification questions via AskUserQuestion to narrow
 * the approach before drafting the plan.
 *
 * Skips if questions were already asked this session.
 */

import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { loadHookInput, runHook, logDebug, logInfo, emitContext } from "../../_shared/lib-ts/base/hook-utils.js";
import { wasEarlyQuestionsAsked } from "../lib-ts/cc-native-state.js";

const PHASE_A_PROMPT = `## Plan Mode: Narrow the Approach After Exploration

After exploring the codebase, use AskUserQuestion — one call, 3-4 questions — before drafting the plan.

### Why This Matters
Once you've explored the codebase, you'll understand what exists — but not which direction the user prefers. That's a branch point: multiple viable approaches, and the user's priorities determine which is best. Questions asked after exploration have maximum steering value: they narrow your path before you commit to an implementation direction.

### What to Ask About
Only ask about decisions that exploration will surface but can't resolve — where human judgment is needed to choose between viable options:

- **Approach selection:** If exploration reveals 2-3 viable implementation paths, ask which the user prefers. Present each option with its trade-offs as concrete choices.
- **Scope boundaries:** What's in scope vs. out of scope for this change? Which areas of the codebase should be left untouched? How far should the change ripple?
- **Trade-off preferences:** Where exploration reveals tensions (simplicity vs. flexibility, speed vs. thoroughness, minimal change vs. full refactor), ask which side the user leans toward.
- **Success criteria beyond the literal ask:** What would make this a 10? What non-obvious quality matters most — performance, readability, extensibility, consistency with existing patterns?

### How to Select Questions
1. Generate 5+ candidate questions across the categories above
2. For each, evaluate: "If they answered A vs B, would I take a different approach or write different code?" If no — discard it.
3. Keep the 3-4 where different answers lead to meaningfully different implementation strategies
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

  if (wasEarlyQuestionsAsked(sessionId, projectRoot)) {
    logDebug("plan_questions_early", "Early questions already asked, skipping Phase A prompt");
    return;
  }

  logInfo("plan_questions_early", "Plan mode detected, injecting Phase A prompt");
  emitContext(PHASE_A_PROMPT);
}

runHook(main, "plan_questions_early");
