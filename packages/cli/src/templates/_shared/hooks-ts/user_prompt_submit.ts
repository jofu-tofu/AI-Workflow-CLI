#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: Context enforcement — ensures every prompt belongs
 * to a tracked context. The most complex shared hook.
 *
 * Uses emitContext() for output — context text is passed via hookSpecificOutput JSON.
 * Catches BlockRequest and uses emitBlock() to block the prompt.
 */
import { getProjectRoot } from "../lib-ts/base/constants.js";
import {
  loadHookInput, runHookAsync, logDebug, logInfo, logWarn, logBlocking, logDiagnostic, hookLog, emitContext, emitBlock,
} from "../lib-ts/base/hook-utils.js";
import { determineContext, BlockRequest } from "../lib-ts/context/context-selector.js";
import {
  getContextBySessionId, bindSession, maybeActivate, saveState,
} from "../lib-ts/context/context-store.js";

async function asyncMain(): Promise<void> {
  const payload = loadHookInput();
  if (!payload) return;

  const prompt = (payload as any).prompt as string | undefined;
  const sessionId = payload.session_id;
  const permissionMode = payload.permission_mode ?? "";
  const projectRoot = getProjectRoot(payload.cwd);

  if (!sessionId) {
    logDebug("user_prompt_submit", "No session_id");
    return;
  }

  const outputs: string[] = [];

  // Check if session is already bound to a context
  const existingCtx = getContextBySessionId(sessionId, projectRoot);

  if (existingCtx) {
    // Returning user — context already bound (stderr: false to avoid "hook error" display)
    try {
      maybeActivate(existingCtx.id, permissionMode, projectRoot, "user_prompt_submit");
    } catch (error) {
      hookLog("warn", "user_prompt_submit", `maybeActivate failed (non-critical): ${error}`, { stderr: false });
    }
    hookLog("debug", "user_prompt_submit", `Session bound to ${existingCtx.id}`, { stderr: false });
  } else if (prompt) {
    // First prompt — need to determine context
    try {
      const [contextId, method, outputText] = await determineContext(prompt, sessionId, projectRoot);

      if (contextId) {
        bindSession(contextId, sessionId, projectRoot);
        maybeActivate(contextId, permissionMode, projectRoot, "user_prompt_submit");

        // Clear handoff_path after binding (prevents re-injection)
        const state = getContextBySessionId(sessionId, projectRoot);
        if (state && state.handoff_path) {
          state.handoff_path = null;
          saveState(state.id, state, projectRoot);
        }

        logInfo("user_prompt_submit", `Context ${contextId} via ${method}`);
      }

      if (outputText) {
        outputs.push(outputText);
      }
    } catch (error) {
      if (error instanceof BlockRequest) {
        emitBlock((error as Error).message);
        return;
      }
      throw error; // Re-throw unexpected errors
    }
  }

  if (outputs.length > 0) {
    emitContext(outputs.join("\n\n"));
  }
}

runHookAsync(asyncMain, "user_prompt_submit");
