#!/usr/bin/env bun
/**
 * PostToolUse hook — suggests /fresh-perspective when user appears stuck.
 *
 * Detection patterns:
 * 1. Same error appearing 3+ times
 * 2. Repeated edits to same file without resolution
 * 3. Test failures after multiple fix attempts
 *
 * Behavior: Suggests (doesn't force) running /fresh-perspective.
 * Non-blocking — always returns success.
 *
 * Configuration (in _cc-native/plan-review.config.json):
 *   "stuckDetection": {
 *     "enabled": true,           // Set to false to disable entirely
 *     "errorThreshold": 3,       // Errors before suggesting
 *     "fileEditThreshold": 4,    // Edits to same file before suggesting
 *     "testFailureThreshold": 3, // Test failures before suggesting
 *     "cooldown": 10,            // Tool calls between suggestions
 *     "maxSuggestions": 3        // Max suggestions per session
 *   }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadHookInput,
  runHook,
  logDebug,
  logInfo,
  logWarn,
  emitContext,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";
import { getContextBySessionId, saveState } from "../../_shared/lib-ts/context/context-store.js";
import type { ContextState } from "../../_shared/lib-ts/types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface StuckConfig {
  enabled: boolean;
  errorThreshold: number;
  fileEditThreshold: number;
  testFailureThreshold: number;
  cooldown: number;
  maxSuggestions: number;
}

const DEFAULT_CONFIG: StuckConfig = {
  enabled: true,
  errorThreshold: 3,
  fileEditThreshold: 4,
  testFailureThreshold: 3,
  cooldown: 10,
  maxSuggestions: 3,
};

function intOrDefault(value: unknown, fallback: number): number {
  if (typeof value === "number") return Math.floor(value);
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

function loadStuckConfig(projectDir: string): StuckConfig {
  const configPath = path.join(projectDir, "_cc-native", "plan-review.config.json");
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const full = JSON.parse(raw) as Record<string, unknown>;
    const section = (full.stuckDetection ?? {}) as Partial<StuckConfig>;
    return { ...DEFAULT_CONFIG, ...section };
  } catch (e) {
    logWarn("suggest-fresh-perspective", `Failed to load config: ${e}`);
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Compiled Patterns
// ---------------------------------------------------------------------------

const ERROR_PATTERN = /(?:error:|failed|exception)/i;
const TEST_FAILURE_PATTERN = /(?:\d+\s+failed|FAIL\s|✗|AssertionError|test.*failed|npm\s+ERR!.*test)/i;
const LINE_NUMBER_PATTERN = /:\d+/g;
const MULTI_DIGIT_PATTERN = /\d{2,}/g;
const PATH_PATTERN = /[/\\][^\s/\\]+[/\\]/g;

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

interface StuckState {
  error_hashes: Record<string, number>;
  file_edits: Record<string, number>;
  test_failures: number;
  tool_calls_since_suggestion: number;
  suggestion_count: number;
}

/** Extended ContextState with cc_native method-specific data */
type CcNativeContextState = ContextState & { cc_native?: Record<string, unknown> };

function getCcNativeState(sessionId: string, projectRoot: string): Record<string, unknown> {
  try {
    const state = getContextBySessionId(sessionId, projectRoot) as CcNativeContextState | null;
    if (state?.cc_native && typeof state.cc_native === "object") {
      return state.cc_native;
    }
  } catch { /* fail-safe */ }
  return {};
}

function saveCcNativeState(
  sessionId: string,
  projectRoot: string,
  ccNativeData: Record<string, unknown>,
): boolean {
  try {
    const state = getContextBySessionId(sessionId, projectRoot) as CcNativeContextState | null;
    if (state) {
      state.cc_native = ccNativeData;
      saveState(state.id, state, projectRoot);
      return true;
    }
  } catch (e) {
    logWarn("suggest-fresh-perspective", `Failed to save cc_native state: ${e}`);
  }
  return false;
}

function loadStuckState(sessionId: string, projectRoot: string): StuckState {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  const stuck = (ccNative.stuck_detection ?? {}) as Record<string, unknown>;
  return {
    error_hashes: (stuck.error_hashes && typeof stuck.error_hashes === "object" ? stuck.error_hashes : {}) as Record<string, number>,
    file_edits: (stuck.file_edits && typeof stuck.file_edits === "object" ? stuck.file_edits : {}) as Record<string, number>,
    test_failures: typeof stuck.test_failures === "number" ? stuck.test_failures : 0,
    tool_calls_since_suggestion: typeof stuck.tool_calls_since_suggestion === "number" ? stuck.tool_calls_since_suggestion : 0,
    suggestion_count: typeof stuck.suggestion_count === "number" ? stuck.suggestion_count : 0,
  };
}

