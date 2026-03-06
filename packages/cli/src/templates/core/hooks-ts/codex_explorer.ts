#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: One-shot Codex codebase exploration for first plan-mode prompt.
 */
import { getContextBySessionId, saveState } from "../lib-ts/context/context-store.js";
import {
  emitContext, loadHookInput, logDebug, logInfo, logWarn, runHookAsync,
} from "../lib-ts/hooks/hook-utils.js";
import { getProjectRoot } from "../lib-ts/runtime/constants.js";
import { codexInferAsync } from "../lib-ts/runtime/inference.js";
import { CODEX_MODELS } from "../lib-ts/runtime/models.js";

const MAX_PROMPT_CHARS = 8000;
const SPARK_TIMEOUT_SECONDS = 50;

function buildExplorerPrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  const clipped = trimmed.length > MAX_PROMPT_CHARS
    ? `${trimmed.slice(0, MAX_PROMPT_CHARS)}...`
    : trimmed;

  return [
    "You are a codebase explorer.",
    "The user is starting planning work in plan mode.",
    "Search the current repository and identify the most relevant files, patterns, and types.",
    "",
    "Focus on:",
    "- Files likely to require changes",
    "- Existing utilities/helpers that match the request",
    "- Key functions, classes, types, and interfaces",
    "- Relevant tests and configuration files",
    "",
    "Return a concise report (maximum ~2000 characters).",
    "Do not suggest implementation steps. Only report what exists and where.",
    "",
    "User prompt:",
    "---",
    clipped,
    "---",
  ].join("\n");
}

async function main(): Promise<void> {
  const payload = loadHookInput();
  if (!payload) return;

  const permissionMode = payload.permission_mode ?? "";
  if (permissionMode !== "plan") {
    logDebug("codex_explorer", `Skip: permission_mode=${permissionMode || "none"}`);
    return;
  }

  const prompt = (payload as unknown as { prompt?: string }).prompt?.trim() ?? "";
  if (!prompt) {
    logDebug("codex_explorer", "Skip: no prompt");
    return;
  }

  const sessionId = payload.session_id;
  if (!sessionId) {
    logDebug("codex_explorer", "Skip: no session_id");
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);
  const state = getContextBySessionId(sessionId, projectRoot);

  if (
    state?.last_session?.codex_explorer_fired === true &&
    state.last_session.session_id === sessionId
  ) {
    logDebug("codex_explorer", `Skip: already fired for session ${sessionId}`);
    return;
  }

  const startedAt = Date.now();
  const explorerPrompt = buildExplorerPrompt(prompt);
  const result = await codexInferAsync(
    explorerPrompt,
    CODEX_MODELS.spark,
    { sandbox: "read-only", timeout: SPARK_TIMEOUT_SECONDS },
  );
  const elapsedMs = Date.now() - startedAt;

  if (!result.success || !result.output) {
    logWarn(
      "codex_explorer",
      `Explorer inference failed after ${elapsedMs}ms: ${result.error ?? "empty output"}`,
    );
    return;
  }

  emitContext(result.output);
  logInfo("codex_explorer", `Explorer context emitted in ${elapsedMs}ms`);

  if (!state) {
    logWarn("codex_explorer", `No bound context for session ${sessionId}; cannot persist fired flag`);
    return;
  }

  if (!state.last_session) {
    state.last_session = {};
  }
  state.last_session.session_id = sessionId;
  state.last_session.codex_explorer_fired = true;

  const [ok, err] = saveState(state.id, state, projectRoot);
  if (!ok) {
    logWarn("codex_explorer", `Failed to persist codex_explorer_fired: ${err}`);
    return;
  }

  logDebug("codex_explorer", `Marked codex_explorer_fired for ${state.id}`);
}

runHookAsync(main, "codex_explorer");
