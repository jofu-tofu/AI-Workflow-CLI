/**
 * Context store — 2-layer CRUD for context state management.
 * See SPEC.md §7
 *
 * Replaces context_manager's 3-layer approach with a simpler 2-layer model:
 *   state.json   (per context folder — SOURCE OF TRUTH)
 *   index.json   (at _output/ root — fast session→context lookup)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { readStateJson, writeStateJson, toDict, dictToState } from "../base/state-io.js";
import { atomicWrite } from "../base/atomic-write.js";
import {
  getContextDir,
  getContextsDir,
  getIndexPath,
  getArchiveDir,
  getArchiveContextDir,
  getArchiveIndexPath,
  validateContextId,
} from "../base/constants.js";
import { logDebug, logInfo, logWarn, logError, setContextPath } from "../base/logger.js";
import { nowIso, generateContextId } from "../base/utils.js";
import type { ContextState, IndexFile, IndexEntry, Mode } from "../types.js";

const INDEX_VERSION = "3.0";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadIndex(projectRoot?: string): IndexFile {
  const indexPath = getIndexPath(projectRoot);
  if (fs.existsSync(indexPath)) {
    try {
      const raw = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(raw) as IndexFile;
    } catch (e: any) {
      logWarn("context_store", `Failed to read index, recreating: ${e}`);
    }
  }
  return { version: INDEX_VERSION, updated_at: nowIso(), sessions: {}, contexts: {} };
}

function saveIndex(index: IndexFile, projectRoot?: string): boolean {
  index.updated_at = nowIso();
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
    last_active: state.last_active,
  };
}

/**
 * Backward compat: read legacy context.json and convert to ContextState.
 */
function migrateContextJson(contextId: string, projectRoot?: string): ContextState | null {
  const legacyPath = path.join(getContextDir(contextId, projectRoot), "context.json");
  if (!fs.existsSync(legacyPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
    const inFlight = data.in_flight ?? {};
    const oldMode = inFlight.mode ?? "none";
    const MODE_MIGRATION: Record<string, string> = {
      none: "idle",
      planning: "idle",
      pending_implementation: "has_plan",
      implementing: "active",
    };
    const mode = (MODE_MIGRATION[oldMode] ?? "idle") as Mode;

    const sessionIds: string[] = inFlight.session_ids ??
      (inFlight.session_id ? [inFlight.session_id] : []);

    return {
      id: data.id ?? contextId,
      status: data.status ?? "active",
      summary: data.summary ?? "",
      method: data.method ?? "",
      tags: data.tags ?? [],
      created_at: data.created_at ?? "",
      last_active: data.last_active ?? "",
      mode,
      plan_path: inFlight.artifact_path ?? null,
      plan_hash: inFlight.artifact_hash ?? null,
      plan_signature: null,
      plan_id: null,
      plan_anchors: [],
      plan_consumed: false,
      handoff_path: inFlight.handoff_path ?? null,
      handoff_consumed: false,
      session_ids: sessionIds,
      last_session: null,
      tasks: [],
    };
  } catch (e: any) {
    logWarn("context_store", `Failed to migrate context.json for '${contextId}': ${e}`);
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
): [boolean, string | null] {
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
  for (const sid of state.session_ids) {
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
  contextId: string | null,
  summary: string,
  method = "",
  projectRoot?: string,
  tags?: string[],
): ContextState {
  // Generate ID if needed
  if (!contextId) {
    const existingIds = new Set<string>();
    const contextsDir = getContextsDir(projectRoot);
    if (fs.existsSync(contextsDir)) {
      for (const entry of fs.readdirSync(contextsDir)) {
        const fullPath = path.join(contextsDir, entry);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            existingIds.add(entry);
          }
        } catch { /* ignore */ }
      }
    }
    contextId = generateContextId(summary, existingIds);
  }

  contextId = validateContextId(contextId);
  const contextDir = getContextDir(contextId, projectRoot);

  if (fs.existsSync(contextDir)) {
    throw new Error(`Context '${contextId}' already exists`);
  }

  fs.mkdirSync(contextDir, { recursive: true });

  const now = nowIso();
  const state: ContextState = {
    id: contextId,
    status: "active",
    summary,
    method,
    tags: tags ?? [],
    created_at: now,
    last_active: now,
    mode: "idle",
    plan_path: null,
    plan_hash: null,
    plan_signature: null,
    plan_id: null,
    plan_anchors: [],
    plan_consumed: false,
    handoff_path: null,
    handoff_consumed: false,
    session_ids: [],
    last_session: null,
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
 * Results sorted by last_active descending.
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
    // Fallback: scan folders
    try {
      for (const entry of fs.readdirSync(contextsDir)) {
        if (entry.startsWith("_")) continue;
        const fullPath = path.join(contextsDir, entry);
        try {
          if (!fs.statSync(fullPath).isDirectory()) continue;
        } catch { continue; }
        const state = loadState(entry, projectRoot);
        if (state && (!status || state.status === status)) {
          results.push(state);
        }
      }
    } catch { /* empty dir */ }
  }

  results.sort((a, b) => (b.last_active || "").localeCompare(a.last_active || ""));
  return results;
}

/**
 * Update allowed metadata fields (summary, tags, method) on a context.
 * See SPEC.md §7.7
 */
export function updateContext(
  contextId: string,
  updates: Partial<Pick<ContextState, "summary" | "tags" | "method">>,
  projectRoot?: string,
): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) return null;

  let changed = false;
  if (updates.summary !== undefined) { state.summary = updates.summary; changed = true; }
  if (updates.tags !== undefined) { state.tags = updates.tags; changed = true; }
  if (updates.method !== undefined) { state.method = updates.method; changed = true; }

  if (!changed) return state;

  state.last_active = nowIso();
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
    if (state.session_ids.includes(sessionId)) {
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
 * Add session_id to both index.json sessions map and state.json session_ids.
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

  if (!state.session_ids.includes(sessionId)) {
    state.session_ids.push(sessionId);
  }
  state.last_active = nowIso();

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
    plan_path?: string;
    plan_hash?: string;
    plan_signature?: string;
    plan_id?: string;
    plan_anchors?: string[];
    plan_consumed?: boolean;
    handoff_consumed?: boolean;
  },
): ContextState | null {
  const state = getContext(contextId, projectRoot);
  if (!state) return null;

  state.mode = mode;
  state.last_active = nowIso();

  if (opts) {
    if (opts.plan_path !== undefined) state.plan_path = opts.plan_path;
    if (opts.plan_hash !== undefined) state.plan_hash = opts.plan_hash;
    if (opts.plan_signature !== undefined) state.plan_signature = opts.plan_signature;
    if (opts.plan_id !== undefined) state.plan_id = opts.plan_id;
    if (opts.plan_anchors !== undefined) state.plan_anchors = opts.plan_anchors;
    if (opts.plan_consumed !== undefined) state.plan_consumed = opts.plan_consumed;
    if (opts.handoff_consumed !== undefined) state.handoff_consumed = opts.handoff_consumed;
  }

  // Clear plan/handoff fields when returning to idle
  if (mode === "idle") {
    state.plan_path = null;
    state.plan_hash = null;
    state.plan_signature = null;
    state.plan_id = null;
    state.plan_anchors = [];
    state.plan_consumed = false;
    state.handoff_consumed = false;
  }

  saveState(contextId, state, projectRoot);
  return state;
}

