/**
 * Iteration state management for plan review cycles.
 * State files are stored adjacent to plan files (e.g., foo.md → foo.state.json).
 * See cc-native-plan-review-spec.md §4.7
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { validatePlanPath } from "./constants.js";
import type { IterationState, IterationEntry } from "./types.js";
import { atomicWrite } from "../../_shared/lib-ts/base/atomic-write.js";
import { logInfo, logWarn, logError } from "../../_shared/lib-ts/base/logger.js";
import { nowIso } from "../../_shared/lib-ts/base/utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_SCHEMA_VERSION = "1.0.0";

export const DEFAULT_REVIEW_ITERATIONS: Record<string, number> = {
  simple: 1,
  medium: 3,
  high: 5,
};

// ---------------------------------------------------------------------------
// State File Management
// ---------------------------------------------------------------------------

/**
 * Derive state file path from plan file path with security validation.
 * Example: ~/.claude/plans/foo.md → ~/.claude/plans/foo.state.json
 *
 * @throws Error if planPath is invalid or insecure
 */
export function getStateFilePath(planPath: string): string {
  const validated = validatePlanPath(planPath);
  const parsed = path.parse(validated);
  return path.join(parsed.dir, `${parsed.name}.state.json`);
}

/**
 * Load state file with schema validation and migration.
 */
export function loadState(planPath: string): Record<string, unknown> | null {
  try {
    const stateFile = getStateFilePath(planPath);

    if (!fs.existsSync(stateFile)) {
      return null;
    }

    const state = JSON.parse(
      fs.readFileSync(stateFile, "utf-8"),
    ) as Record<string, unknown>;

    // Handle schema version (backward compatible)
    const schemaVersion = state.schema_version as string | undefined;

    if (schemaVersion === undefined) {
      state.schema_version = STATE_SCHEMA_VERSION;
      logInfo(
        "state",
        `Migrated state file to schema v${STATE_SCHEMA_VERSION}`,
      );
    } else if (schemaVersion !== STATE_SCHEMA_VERSION) {
      logWarn(
        "state",
        `Schema mismatch (expected ${STATE_SCHEMA_VERSION}, got ${schemaVersion})`,
      );
    }

    return state;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Invalid plan path")) {
      logError("state", `SECURITY: Invalid plan path: ${error}`);
    } else {
      logError("state", `Failed to load state: ${error}`);
    }
    return null;
  }
}

/**
 * Save state file with schema version and validation.
 * Returns true on success, false on failure.
 */
export function saveStateToPlan(
  planPath: string,
  state: Record<string, unknown>,
): boolean {
  try {
    const stateFile = getStateFilePath(planPath);

    const stateWithVersion = {
      schema_version: STATE_SCHEMA_VERSION,
      ...state,
    };

    const [success, error] = atomicWrite(
      stateFile,
      JSON.stringify(stateWithVersion, null, 2),
    );

    if (!success) {
      logError("state", `Failed to save state: ${error}`);
      return false;
    }

    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Invalid plan path")) {
      logError("state", `SECURITY: Invalid plan path: ${error}`);
    } else {
      logError("state", String(error));
    }
    return false;
  }
}

/**
 * Delete state file after successful archive.
 * Returns true if deleted or didn't exist, false on error.
 */
export function deleteState(planPath: string): boolean {
  try {
    const stateFile = getStateFilePath(planPath);
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
      logInfo("state", `Deleted state file: ${stateFile}`);
    }
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Invalid plan path")) {
      logError("state", `SECURITY: Invalid plan path in delete: ${error}`);
      return false;
    }
    logWarn("state", `Failed to delete state file: ${error}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Iteration State Management
// ---------------------------------------------------------------------------

/**
 * Get or initialize iteration state based on complexity.
 */
export function getIterationState(
  state: Record<string, unknown>,
  complexity: string,
  config?: Record<string, unknown>,
): IterationState {
  if (state.iteration) {
    return state.iteration as IterationState;
  }

  // Initialize new iteration state
  const reviewIterations = { ...DEFAULT_REVIEW_ITERATIONS };
  if (config) {
    const overrides = config.reviewIterations as
      | Record<string, number>
      | undefined;
    if (overrides) {
      Object.assign(reviewIterations, overrides);
    }
  }

  return {
    current: 1,
    max: reviewIterations[complexity] ?? 1,
    complexity,
    history: [],
    graduated: [],
    passStreaks: {},
    lastPlanHash: "",
    lastPlanPath: "",
    sessionId: "",
  };
}

/**
 * Record review result in iteration history and update state.
 */
export function updateIterationState(
  state: Record<string, unknown>,
  iteration: IterationState,
  planHash: string,
  verdict: string,
): Record<string, unknown> {
  const entry: IterationEntry = {
    hash: planHash,
    verdict,
    timestamp: nowIso(),
  };

  iteration.history.push(entry);
  state.iteration = iteration;
  return state;
}

/**
 * Determine if more review iterations are needed.
 */
export function shouldContinueIterating(
  iteration: IterationState,
  verdict: string,
  config?: Record<string, unknown>,
): boolean {
  const {current} = iteration;
  const maxIter = iteration.max;

  // At or past max iterations
  if (current >= maxIter) {
    logInfo(
      "state",
      `At max iterations (${current}/${maxIter}), no more iterations`,
    );
    return false;
  }

  // Check early exit on all pass
  let earlyExit = true;
  if (config) {
    earlyExit = (config.earlyExitOnAllPass as boolean) ?? true;
  }
  if (earlyExit && verdict === "pass") {
    logInfo(
      "state",
      "All reviewers passed and earlyExitOnAllPass=true, exiting early",
    );
    return false;
  }

  logInfo(
    "state",
    `Continuing to next iteration (${current + 1}/${maxIter}), verdict=${verdict}`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Review-level Iteration State I/O (stored in reviews dir)
// ---------------------------------------------------------------------------

/**
 * Load iteration state from the reviews directory.
 */
export function loadIterationState(reviewsDir: string): IterationState | null {
  const iterationFile = path.join(reviewsDir, "iteration.json");
  if (!fs.existsSync(iterationFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(iterationFile, "utf-8")) as IterationState;
  } catch (error) {
    logError("state", `Failed to load iteration state: ${error}`);
    return null;
  }
}

/**
 * Save iteration state to the reviews directory.
 */
export function saveIterationState(reviewsDir: string, state: IterationState): boolean {
  const iterationFile = path.join(reviewsDir, "iteration.json");
  try {
    fs.mkdirSync(reviewsDir, { recursive: true });
    const toWrite = { ...state, schema_version: "1.0.0" };
    fs.writeFileSync(iterationFile, JSON.stringify(toWrite, null, 2), "utf-8");
    return true;
  } catch (error) {
    logError("state", `Failed to save iteration state: ${error}`);
    return false;
  }
}
