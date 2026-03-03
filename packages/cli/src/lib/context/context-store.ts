/**
 * Context store — 2-layer CRUD for context state management.
 * See SPEC.md §7
 *
 * Replaces context_manager's 3-layer approach with a simpler 2-layer model:
 *   state.json   (per context folder — SOURCE OF TRUTH)
 *   index.json   (at _output/ root — fast session→context lookup)
 */

import * as fs from "node:fs";
import path from "node:path";

import { atomicWrite } from "../runtime/atomic-write.js";
import {
  getArchiveContextDir,
  getArchiveDir,
  getArchiveIndexPath,
  getContextDir,
  getContextsDir,
  getIndexPath,
  validateContextId,
} from "../runtime/constants.js";
import { logError, logInfo, logWarn, setContextPath } from "../runtime/logger.js";
import { readStateJson, writeStateJson } from "../runtime/state-io.js";
import { generateContextId, nowIso } from "../runtime/utils.js";
import type { ContextState, IndexEntry, IndexFile, Mode } from "../types.js";

const INDEX_VERSION = "3.0";

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/**
 * Determine artifact type from context state.
 * Checks explicit nextArtifactType field first, falls back to field detection.
 *
 * Edge cases:
 * - Both artifacts exist: Log warning, return "plan" (deterministic fallback for corrupted state)
 * - No artifacts: Return null (caller handles gracefully)
 */
export function determineArtifactType(
  state: ContextState,
): "handoff" | "plan" | null {
  // Explicit field takes precedence
  if (state.nextArtifactType) {
    return state.nextArtifactType;
  }

  // Implicit detection
  const hasPlan = Boolean(state.planPath && state.planHash);
  const hasHandoff = Boolean(state.handoffPath);

  // Edge case: Both exist (shouldn't happen - indicates bug in replacement logic)
  // Fallback: Pick plan (deterministic, no filesystem I/O)
  if (hasPlan && hasHandoff) {
    logWarn(
      "context_store",
      `Context ${state.id} has both plan and handoff - indicates bug in replacement logic`,
    );
    return "plan";
  }

  if (hasPlan) return "plan";
  if (hasHandoff) return "handoff";

  // No artifacts present - return null (caller logs warning and skips)
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadIndex(projectRoot?: string): IndexFile {
  const indexPath = getIndexPath(projectRoot);
  if (fs.existsSync(indexPath)) {
    try {
      const raw = fs.readFileSync(indexPath, "utf8");
      return JSON.parse(raw) as IndexFile;
    } catch (error: unknown) {
      logWarn("context_store", `Failed to read index, recreating: ${error}`);
    }
  }

  return { version: INDEX_VERSION, updatedAt: nowIso(), sessions: {}, contexts: {} };
}

function saveIndex(index: IndexFile, projectRoot?: string): boolean {
  index.updatedAt = nowIso();
  const content = JSON.stringify(index, null, 2);
  const [success, error] = atomicWrite(getIndexPath(projectRoot), content);
  if (!success) {
    logWarn("context_store", `Failed to write index: ${error}`);
  }

  return success;
}

function toIndexEntry(state: ContextState): IndexEntry {
  return {
    summary: state.summary,
    mode: state.mode,
    lastActive: state.lastActive,
  };
}

function collectExistingContextIds(projectRoot?: string): Set<string> {
  const existingIds = new Set<string>();
  const contextsDir = getContextsDir(projectRoot);
  if (!fs.existsSync(contextsDir)) return existingIds;

  for (const entry of fs.readdirSync(contextsDir)) {
    const fullPath = path.join(contextsDir, entry);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        existingIds.add(entry);
      }
    } catch {
      // ignore
    }
  }

  return existingIds;
}

