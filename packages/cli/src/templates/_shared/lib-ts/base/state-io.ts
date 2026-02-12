/**
 * Shared I/O for state.json — read, write, serialize.
 * Extracted to avoid circular deps between context-store and task-tracker.
 * See SPEC.md §7.1
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { atomicWrite } from "./atomic-write.js";
import { getContextDir } from "./constants.js";
import { logWarn } from "./logger.js";
import type { ContextState, Mode } from "../types.js";

/** Mode migration from legacy context_manager values. */
const MODE_MIGRATION: Record<string, Mode> = {
  none: "idle",
  planning: "idle",
  pending_implementation: "has_plan",
  implementing: "active",
};

/**
 * Serialize a ContextState for JSON output.
 * Omits null/undefined keys but keeps false, 0, empty string, and empty arrays.
 */
export function toDict(state: ContextState): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get path to state.json for a context.
 */
export function statePath(contextId: string, projectRoot?: string): string {
  return path.join(getContextDir(contextId, projectRoot), "state.json");
}

/**
 * Read and parse state.json for a context.
 * Applies legacy mode migration. Returns null if file doesn't exist or is corrupt.
 */
export function readStateJson(
  contextId: string,
  projectRoot?: string,
): ContextState | null {
  const sp = statePath(contextId, projectRoot);
  if (!fs.existsSync(sp)) return null;

  try {
    const raw = fs.readFileSync(sp, "utf8");
    const data = JSON.parse(raw) as Record<string, any>;
    return dictToState(data);
  } catch (error: any) {
    logWarn("state_io", `Failed to read state.json for '${contextId}': ${error}`);
    return null;
  }
}

/**
 * Atomically write state.json for a context.
 * Returns [success, error].
 */
export function writeStateJson(
  contextId: string,
  state: ContextState,
  projectRoot?: string,
): [boolean, null | string] {
  const sp = statePath(contextId, projectRoot);
  const dir = path.dirname(sp);
  fs.mkdirSync(dir, { recursive: true });

  const content = JSON.stringify(toDict(state), null, 2);
  return atomicWrite(sp, content);
}

/**
 * Construct a ContextState from a dict, migrating old mode names.
 * Only includes fields that are present in the source data (preserves null-stripping).
 */
export function dictToState(data: Record<string, any>): ContextState {
  const rawMode: string = data.mode ?? "idle";
  const mode: Mode = (MODE_MIGRATION[rawMode] ?? rawMode) as Mode;

  const state: any = {
    id: data.id,
    status: data.status ?? "active",
    summary: data.summary ?? "",
    method: data.method ?? "",
    tags: data.tags ?? [],
    created_at: data.created_at ?? "",
    last_active: data.last_active ?? "",
    mode,
    plan_anchors: data.plan_anchors ?? [],
    plan_consumed: data.plan_consumed ?? false,
    handoff_consumed: data.handoff_consumed ?? false,
    session_ids: data.session_ids ?? [],
    tasks: data.tasks ?? [],
  };

  // Only set nullable fields if they exist in the source data
  if ("plan_path" in data) state.plan_path = data.plan_path;
  if ("plan_hash" in data) state.plan_hash = data.plan_hash;
  if ("plan_signature" in data) state.plan_signature = data.plan_signature;
  if ("plan_id" in data) state.plan_id = data.plan_id;
  if ("handoff_path" in data) state.handoff_path = data.handoff_path;
  if ("last_session" in data) state.last_session = data.last_session;

  return state as ContextState;
}