function saveStuckState(
  sessionId: string,
  projectRoot: string,
  stuckState: StuckState,
): void {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) || {};
    ccNative.stuck_detection = stuckState;
    if (!saveCcNativeState(sessionId, projectRoot, ccNative)) {
      logWarn("suggest-fresh-perspective", `Failed to save stuck detection state for session ${sessionId}`);
    }
  } catch (e) {
    logWarn("suggest-fresh-perspective", `Failed to save stuck detection state: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Detection Logic
// ---------------------------------------------------------------------------

function hashError(errorText: string): string {
  let normalized = errorText.replace(LINE_NUMBER_PATTERN, ":N");
  normalized = normalized.replace(MULTI_DIGIT_PATTERN, "N");
  normalized = normalized.replace(PATH_PATTERN, ".../");
  return normalized.slice(0, 100);
}

function detectRepeatedError(state: StuckState, toolResult: string, threshold: number): boolean {
  if (!toolResult) return false;
  if (ERROR_PATTERN.test(toolResult)) {
    const errorHash = hashError(toolResult);
    state.error_hashes[errorHash] = (state.error_hashes[errorHash] ?? 0) + 1;
    return state.error_hashes[errorHash]! >= threshold;
  }
  return false;
}

function detectRepeatedFileEdits(
  state: StuckState,
  toolName: string,
  toolInput: Record<string, unknown>,
  threshold: number,
): boolean {
  if (toolName !== "Edit") return false;
  if (!toolInput || typeof toolInput !== "object") return false;
  const filePath = String(toolInput.file_path ?? "");
  if (!filePath) return false;
  state.file_edits[filePath] = (state.file_edits[filePath] ?? 0) + 1;
  return state.file_edits[filePath]! >= threshold;
}

function detectTestFailures(
  state: StuckState,
  toolName: string,
  toolResult: string,
  threshold: number,
): boolean {
  if (toolName !== "Bash") return false;
  if (TEST_FAILURE_PATTERN.test(toolResult)) {
    state.test_failures += 1;
    return state.test_failures >= threshold;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  // Fast path: cheap checks first
  if (payload.hook_event_name !== "PostToolUse") return;

  const sessionId = payload.session_id;
  if (!sessionId) return;

  const toolName = payload.tool_name ?? "";
  if (toolName !== "Edit" && toolName !== "Bash") return;

  // Slow path: only for Edit/Bash
  const projectDir = getProjectRoot(payload.cwd);
  const config = loadStuckConfig(projectDir);

  if (!config.enabled) return;

  const toolInput = (payload.tool_input && typeof payload.tool_input === "object")
    ? payload.tool_input as Record<string, unknown>
    : {};

  const toolResult = payload.tool_result;
  let resultText = "";
  if (toolResult && typeof toolResult === "object") {
    const tr = toolResult as Record<string, unknown>;
    resultText = String(tr.output ?? tr.content ?? "");
  } else if (typeof toolResult === "string") {
    resultText = toolResult;
  }

  // Load state
  const state = loadStuckState(String(sessionId), projectDir);
  state.tool_calls_since_suggestion += 1;

  // Get thresholds
  const errorThreshold = intOrDefault(config.errorThreshold, 3);
  const fileEditThreshold = intOrDefault(config.fileEditThreshold, 4);
  const testFailureThreshold = intOrDefault(config.testFailureThreshold, 3);
  const cooldown = intOrDefault(config.cooldown, 10);
  const maxSuggestions = intOrDefault(config.maxSuggestions, 3);

  // Run ALL detections (don't short-circuit — each updates state)
  const errorDetected = detectRepeatedError(state, resultText, errorThreshold);
  const fileEditDetected = detectRepeatedFileEdits(state, toolName, toolInput, fileEditThreshold);
  const testFailureDetected = detectTestFailures(state, toolName, resultText, testFailureThreshold);

  // Save state AFTER all detections
  saveStuckState(String(sessionId), projectDir, state);

  const isStuck = errorDetected || fileEditDetected || testFailureDetected;

  if (isStuck) {
    if (errorDetected) logInfo("suggest-fresh-perspective", "Detected repeated error pattern");
    if (fileEditDetected) logInfo("suggest-fresh-perspective", "Detected repeated file edits");
    if (testFailureDetected) logInfo("suggest-fresh-perspective", "Detected repeated test failures");
  }

  // Only suggest if stuck AND past cooldown
  if (isStuck && state.tool_calls_since_suggestion >= cooldown) {
    state.tool_calls_since_suggestion = 0;
    state.suggestion_count += 1;
    saveStuckState(String(sessionId), projectDir, state);

    if (state.suggestion_count <= maxSuggestions) {
      logInfo("suggest-fresh-perspective", `Suggesting fresh perspective (suggestion #${state.suggestion_count})`);
      emitContext(
        "\n---\n" +
        "**Stuck?** You've been working on similar issues for a while. " +
        "Consider running `/fresh-perspective` to get an unbiased view of the problem " +
        "without code context anchoring your thinking.\n" +
        "---\n",
      );
    }
  }
}

runHook(main, "suggest_fresh_perspective");
