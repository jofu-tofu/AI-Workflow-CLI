#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: Context enforcement — ensures every prompt belongs
 * to a tracked context. The most complex shared hook.
 *
 * Uses emitContext() for output — context text is passed via hookSpecificOutput JSON.
 * Catches BlockRequest and uses emitBlock() to block the prompt.
 */
import {
  loadHookInput, runHookAsync, logDebug, emitContext, emitBlock,
} from "../lib-ts/hooks/hook-utils.js";
import { executePromptBinding } from "../lib-ts/hooks/prompt-binding-logic.js";
import { getProjectRoot } from "../lib-ts/runtime/constants.js";

async function asyncMain(): Promise<void> {
  const payload = loadHookInput();
  if (!payload) return;

  const prompt = (payload as unknown).prompt as string | undefined;
  const sessionId = payload.session_id;
  const permissionMode = payload.permission_mode ?? "";
  const projectRoot = getProjectRoot(payload.cwd);

  if (!sessionId) {
    logDebug("user_prompt_submit", "No session_id");
    return;
  }

  const result = await executePromptBinding(
    prompt,
    sessionId,
    permissionMode,
    projectRoot,
  );
  if (result.blockedReason) {
    emitBlock(result.blockedReason);
    return;
  }

  if (result.outputs.length > 0) {
    emitContext(result.outputs.join("\n\n"));
  }
}

runHookAsync(asyncMain, "user_prompt_submit");

