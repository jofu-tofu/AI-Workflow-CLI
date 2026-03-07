#!/usr/bin/env bun
/**
 * PreToolUse:Task Hook: Prompt Validation Gate
 *
 * Validates that Task tool calls have self-contained, goal-oriented prompts.
 * Short-circuits immediately for resume calls (no prompt to validate).
 *
 * Design:
 * - Resume calls (tool_input.resume present) -> allow through, no inference
 * - Missing/empty prompt -> allow through (fail open)
 * - Non-empty prompt -> run AI validation via inference(), block if ok:false
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  logDebug,
  logWarn,
  emitContextAndBlock,
  getToolInput,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { inference } from "../../_shared/lib-ts/base/inference.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";

const VALIDATION_SYSTEM_PROMPT = `The sub-agent receives ONLY the prompt text — no conversation history, no prior context.

Check 1 — Dangling References: Does the prompt use pronouns or demonstratives that ONLY make sense with prior conversation? Violations: 'the file we looked at', 'as discussed above', 'that approach we chose', 'the error from earlier', 'fix the issue mentioned above'. NOT violations: relative paths ('_output/', 'src/lib/'), search terms ('context-manager', 'auth module'), directory exploration ('find files matching X'), tool names, or any concrete noun — even if imprecise. Only flag references that are truly UNRESOLVABLE without conversation history.

Check 2 — Implicit Contract: Does the prompt have ANY discernible goal? 'Explore the _output directory and find context files' IS a clear goal. 'Search for hooks that handle Task events' IS a clear goal. 'Read and summarize all files in X' IS a clear goal. Only flag if the prompt is truly goalless — e.g., a sentence fragment with no verb, or pure context with no request.

If both checks pass, return ok:true. When in doubt, pass — false negatives (letting a vague prompt through) are far less costly than false positives (blocking legitimate work).

When returning ok:false, end your response with: 'Retry: Re-invoke the Task tool with a revised prompt that resolves the issues above.'`;

function main(): void {
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) return;

  const toolInput = getToolInput(payload);

  // Resume calls: tool_input contains `resume: "<agent-id>"` (may also have prompt/description).
  // The resume field being present is the authoritative discriminator — skip all validation.
  if (toolInput?.resume) {
    logInfo("validate_task_prompt", `Resume call detected (agent: ${toolInput.resume}) — skipping validation`);
    return;
  }

  const prompt: string = toolInput?.prompt ?? "";
  if (!prompt.trim()) {
    logDebug("validate_task_prompt", "No prompt field — allowing through (fail open)");
    return;
  }

  logInfo("validate_task_prompt", `Validating Task prompt (${prompt.length} chars)`);
  const result = inference(VALIDATION_SYSTEM_PROMPT, prompt, "fast");

  if (!result.success) {
    logWarn("validate_task_prompt", `inference() failed (${result.error}) — failing open`);
    return;
  }

  const {output} = result;
  if (output.includes("ok:false")) {
    // Extract the Retry line if present; fall back to full output
    const retryMatch = output.match(/Retry:.*$/m);
    const retryMessage = retryMatch ? retryMatch[0] : "Retry: Re-invoke the Task tool with a revised, self-contained prompt.";
    logInfo("validate_task_prompt", "Blocking Task — prompt failed validation");
    emitContextAndBlock(output, retryMessage);
  }
  // ok:true or anything else -> allow through (no output = no block)
}

runHook(main, "validate_task_prompt");
