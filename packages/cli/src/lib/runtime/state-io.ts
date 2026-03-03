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
  pendingImplementation: "hasStagedWork",
  implementing: "active",
};

/** Legacy state data structure for migration type safety. */
interface LegacyStateData {
  handoffConsumed?: boolean;
  handoffPath?: null | string;
  mode?: string;
  nextArtifactType?: "handoff" | "plan" | null;
  planConsumed?: boolean;
  planHash?: null | string;
  planPath?: null | string;
  workConsumed?: boolean;
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
 * Migrate old consumed flags to unified workConsumed.
 * Runs on every state.json read for transparent backward compatibility.
 * Idempotent: safe to run multiple times.
 */
function migrateConsumedFlags(data: Record<string, unknown>): void {
  const legacy = data as LegacyStateData;

  // Skip if already migrated (check both fields and mode)
  const alreadyMigrated =
    typeof legacy.workConsumed === "boolean" &&
    legacy.mode !== "has_plan" &&
    legacy.mode !== "has_handoff";
  if (alreadyMigrated) return;

  const hasPlan = Boolean(legacy.planPath && legacy.planHash);
  const hasHandoff = Boolean(legacy.handoffPath);

  // Migrate consumed flag (plan takes precedence if both exist)
  if (hasPlan && typeof legacy.planConsumed === "boolean") {
    (data as Record<string, unknown>).workConsumed = legacy.planConsumed;
  } else if (hasHandoff && typeof legacy.handoffConsumed === "boolean") {
    (data as Record<string, unknown>).workConsumed = legacy.handoffConsumed;
  } else {
    (data as Record<string, unknown>).workConsumed = false;
  }

  // Migrate mode: has_plan/has_handoff → hasStagedWork
  if (legacy.mode === "has_plan" || legacy.mode === "has_handoff") {
    const artifactType = legacy.mode === "has_handoff" ? "handoff" : "plan";
    (data as Record<string, unknown>).mode = "hasStagedWork";
    (data as Record<string, unknown>).nextArtifactType = artifactType;
  }

  // Set nextArtifactType based on which artifact exists
  if (!legacy.nextArtifactType) {
    if (hasPlan && hasHandoff) {
      // Both exist - conflict resolution: plan priority during migration
      // (Cannot determine "latest" without timestamps - plan takes precedence)
      (data as Record<string, unknown>).nextArtifactType = "plan";
      (data as Record<string, unknown>).handoffPath = null;
    } else if (hasPlan) {
      (data as Record<string, unknown>).nextArtifactType = "plan";
    } else if (hasHandoff) {
      (data as Record<string, unknown>).nextArtifactType = "handoff";
    }
  }

  // Delete old flags (clean cut migration)
  delete (data as Record<string, unknown>).planConsumed;
  delete (data as Record<string, unknown>).handoffConsumed;
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
export function dictToState(data: Record<string, unknown>): ContextState {
  // Validate required fields
  if (typeof data.id !== "string" || !data.id) {
    throw new Error("dictToState: missing or invalid required field 'id'");
  }

  const rawMode: string =
    typeof data.mode === "string" ? data.mode : "idle";
  const mode: Mode = (MODE_MIGRATION[rawMode] ?? rawMode) as Mode;

  const state: unknown = {
    id: data.id,
    status: data.status ?? "active",
    summary: data.summary ?? "",
    method: data.method ?? "",
    tags: data.tags ?? [],
    createdAt: data.createdAt ?? "",
    lastActive: data.lastActive ?? "",
    mode,
    planAnchors: data.planAnchors ?? [],
    workConsumed: data.workConsumed ?? false,
    sessionIds: data.sessionIds ?? [],
    tasks: data.tasks ?? [],
  };

  applyOptionalStateFields(state, data);

  // Preserve method-specific extension data (e.g., cc_native) that isn't
  // part of the core ContextState interface. Without this, round-trip
  // read→write cycles silently drop extension fields.
  for (const key of Object.keys(data)) {
    if (!(key in state)) {
      state[key] = data[key];
    }
  }

  return state as ContextState;
}

function applyOptionalStateFields(state: Record<string, unknown>, data: Record<string, unknown>): void {
  const mappings: Array<[string, string]> = [
    ["planPath", "planPath"],
    ["planHash", "planHash"],
    ["planSignature", "planSignature"],
    ["planId", "planId"],
    ["handoffPath", "handoffPath"],
    ["nextArtifactType", "nextArtifactType"],
    ["lastSession", "lastSession"],
  ];

  for (const [sourceKey, targetKey] of mappings) {
    if (sourceKey in data) state[targetKey] = data[sourceKey];
  }

  state.planHashConsumed = "planHashConsumed" in data ? data.planHashConsumed : null;
}