/**
 * Transition idle/has_plan/has_handoff → active, unless in plan mode.
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

  if (state.mode === "idle" || state.mode === "has_plan" || state.mode === "has_handoff") {
    const oldMode = state.mode;
    const opts: Record<string, any> = {};
    if (oldMode === "has_plan") opts.plan_consumed = true;
    else if (oldMode === "has_handoff") opts.handoff_consumed = true;
    updateMode(contextId, "active", projectRoot, opts);
    logInfo("context_store", `maybe_activate (${caller}): ${contextId} ${oldMode} -> active`);
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
  state.last_active = nowIso();
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
  } catch (e: any) {
    logError("context_store", `Failed to move context to archive: ${e}`);
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
  state.last_active = nowIso();
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
    "auto-created",
    projectRoot,
    ["auto-created"],
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
    updated_at: nowIso(),
    sessions: {},
    contexts: {},
  };

  if (fs.existsSync(archiveIndexPath)) {
    try {
      archiveIndex = JSON.parse(fs.readFileSync(archiveIndexPath, "utf-8"));
    } catch (e: any) {
      logWarn("context_store", `Failed to read archive index, recreating: ${e}`);
    }
  }

  archiveIndex.contexts[state.id] = toIndexEntry(state);
  archiveIndex.updated_at = nowIso();

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
  } catch (e: any) {
    logError("context_store", `Failed to restore context from archive: ${e}`);
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
    const archiveIndex = JSON.parse(fs.readFileSync(archiveIndexPath, "utf-8")) as IndexFile;
    if (archiveIndex.contexts[contextId]) {
      delete archiveIndex.contexts[contextId];
      archiveIndex.updated_at = nowIso();
      const content = JSON.stringify(archiveIndex, null, 2);
      const [success, error] = atomicWrite(archiveIndexPath, content);
      if (!success) {
        logWarn("context_store", `Failed to write archive index: ${error}`);
        return false;
      }
    }
    return true;
  } catch (e: any) {
    logWarn("context_store", `Failed to read archive index: ${e}`);
    return false;
  }
}
