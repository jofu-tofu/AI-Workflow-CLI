import { safeMaybeActivate, logInfo, logWarn } from "./hook-utils.js";
import { buildContextInventory } from "../context/context-formatter.js";
import { BlockRequest, determineContext } from "../context/context-selector.js";
import {
  bindSession,
  getContextBySessionId,
  saveState,
} from "../context/context-store.js";
import type { ContextState } from "../types.js";

export interface PromptBindingResult {
  outputs: string[];
  blockedReason?: string;
}

export function shouldClearHandoff(state: ContextState): boolean {
  return Boolean(state.handoff_path);
}

export async function executePromptBinding(
  prompt: string | undefined,
  sessionId: string,
  permissionMode: string,
  projectRoot: string,
): Promise<PromptBindingResult> {
  const outputs: string[] = [];
  const existingCtx = getContextBySessionId(sessionId, projectRoot);

  if (existingCtx) {
    safeMaybeActivate(
      existingCtx.id,
      permissionMode,
      projectRoot,
      "user_prompt_submit",
    );
    return { outputs };
  }

  if (!prompt) return { outputs };

  try {
    const [contextId, method, outputText] = await determineContext(
      prompt,
      sessionId,
      projectRoot,
    );

    if (contextId) {
      bindSession(contextId, sessionId, projectRoot);
      safeMaybeActivate(contextId, permissionMode, projectRoot, "user_prompt_submit");

      const state = getContextBySessionId(sessionId, projectRoot);
      if (state && shouldClearHandoff(state)) {
        state.handoff_path = null;
        saveState(state.id, state, projectRoot);
      }

      logInfo("user_prompt_submit", `Context ${contextId} via ${method}`);
    }

    if (outputText) outputs.push(outputText);

    try {
      const boundState = getContextBySessionId(sessionId, projectRoot);
      if (boundState) {
        const inventory = buildContextInventory(boundState, projectRoot);
        if (inventory) outputs.push(inventory);
      }
    } catch (error) {
      logWarn("user_prompt_submit", `Inventory failed (non-critical): ${error}`);
    }
  } catch (error) {
    if (error instanceof BlockRequest) {
      return { outputs, blockedReason: (error as Error).message };
    }
    throw error;
  }

  return { outputs };
}