function scanContextsFromFolders(status: undefined | string, projectRoot?: string): ContextState[] {
  const contextsDir = getContextsDir(projectRoot);
  const results: ContextState[] = [];
  try {
    for (const entry of fs.readdirSync(contextsDir)) {
      if (entry.startsWith("_")) continue;
      const fullPath = path.join(contextsDir, entry);
      try {
        if (!fs.statSync(fullPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const state = loadState(entry, projectRoot);
      if (state && (!status || state.status === status)) {
        results.push(state);
      }
    }
  } catch {
    // empty dir / unreadable
  }

  return results;
}

/**
 * Backward compat: read legacy context.json and convert to ContextState.
 */
function migrateContextJson(contextId: string, projectRoot?: string): ContextState | null {
  const legacyPath = path.join(getContextDir(contextId, projectRoot), "context.json");
  if (!fs.existsSync(legacyPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    const inFlight = data.in_flight ?? {};
    const oldMode = inFlight.mode ?? "none";
    const MODE_MIGRATION: Record<string, string> = {
      none: "idle",
      planning: "idle",
      pendingImplementation: "has_plan",
      implementing: "active",
    };
    const mode = (MODE_MIGRATION[oldMode] ?? "idle") as Mode;

    const sessionIds: string[] = inFlight.sessionIds ??
      (inFlight.sessionId ? [inFlight.sessionId] : []);

    return {
      id: data.id ?? contextId,
      status: data.status ?? "active",
      summary: data.summary ?? "",
      method: data.method ?? "",
      tags: data.tags ?? [],
      createdAt: data.createdAt ?? "",
      lastActive: data.lastActive ?? "",
      mode,
      planPath: inFlight.artifact_path ?? null,
      planHash: inFlight.artifact_hash ?? null,
      planSignature: null,
      planId: null,
      planAnchors: [],
      planHashConsumed: null,
      planConsumed: false,
      handoffPath: inFlight.handoffPath ?? null,
      handoffConsumed: false,
      workConsumed: false,
      nextArtifactType: null,
      sessionIds,
      lastSession: null,
      tasks: [],
    };
  } catch (error: unknown) {
    logWarn("context_store", `Failed to migrate context.json for '${contextId}': ${error}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

/**
 * Read state.json for a context. Falls back to context.json for migration.
 * See SPEC.md §7.2
 */
export function loadState(contextId: string, projectRoot?: string): ContextState | null {
  const state = readStateJson(contextId, projectRoot);
  if (state) return state;

  // Backward compat: migrate from legacy context.json
  return migrateContextJson(contextId, projectRoot);
}

/**
 * Atomically write state.json AND update index.json.
 * See SPEC.md §7.3
 */
export function saveState(
  contextId: string,
  state: ContextState,
  projectRoot?: string,
): [boolean, null | string] {
  // Ensure the state ID matches
  state.id = contextId;

  const [success, error] = writeStateJson(contextId, state, projectRoot);
  if (!success) {
    logWarn("context_store", `Failed to write state.json for '${contextId}': ${error}`);
    return [false, error];
  }

  // Update index.json
  const index = loadIndex(projectRoot);
  index.contexts[contextId] = toIndexEntry(state);
  // Keep session mappings in sync
  for (const sid of state.sessionIds) {
    if (!index.sessions) index.sessions = {} as Record<string, string>;
    index.sessions[sid] = contextId;
  }

  const indexOk = saveIndex(index, projectRoot);
  if (!indexOk) {
    return [true, "state.json saved but index.json update failed"];
  }

  return [true, null];
}

/**
 * Create a new context folder + state.json + index entry.
 * Throws ValueError-equivalent if context already exists.
 * See SPEC.md §7.4
 */
export function createContext(
  contextId: null | string,
  summary: string,
  options?: {
    method?: string;
    projectRoot?: string;
    tags?: string[];
  },
): ContextState {
  const method = options?.method ?? "";
  const projectRoot = options?.projectRoot;
  const tags = options?.tags;
  // Generate ID if needed
  if (!contextId) {
    const existingIds = collectExistingContextIds(projectRoot);
    contextId = generateContextId(summary, existingIds);
  }

  contextId = validateContextId(contextId);
  const contextDir = getContextDir(contextId, projectRoot);

  if (fs.existsSync(contextDir)) {
    throw new Error(`Context '${contextId}' already exists`);
  }

  fs.mkdirSync(contextDir, { recursive: true });
  fs.mkdirSync(path.join(contextDir, "notes"), { recursive: true });

  const now = nowIso();
  const state: ContextState = {
    id: contextId,
    status: "active",
    summary,
    method,
    tags: tags ?? [],
    createdAt: now,
    lastActive: now,
    mode: "idle",
    planPath: null,
    planHash: null,
    planSignature: null,
    planId: null,
    planAnchors: [],
    planHashConsumed: null,
    handoffPath: null,
    workConsumed: false, // CHANGED: unified flag
    nextArtifactType: null,
    sessionIds: [],
    lastSession: null,
    tasks: [],
  };

  saveState(contextId, state, projectRoot);
  logInfo("context_store", `Created context: ${contextId}`);
  return state;
}

/**
 * Load a single context by ID.
 * See SPEC.md §7.5
 */
export function getContext(contextId: string, projectRoot?: string): ContextState | null {
  try {
    contextId = validateContextId(contextId);
  } catch {
    return null;
  }

  return loadState(contextId, projectRoot);
}

/**
 * List contexts from index.json, loading each state.json.
 * Falls back to scanning context folders if index is missing.
 * Results sorted by lastActive descending.
 * See SPEC.md §7.6
 */
export function getAllContexts(
  status?: string,
  projectRoot?: string,
): ContextState[] {
  const results: ContextState[] = [];
  const contextsDir = getContextsDir(projectRoot);
  if (!fs.existsSync(contextsDir)) return [];

  // Try index-driven path first
  const index = loadIndex(projectRoot);
  const ctxMap = index.contexts;

  if (ctxMap && typeof ctxMap === "object" && Object.keys(ctxMap).length > 0) {
    for (const cid of Object.keys(ctxMap)) {
      const state = loadState(cid, projectRoot);
      if (state && (!status || state.status === status)) {
        results.push(state);
      }
    }
  } else {
    results.push(...scanContextsFromFolders(status, projectRoot));
  }

  results.sort((a, b) => (b.lastActive || "").localeCompare(a.lastActive || ""));
  return results;
}

/**
 * Update allowed metadata fields (summary, tags, method) on a context.
 * See SPEC.md §7.7
 */
export function updateContext(
  contextId: string,
  updates: Partial<Pick<ContextState, "method" | "summary" | "tags">>,
  projectRoot?: string,
): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) return null;

  let changed = false;
  if (updates.summary !== undefined) { state.summary = updates.summary; changed = true; }
  if (updates.tags !== undefined) { state.tags = updates.tags; changed = true; }
  if (updates.method !== undefined) { state.method = updates.method; changed = true; }

  if (!changed) return state;

  state.lastActive = nowIso();
  saveState(contextId, state, projectRoot);
  return state;
}

// ---------------------------------------------------------------------------
// Session binding & mode updates
// ---------------------------------------------------------------------------

/**
 * O(1) lookup: check index.json sessions map first.
 * Side effect: sets logger context path for per-context log routing.
 * See SPEC.md §7.8
 */
export function getContextBySessionId(
  sessionId: string,
  projectRoot?: string,
): ContextState | null {
  if (!sessionId || sessionId === "unknown") return null;

  const index = loadIndex(projectRoot);
  const cid = index.sessions?.[sessionId];
  if (cid) {
    const state = loadState(cid, projectRoot);
    if (state) {
      setLoggerContext(state.id, projectRoot);
      return state;
    }
  }

  // Fallback: scan all contexts
  for (const state of getAllContexts("active", projectRoot)) {
    if (state.sessionIds.includes(sessionId)) {
      setLoggerContext(state.id, projectRoot);
      return state;
    }
  }

  return null;
}

function setLoggerContext(contextId: string, projectRoot?: string): void {
  try {
    const ctxDir = getContextDir(contextId, projectRoot);
    if (fs.existsSync(ctxDir)) {
      setContextPath(ctxDir);
    }
  } catch {
    // Never crash on logging setup
  }
}

/**
 * Add sessionId to both index.json sessions map and state.json sessionIds.
 * See SPEC.md §7.9
 */
export function bindSession(
  contextId: string,
  sessionId: string,
  projectRoot?: string,
): boolean {
  if (!sessionId || sessionId === "unknown") return false;

  const state = getContext(contextId, projectRoot);
  if (!state) return false;

  if (!state.sessionIds.includes(sessionId)) {
    state.sessionIds.push(sessionId);
  }

  state.lastActive = nowIso();

  const [success] = saveState(contextId, state, projectRoot);
  return success;
}

/**
 * Change the mode field, optionally setting plan/handoff fields.
 * See SPEC.md §7.10
 */
export function updateMode(
  contextId: string,
  mode: Mode,
  projectRoot?: string,
  opts?: {
    planAnchors?: string[];
    planHash?: string;
    planHashConsumed?: string;
    planId?: string;
    planPath?: string;
    planSignature?: string;
    workConsumed?: boolean; // FIXED: unified flag (was planConsumed/handoffConsumed)
  },
): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) return null;

  state.mode = mode;
  state.lastActive = nowIso();

  if (opts) {
    if (opts.planPath !== undefined) state.planPath = opts.planPath;
    if (opts.planHash !== undefined) state.planHash = opts.planHash;
    if (opts.planSignature !== undefined) state.planSignature = opts.planSignature;
    if (opts.planId !== undefined) state.planId = opts.planId;
    if (opts.planAnchors !== undefined) state.planAnchors = opts.planAnchors;
    if (opts.workConsumed !== undefined) state.workConsumed = opts.workConsumed; // CHANGED: unified flag
    if (opts.planHashConsumed !== undefined)
      state.planHashConsumed = opts.planHashConsumed;
  }

  // Clear plan/handoff fields when returning to idle
  if (mode === "idle") {
    state.planPath = null;
    state.planHash = null;
    state.planSignature = null;
    state.planId = null;
    state.planAnchors = [];
    state.planHashConsumed = null;
    state.handoffPath = null;
    state.workConsumed = false; // CHANGED: unified flag
    state.nextArtifactType = null;
  }

  saveState(contextId, state, projectRoot);
  return state;
}

/**
 * Transition idle/hasStagedWork → active, unless in plan mode.
 * See SPEC.md §7.11
 */
export function maybeActivate(
  contextId: string,
  permissionMode: string,
  projectRoot?: string,
  caller = "",
): boolean {
  if (permissionMode === "plan") return false;

  const state = getContext(contextId, projectRoot);
  if (!state) return false;

  if (state.mode === "idle" || state.mode === "hasStagedWork") {
    const oldMode = state.mode;
    const opts: Record<string, unknown> = {};
    if (oldMode === "hasStagedWork") opts.workConsumed = true; // CHANGED: unified flag
    updateMode(contextId, "active", projectRoot, opts);
    logInfo(
      "context_store",
      `maybe_activate (${caller}): ${contextId} ${oldMode} -> active`,
    );
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Mark context completed and archive it.
 * See SPEC.md §7.12
 */
export function completeContext(contextId: string, projectRoot?: string): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) return null;

  if (state.status === "completed") {
    logInfo("context_store", `Context '${contextId}' already completed`);
    return state;
  }

  state.status = "completed";
  state.lastActive = nowIso();
  saveState(contextId, state, projectRoot);
  logInfo("context_store", `Completed context: ${contextId}`);

  const archived = archiveContext(contextId, projectRoot);
  return archived ?? state;
}

/**
 * Move completed context folder to _archive/, update indices.
 * See SPEC.md §7.13
 */
export function archiveContext(contextId: string, projectRoot?: string): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) {
    logWarn("context_store", `Cannot archive: context '${contextId}' not found`);
    return null;
  }

  if (state.status !== "completed") {
    logWarn("context_store", `Cannot archive: context '${contextId}' not completed`);
    return null;
  }

  const sourceDir = getContextDir(contextId, projectRoot);
  const archiveDest = getArchiveContextDir(contextId, projectRoot);

  if (fs.existsSync(archiveDest)) {
    logWarn("context_store", `Cannot archive: archive folder already exists for '${contextId}'`);
    return null;
  }

  const archiveParent = path.dirname(archiveDest);
  fs.mkdirSync(archiveParent, { recursive: true });

  try {
    fs.renameSync(sourceDir, archiveDest);
  } catch (error: unknown) {
    logError("context_store", `Failed to move context to archive: ${error}`);
    return null;
  }

  // Remove from main index
  const index = loadIndex(projectRoot);
  delete index.contexts[contextId];
  const sessions = index.sessions ?? {};
  for (const [sid, cid] of Object.entries(sessions)) {
    if (cid === contextId) delete sessions[sid];
  }

  saveIndex(index, projectRoot);

  // Add to archive index
  updateArchiveIndex(state, projectRoot);

  logInfo("context_store", `Archived context: ${contextId}`);
  return state;
}

/**
 * Reopen a completed/archived context.
 * See SPEC.md §7.14
 */
export function reopenContext(contextId: string, projectRoot?: string): ContextState | null {
  let state = getContext(contextId, projectRoot);

  if (!state) {
    state = restoreFromArchive(contextId, projectRoot);
  }

  if (!state) return null;

  if (state.status === "active") {
    logInfo("context_store", `Context '${contextId}' already active`);
    return state;
  }

  state.status = "active";
  state.lastActive = nowIso();
  saveState(contextId, state, projectRoot);
  logInfo("context_store", `Reopened context: ${contextId}`);
  return state;
}

// ---------------------------------------------------------------------------
// Auto-creation from prompt
// ---------------------------------------------------------------------------

/**
 * Auto-create a context from the user's prompt.
 * See SPEC.md §7.15
 */
export function createContextFromPrompt(
  userPrompt: string,
  projectRoot?: string,
): ContextState {
  let summary = userPrompt.trim().slice(0, 2000);
  if (userPrompt.trim().length > 2000) {
    summary += "...";
  }

  return createContext(
    null,
    summary,
    {
      method: "auto-created",
      projectRoot,
      tags: ["auto-created"],
    },
  );
}


// ---------------------------------------------------------------------------
// Archive helpers
// ---------------------------------------------------------------------------

function updateArchiveIndex(state: ContextState, projectRoot?: string): boolean {
  const archiveDir = getArchiveDir(projectRoot);
  const archiveIndexPath = getArchiveIndexPath(projectRoot);
  fs.mkdirSync(archiveDir, { recursive: true });

  let archiveIndex: IndexFile = {
    version: INDEX_VERSION,
    updatedAt: nowIso(),
    sessions: {},
    contexts: {},
  };

  if (fs.existsSync(archiveIndexPath)) {
    try {
      archiveIndex = JSON.parse(fs.readFileSync(archiveIndexPath, "utf8"));
    } catch (error_: unknown) {
      logWarn("context_store", `Failed to read archive index, recreating: ${error_}`);
    }
  }

  archiveIndex.contexts[state.id] = toIndexEntry(state);
  archiveIndex.updatedAt = nowIso();

  const content = JSON.stringify(archiveIndex, null, 2);
  const [success, error] = atomicWrite(archiveIndexPath, content);
  if (!success) {
    logWarn("context_store", `Failed to write archive index: ${error}`);
  }

  return success;
}

function restoreFromArchive(contextId: string, projectRoot?: string): ContextState | null {
  const archiveDir = getArchiveContextDir(contextId, projectRoot);
  const activeDir = getContextDir(contextId, projectRoot);

  if (!fs.existsSync(archiveDir)) return null;
  if (fs.existsSync(activeDir)) {
    logWarn("context_store", `Cannot restore: active folder already exists for '${contextId}'`);
    return null;
  }

  try {
    fs.renameSync(archiveDir, activeDir);
  } catch (error: unknown) {
    logError("context_store", `Failed to restore context from archive: ${error}`);
    return null;
  }

  // Remove from archive index
  removeFromArchiveIndex(contextId, projectRoot);

  const state = loadState(contextId, projectRoot);
  logInfo("context_store", `Restored context from archive: ${contextId}`);
  return state;
}

function removeFromArchiveIndex(contextId: string, projectRoot?: string): boolean {
  const archiveIndexPath = getArchiveIndexPath(projectRoot);
  if (!fs.existsSync(archiveIndexPath)) return true;

  try {
    const archiveIndex = JSON.parse(fs.readFileSync(archiveIndexPath, "utf8")) as IndexFile;
    if (archiveIndex.contexts[contextId]) {
      delete archiveIndex.contexts[contextId];
      archiveIndex.updatedAt = nowIso();
      const content = JSON.stringify(archiveIndex, null, 2);
      const [success, error] = atomicWrite(archiveIndexPath, content);
      if (!success) {
        logWarn("context_store", `Failed to write archive index: ${error}`);
        return false;
      }
    }

    return true;
  } catch (error: unknown) {
    logWarn("context_store", `Failed to read archive index: ${error}`);
    return false;
  }
}




