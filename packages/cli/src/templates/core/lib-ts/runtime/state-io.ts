/**
 * Shared I/O for state.json — read, write, serialize.
 * Extracted to avoid circular deps between context-store and task-tracker.
 * See SPEC.md §7.1
 */

import * as fs from "node:fs";
import path from "node:path";

import { atomicWrite } from "./atomic-write.js";
import { getContextDir } from "./constants.js";
import { logWarn } from "./logger.js";
import type { ContextState, Mode } from "../types.js";

/** Mode migration from legacy context_manager values. */
const MODE_MIGRATION: Record<string, Mode> = {
  none: "idle",
  planning: "idle",
  pending_implementation: "has_staged_work",
  implementing: "active",
};

/** Legacy state data structure for migration type safety. */
interface LegacyStateData {
  mode?: string;
  plan_path?: string | null;
  plan_hash?: string | null;
  handoff_path?: string | null;
  plan_consumed?: boolean;
  handoff_consumed?: boolean;
  work_consumed?: boolean;
  next_artifact_type?: "plan" | "handoff" | null;
}

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
 * Migrate old consumed flags to unified work_consumed.
 * Runs on every state.json read for transparent backward compatibility.
 * Idempotent: safe to run multiple times.
 */
function migrateConsumedFlags(data: Record<string, unknown>): void {
  const legacy = data as LegacyStateData;

  // Skip if already migrated (check both fields and mode)
  const alreadyMigrated =
    typeof legacy.work_consumed === "boolean" &&
    legacy.mode !== "has_plan" &&
    legacy.mode !== "has_handoff";
  if (alreadyMigrated) return;

  const hasPlan = Boolean(legacy.plan_path && legacy.plan_hash);
  const hasHandoff = Boolean(legacy.handoff_path);

  // Migrate consumed flag (plan takes precedence if both exist)
  if (hasPlan && typeof legacy.plan_consumed === "boolean") {
    (data as Record<string, unknown>).work_consumed = legacy.plan_consumed;
  } else if (hasHandoff && typeof legacy.handoff_consumed === "boolean") {
    (data as Record<string, unknown>).work_consumed = legacy.handoff_consumed;
  } else {
    (data as Record<string, unknown>).work_consumed = false;
  }

  // Migrate mode: has_plan/has_handoff → has_staged_work
  if (legacy.mode === "has_plan" || legacy.mode === "has_handoff") {
    const artifactType = legacy.mode === "has_handoff" ? "handoff" : "plan";
    (data as Record<string, unknown>).mode = "has_staged_work";
    (data as Record<string, unknown>).next_artifact_type = artifactType;
  }

  // Set next_artifact_type based on which artifact exists
  if (!legacy.next_artifact_type) {
    if (hasPlan && hasHandoff) {
      // Both exist - conflict resolution: plan priority during migration
      // (Cannot determine "latest" without timestamps - plan takes precedence)
      (data as Record<string, unknown>).next_artifact_type = "plan";
      (data as Record<string, unknown>).handoff_path = null;
    } else if (hasPlan) {
      (data as Record<string, unknown>).next_artifact_type = "plan";
    } else if (hasHandoff) {
      (data as Record<string, unknown>).next_artifact_type = "handoff";
    }
  }

  // Delete old flags (clean cut migration)
  delete (data as Record<string, unknown>).plan_consumed;
  delete (data as Record<string, unknown>).handoff_consumed;
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
    const data = JSON.parse(raw) as Record<string, unknown>;
    migrateConsumedFlags(data); // Migrate before dictToState
    return dictToState(data);
  } catch (error: unknown) {
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
): [boolean, string | null] {
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
export function dictToState(data: Record<string, unknown>): ContextState {
  // Validate required fields
  if (typeof data.id !== "string" || !data.id) {
    throw new Error("dictToState: missing or invalid required field 'id'");
  }

  const rawMode: string =
    typeof data.mode === "string" ? data.mode : "idle";
  const mode: Mode = (MODE_MIGRATION[rawMode] ?? rawMode) as Mode;

  const state: Record<string, unknown> = {
    id: data.id,
    status: data.status ?? "active",
    summary: data.summary ?? "",
    method: data.method ?? "",
    tags: data.tags ?? [],
    created_at: data.created_at ?? "",
    last_active: data.last_active ?? "",
    mode,
    plan_anchors: data.plan_anchors ?? [],
    work_consumed: data.work_consumed ?? false,
    session_ids: data.session_ids ?? [],
    tasks: data.tasks ?? [],
  };

  // Only set nullable fields if they exist in the source data
  if ("plan_path" in data) state.plan_path = data.plan_path;
  if ("plan_hash" in data) state.plan_hash = data.plan_hash;
  if ("plan_signature" in data) state.plan_signature = data.plan_signature;
  if ("plan_id" in data) state.plan_id = data.plan_id;
  if ("handoff_path" in data) state.handoff_path = data.handoff_path;
  if ("next_artifact_type" in data) state.next_artifact_type = data.next_artifact_type;
  if ("last_session" in data) state.last_session = data.last_session;

  // Migration: plan_hash_consumed (added in multi-plan context fix)
  if ("plan_hash_consumed" in data) {
    state.plan_hash_consumed = data.plan_hash_consumed;
  } else {
    state.plan_hash_consumed = null;  // Default for old contexts
  }

  // Preserve method-specific extension data (e.g., cc_native) that isn't
  // part of the core ContextState interface. Without this, round-trip
  // read→write cycles silently drop extension fields.
  for (const key of Object.keys(data)) {
    if (!(key in state)) {
      state[key] = data[key];
    }
  }

  return state as unknown as ContextState;
}



