#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: One-shot Codex codebase exploration for first plan-mode prompt.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  emitContext, loadHookInput, logDebug, logInfo, logWarn, runHookAsync,
} from "../lib-ts/hooks/hook-utils.js";
import { getOutputDir, getProjectRoot } from "../lib-ts/runtime/constants.js";
import { codexInferAsync } from "../lib-ts/runtime/inference.js";
import { CODEX_MODELS } from "../lib-ts/runtime/models.js";

const MAX_PROMPT_CHARS = 8000;
const SPARK_TIMEOUT_SECONDS = 50;
const FIRED_FILENAME = ".codex-explorer-fired";
const MAX_FIRED_LINES = 200;
const PRUNE_KEEP = 100;

function getCacheFilePath(projectRoot: string): string {
  return path.join(getOutputDir(projectRoot), FIRED_FILENAME);
}

function hasSessionFired(sessionId: string, projectRoot: string): boolean {
  const filePath = getCacheFilePath(projectRoot);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").includes(sessionId);
  } catch {
    return false;
  }
}

function markSessionFired(sessionId: string, projectRoot: string): void {
  const filePath = getCacheFilePath(projectRoot);
  const outputDir = getOutputDir(projectRoot);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.appendFileSync(filePath, sessionId + "\n");

  // Prune if over limit
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_FIRED_LINES) {
      const pruned = lines.slice(lines.length - PRUNE_KEEP);
      fs.writeFileSync(filePath, pruned.join("\n") + "\n");
      logDebug("codex_explorer", `Pruned fired cache from ${lines.length} to ${pruned.length} entries`);
    }
  } catch (error) {
    logWarn("codex_explorer", `Failed to prune fired cache: ${error}`);
  }
}

/**
 * Parse Codex JSONL output into clean agent message text.
 * Codex --json returns streaming events; we extract only agent_message text.
 */
function parseCodexOutput(raw: string): string {
  const lines = raw.split("\n").filter(Boolean);
  const parts: string[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type !== "item.completed") continue;
      const item = event.item;
      if (item?.type === "agent_message" && item.text) {
        parts.push(item.text);
      }
    } catch { /* skip non-JSON lines */ }
  }
  return parts.join("\n\n") || raw;
}

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

  if (hasSessionFired(sessionId, projectRoot)) {
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

  const cleanOutput = parseCodexOutput(result.output);
  emitContext(cleanOutput);
  logInfo("codex_explorer", `Explorer context emitted in ${elapsedMs}ms`);

  markSessionFired(sessionId, projectRoot);
  logDebug("codex_explorer", `Marked session ${sessionId} as fired`);
}

runHookAsync(main, "codex_explorer");
