#!/usr/bin/env bun
/**
 * Status line for Claude Code sessions.
 *
 * Renders context window usage and git status with ANSI colors.
 * Optionally persists context_window data to the session's state.json.
 *
 * Ported from status_line.py — context and git sections only.
 *
 * Usage: echo '{"session_id":"...","model":{"display_name":"Opus"},...}' | bun status_line.ts
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

import { CONTEXT_BASELINE_TOKENS } from "../lib-ts/base/hook-utils.js";
import { getContext, getContextBySessionId, loadState, saveState } from "../lib-ts/context/context-store.js";
import { findLatestPlan } from "../lib-ts/context/plan-manager.js";

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------
const _SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const OUTPUT_DIR = path.join(".", "_output");
const CACHE_DIR = path.join(OUTPUT_DIR, "cache");
const STATUSLINE_CACHE = path.join(CACHE_DIR, ".statusline-cache.json");

// ---------------------------------------------------------------------------
// NO_COLOR support (https://no-color.org)
// ---------------------------------------------------------------------------
const NO_COLOR = Boolean(process.env.NO_COLOR);

const RESET = NO_COLOR ? "" : "\u001B[0m";

// Structural
const SLATE_300 = NO_COLOR ? "" : "\u001B[38;2;203;213;225m";
const SLATE_400 = NO_COLOR ? "" : "\u001B[38;2;148;163;184m";
const SLATE_500 = NO_COLOR ? "" : "\u001B[38;2;100;116;139m";
const SLATE_600 = NO_COLOR ? "" : "\u001B[38;2;71;85;105m";

// Semantic
const EMERALD = NO_COLOR ? "" : "\u001B[38;2;74;222;128m";
const ROSE = NO_COLOR ? "" : "\u001B[38;2;251;113;133m";
const AMBER = NO_COLOR ? "" : "\u001B[38;2;251;191;36m";

// Context colors
const CTX_PRIMARY = NO_COLOR ? "" : "\u001B[38;2;129;140;248m";
const CTX_SECONDARY = NO_COLOR ? "" : "\u001B[38;2;165;180;252m";
const CTX_ACCENT = NO_COLOR ? "" : "\u001B[38;2;139;92;246m";
const CTX_BUCKET_EMPTY = NO_COLOR ? "" : "\u001B[38;2;75;82;95m";

// Git colors
const GIT_PRIMARY = NO_COLOR ? "" : "\u001B[38;2;56;189;248m";
const GIT_VALUE = NO_COLOR ? "" : "\u001B[38;2;186;230;253m";
const GIT_DIR = NO_COLOR ? "" : "\u001B[38;2;147;197;253m";
const GIT_CLEAN = NO_COLOR ? "" : "\u001B[38;2;125;211;252m";
const GIT_MODIFIED = NO_COLOR ? "" : "\u001B[38;2;96;165;250m";
const GIT_ADDED = NO_COLOR ? "" : "\u001B[38;2;59;130;246m";
const GIT_STASH = NO_COLOR ? "" : "\u001B[38;2;165;180;252m";
const GIT_AGE_FRESH = NO_COLOR ? "" : "\u001B[38;2;125;211;252m";
const GIT_AGE_RECENT = NO_COLOR ? "" : "\u001B[38;2;96;165;250m";
const GIT_AGE_STALE = NO_COLOR ? "" : "\u001B[38;2;59;130;246m";
const GIT_AGE_OLD = NO_COLOR ? "" : "\u001B[38;2;99;102;241m";

// ---------------------------------------------------------------------------
// Display modes
// ---------------------------------------------------------------------------

function getTerminalWidth(): number {
  const colsEnv = process.env.COLUMNS;
  if (colsEnv) {
    const cols = Number.parseInt(colsEnv, 10);
    if (cols > 0) return cols;
  }

  try {
    if (process.stdout.columns && process.stdout.columns > 0) {
      return process.stdout.columns;
    }
  } catch { /* ignore */ }

  return 80;
}

function getDisplayMode(width: number): string {
  if (width < 35) return "nano";
  if (width < 55) return "micro";
  if (width < 80) return "mini";
  return "normal";
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getBucketColor(pos: number, maxPos: number): string {
  if (NO_COLOR) return "";
  const pct = Math.floor((pos * 100) / maxPos);

  let b: number; let g: number; let r: number;

  if (pct <= 33) {
    r = 74 + Math.floor(((250 - 74) * pct) / 33);
    g = 222 + Math.floor(((204 - 222) * pct) / 33);
    b = 128 + Math.floor(((21 - 128) * pct) / 33);
  } else if (pct <= 66) {
    const t = pct - 33;
    r = 250 + Math.floor(((251 - 250) * t) / 33);
    g = 204 + Math.floor(((146 - 204) * t) / 33);
    b = 21 + Math.floor(((60 - 21) * t) / 33);
  } else {
    const t = pct - 66;
    r = 251 + Math.floor(((239 - 251) * t) / 34);
    g = 146 + Math.floor(((68 - 146) * t) / 34);
    b = 60 + Math.floor(((68 - 60) * t) / 34);
  }

  return `\u001B[38;2;${r};${g};${b}m`;
}

// ---------------------------------------------------------------------------
// Context bar rendering
// ---------------------------------------------------------------------------

function renderContextBar(width: number, pct: number): [string, string] {
  pct = Math.max(0, Math.min(100, pct));
  const filled = Math.floor((pct * width) / 100);
  let lastColor = EMERALD;
  const parts: string[] = [];

  for (let i = 1; i <= width; i++) {
    if (i <= filled) {
      const color = getBucketColor(i, width);
      lastColor = color;
      parts.push(`${color}\u26C1${RESET}`);
    } else {
      parts.push(`${CTX_BUCKET_EMPTY}\u26C1${RESET}`);
    }

    if (width > 8) {
      parts.push(" ");
    }
  }

  return [parts.join("").trimEnd(), lastColor];
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const SEPARATOR = `${SLATE_600}${"─".repeat(72)}${RESET}`;

// ---------------------------------------------------------------------------
// Context section
// ---------------------------------------------------------------------------

function shortenModel(name: string): string {
  const replacements: [string, string][] = [
    ["claude-opus-4-6", "opus-4.6"],
    ["claude-opus-4-5", "opus-4.5"],
    ["claude-sonnet-4", "sonnet-4"],
    ["claude-3-5-sonnet", "sonnet-3.5"],
    ["claude-3-5-haiku", "haiku-3.5"],
    ["claude-", ""],
  ];
  let result = name;
  for (const [old, replacement] of replacements) {
    result = result.replace(old, replacement);
  }

  return result;
}

function renderContext(
  mode: string,
  contextPct: number,
  contextK: number,
  maxK: number,
  timeDisplay: string,
  modelName: string,
): void {
  let pctColor: string;
  if (contextPct <= 33) pctColor = EMERALD;
  else if (contextPct <= 66) pctColor = AMBER;
  else pctColor = ROSE;

  const shortModel = shortenModel(modelName);

  switch (mode) {
  case "micro": {
    const [bar] = renderContextBar(6, contextPct);
    console.log(
      `${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
      `${SLATE_600}\u2502${RESET} ` +
      `${bar} ${pctColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k)${RESET} ` +
      `${CTX_ACCENT}\u23F1${RESET} ${SLATE_300}${timeDisplay}${RESET}`,
    );
  
  break;
  }

  case "mini": {
    const [bar] = renderContextBar(8, contextPct);
    console.log(
      `${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
      `${SLATE_600}\u2502${RESET} ` +
      `${CTX_SECONDARY}CTX:${RESET} ${bar} ` +
      `${pctColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k/${maxK}k)${RESET} ` +
      `${CTX_ACCENT}\u23F1${RESET} ${SLATE_300}${timeDisplay}${RESET}`,
    );
  
  break;
  }

  case "nano": {
    const [bar] = renderContextBar(5, contextPct);
    console.log(
      `${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
      `${bar} ${pctColor}${contextPct}%${RESET} ` +
      `${CTX_ACCENT}\u23F1${RESET} ${SLATE_300}${timeDisplay}${RESET}`,
    );
  
  break;
  }

  default: {
    const [bar, lastColor] = renderContextBar(16, contextPct);
    console.log(
      `${CTX_PRIMARY}\u25C9${RESET} ${CTX_SECONDARY}Model:${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
      `${SLATE_600}\u2502${RESET} ` +
      `${CTX_SECONDARY}Context:${RESET} ${bar} ` +
      `${lastColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k/${maxK}k)${RESET} ` +
      `${SLATE_600}\u2502${RESET} ` +
      `${CTX_ACCENT}\u23F1${RESET} ${SLATE_300}${timeDisplay}${RESET}`,
    );
  }
  }

  console.log(SEPARATOR);
}

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

interface GitStatus {
  age_color: string;
  age_display: string;
  ahead: number;
  behind: number;
  branch: string;
  modified: number;
  staged: number;
  stash_count: number;
  untracked: number;
}

function runGit(args: string[], cwd: string, timeout = 2000): null | string {
  try {
    const result = execFileSync("git", args, {
      cwd,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    return result.trim();
  } catch {
    return null;
  }
}

function getGitStatus(cwd: string): GitStatus | null {
  if (runGit(["rev-parse", "--git-dir"], cwd) === null) {
    return null;
  }

  const status: GitStatus = {
    branch: "detached",
    modified: 0,
    staged: 0,
    untracked: 0,
    stash_count: 0,
    ahead: 0,
    behind: 0,
    age_display: "",
    age_color: GIT_AGE_FRESH,
  };

  // Branch
  const branch = runGit(["branch", "--show-current"], cwd);
  if (branch) status.branch = branch;

  // Modified files
  const diff = runGit(["diff", "--name-only"], cwd);
  if (diff) status.modified = diff.split("\n").filter(Boolean).length;

  // Staged files
  const staged = runGit(["diff", "--cached", "--name-only"], cwd);
  if (staged) status.staged = staged.split("\n").filter(Boolean).length;

  // Untracked files
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], cwd);
  if (untracked) status.untracked = untracked.split("\n").filter(Boolean).length;

  // Stash count
  const stash = runGit(["stash", "list"], cwd);
  if (stash) status.stash_count = stash.split("\n").filter(Boolean).length;

  // Ahead/behind
  const ab = runGit(["rev-list", "--left-right", "--count", "HEAD...@{u}"], cwd);
  if (ab) {
    const parts = ab.split(/\s+/);
    if (parts.length >= 2) {
      status.ahead = Number.parseInt(parts[0]!, 10) || 0;
      status.behind = Number.parseInt(parts[1]!, 10) || 0;
    }
  }

  // Commit age
  const log = runGit(["log", "-1", "--format=%ct"], cwd);
  if (log) {
    try {
      const lastEpoch = Number.parseInt(log, 10);
      const nowEpoch = Math.floor(Date.now() / 1000);
      const ageSec = nowEpoch - lastEpoch;
      const ageMin = Math.floor(ageSec / 60);
      const ageHrs = Math.floor(ageSec / 3600);
      const ageDays = Math.floor(ageSec / 86_400);

      if (ageMin < 1) {
        status.age_display = "now";
        status.age_color = GIT_AGE_FRESH;
      } else if (ageHrs < 1) {
        status.age_display = `${ageMin}m`;
        status.age_color = GIT_AGE_FRESH;
      } else if (ageHrs < 24) {
        status.age_display = `${ageHrs}h`;
        status.age_color = GIT_AGE_RECENT;
      } else if (ageDays < 7) {
        status.age_display = `${ageDays}d`;
        status.age_color = GIT_AGE_STALE;
      } else {
        status.age_display = `${ageDays}d`;
        status.age_color = GIT_AGE_OLD;
      }
    } catch { /* ignore */ }
  }

  return status;
}

function renderGit(mode: string, git: GitStatus, dirName: string): void {
  const totalChanged = git.modified + git.staged;
  const statusIcon = (totalChanged > 0 || git.untracked > 0) ? "*" : "\u2713";

  switch (mode) {
  case "micro": {
    let line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET} ${GIT_VALUE}${git.branch}${RESET}`;
    if (git.age_display) {
      line += ` ${git.age_color}${git.age_display}${RESET}`;
    }

    line += " ";
    line += statusIcon === "\u2713" ? `${GIT_CLEAN}${statusIcon}${RESET}` : `${GIT_MODIFIED}${statusIcon}${totalChanged}${RESET}`;
    console.log(line);
  
  break;
  }

  case "mini": {
    let line =
      `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET} ` +
      `${SLATE_600}\u2502${RESET} ${GIT_VALUE}${git.branch}${RESET}`;
    if (git.age_display) {
      line += ` ${SLATE_600}\u2502${RESET} ${git.age_color}${git.age_display}${RESET}`;
    }

    line += ` ${SLATE_600}\u2502${RESET} `;
    if (statusIcon === "\u2713") {
      line += `${GIT_CLEAN}${statusIcon}${RESET}`;
    } else {
      line += `${GIT_MODIFIED}${statusIcon}${totalChanged}${RESET}`;
      if (git.untracked > 0) {
        line += ` ${GIT_ADDED}+${git.untracked}${RESET}`;
      }
    }

    console.log(line);
  
  break;
  }

  case "nano": {
    let line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET} ${GIT_VALUE}${git.branch}${RESET} `;
    line += statusIcon === "\u2713" ? `${GIT_CLEAN}\u2713${RESET}` : `${GIT_MODIFIED}*${totalChanged}${RESET}`;
    console.log(line);
  
  break;
  }

  default: {
    let line =
      `${GIT_PRIMARY}\u25C8${RESET} ${GIT_PRIMARY}PWD:${RESET} ${GIT_DIR}${dirName}${RESET} ` +
      `${SLATE_600}\u2502${RESET} ` +
      `${GIT_PRIMARY}Branch:${RESET} ${GIT_VALUE}${git.branch}${RESET}`;
    if (git.age_display) {
      line += ` ${SLATE_600}\u2502${RESET} ${GIT_PRIMARY}Age:${RESET} ${git.age_color}${git.age_display}${RESET}`;
    }

    if (git.stash_count > 0) {
      line += ` ${SLATE_600}\u2502${RESET} ${GIT_PRIMARY}Stash:${RESET} ${GIT_STASH}${git.stash_count}${RESET}`;
    }

    if (totalChanged > 0 || git.untracked > 0) {
      line += ` ${SLATE_600}\u2502${RESET} `;
      if (totalChanged > 0) {
        line += `${GIT_PRIMARY}Mod:${RESET} ${GIT_MODIFIED}${totalChanged}${RESET}`;
      }

      if (git.untracked > 0) {
        if (totalChanged > 0) line += " ";
        line += `${GIT_PRIMARY}New:${RESET} ${GIT_ADDED}${git.untracked}${RESET}`;
      }
    } else {
      line += ` ${SLATE_600}\u2502${RESET} ${GIT_CLEAN}\u2713 clean${RESET}`;
    }

    if (git.ahead > 0 || git.behind > 0) {
      line += ` ${SLATE_600}\u2502${RESET} ${GIT_PRIMARY}Sync:${RESET} `;
      if (git.ahead > 0) {
        line += `${GIT_CLEAN}\u2191${git.ahead}${RESET}`;
      }

      if (git.behind > 0) {
        line += `${GIT_STASH}\u2193${git.behind}${RESET}`;
      }
    }

    console.log(line);
  }
  }
}

// ---------------------------------------------------------------------------
// Context manager line (line 3)
// ---------------------------------------------------------------------------

function findActivePlanFile(): null | string {
  try {
    const plansDir = path.join(homedir(), ".claude", "plans");
    if (!fs.existsSync(plansDir)) return null;
    const planFiles = fs.readdirSync(plansDir)
      .filter(f => f.endsWith(".md"))
      .map(f => {
        const fullPath = path.join(plansDir, f);
        return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return planFiles.length > 0 ? planFiles[0]!.path : null;
  } catch {
    return null;
  }
}

function renderContextManager(
  mode: string,
  contextId: string,
  contextState: null | Record<string, any>,
): void {
  // Strip YYMMDD-HHMM- timestamp prefix from context ID for display
  let displayId = contextId.replace(/^\d{6}-\d{4}-/, "");
  if (!displayId) displayId = contextId;

  // Truncate display_id per mode
  const maxIdLen: Record<string, number> = { nano: 14, micro: 18, mini: 22, normal: 30 };
  const maxLen = maxIdLen[mode] ?? 30;
  let truncatedId = displayId.slice(0, maxLen);
  if (displayId.length > maxLen) truncatedId += "\u2026";

  // Read state fields
  const stateMode = contextState?.mode ?? "idle";
  const statePlanPath = contextState?.plan_path ?? null;

  // Detect plan mode heuristic
  const activePlanFile = findActivePlanFile();
  const isPlanning = stateMode === "idle" && activePlanFile !== null;

  // Build mode badge
  let modeBadge = "";
  if (isPlanning) {
    const label = mode === "nano" ? "Plan" : "Planning";
    modeBadge = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Mode:${RESET} ${AMBER}${label}${RESET}`;
  } else if (stateMode === "has_plan") {
    const label = mode === "nano" ? "Ready" : "Plan Ready";
    modeBadge = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Mode:${RESET} ${EMERALD}${label}${RESET}`;
  } else if (stateMode === "active") {
    const label = "Active";
    modeBadge = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Mode:${RESET} ${CTX_ACCENT}${label}${RESET}`;
  }

  // Resolve plan file path for display
  let planFilePath: null | string = null;
  if (isPlanning) {
    planFilePath = activePlanFile;
  } else if (statePlanPath) {
    planFilePath = statePlanPath;
  } else if (stateMode === "has_plan" || stateMode === "active") {
    try {
      planFilePath = findLatestPlan(contextId) ?? null;
    } catch { /* ignore */ }
  }

  // Build plan name (mini/normal only)
  let planPart = "";
  if ((mode === "mini" || mode === "normal") && planFilePath) {
    const planStem = path.basename(planFilePath, path.extname(planFilePath))
      .replace(/^\d{4}-\d{2}-\d{2}-(\d{4}-)?/, "");
    const maxPlanLen = mode === "mini" ? 20 : 30;
    let truncatedPlan = planStem.slice(0, maxPlanLen);
    if (planStem.length > maxPlanLen) truncatedPlan += "\u2026";
    planPart = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Plan:${RESET} ${SLATE_300}${truncatedPlan}${RESET}`;
  }

  switch (mode) {
  case "micro": {
    console.log(`${CTX_ACCENT}\u25C6${RESET} ${SLATE_400}${truncatedId}${RESET}${modeBadge}`);
  
  break;
  }

  case "mini": {
    console.log(
      `${CTX_ACCENT}\u25C6${RESET} ${SLATE_400}${truncatedId}${RESET}` +
      `${modeBadge}${planPart}`,
    );
  
  break;
  }

  case "nano": {
    console.log(`${CTX_ACCENT}\u25C6${RESET} ${SLATE_400}${truncatedId}${RESET}${modeBadge}`);
  
  break;
  }

  default: {
    console.log(
      `${CTX_ACCENT}\u25C6${RESET} ${CTX_SECONDARY}Context:${RESET} ${SLATE_300}${truncatedId}${RESET}` +
      `${modeBadge}${planPart}`,
    );
  }
  }
}

function renderNoContext(mode: string): void {
  const warn = `${ROSE}\u26A0 ${RESET}`;
  if (mode === "normal") {
    console.log(`${warn} ${ROSE}NO CONTEXT${RESET} ${SLATE_500}\u2014 type ^ for context manager${RESET}`);
  } else {
    console.log(`${warn} ${ROSE}NO CONTEXT${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Context persistence
// ---------------------------------------------------------------------------

interface StatuslineCache {
  sessions?: Record<string, { context_id: null | string }>;
}

function loadCache(): StatuslineCache {
  try {
    if (fs.existsSync(STATUSLINE_CACHE)) {
      return JSON.parse(fs.readFileSync(STATUSLINE_CACHE, "utf8"));
    }
  } catch { /* ignore */ }

  return {};
}

function saveCache(cache: StatuslineCache): void {
  try {
    fs.mkdirSync(path.dirname(STATUSLINE_CACHE), { recursive: true });
    fs.writeFileSync(STATUSLINE_CACHE, JSON.stringify(cache, null, 2), "utf-8");
  } catch { /* ignore */ }
}

function resolveContextId(sessionId: string): null | string {
  if (!sessionId || sessionId === "unknown") return null;

  // Check cache first
  const cache = loadCache();
  const cachedEntry = cache.sessions?.[sessionId];
  if (cachedEntry && cachedEntry.context_id !== undefined) {
    return cachedEntry.context_id;
  }

  // Cache miss — look up via context manager
  try {
    const context = getContextBySessionId(sessionId);
    if (context) {
      if (!cache.sessions) cache.sessions = {};
      cache.sessions[sessionId] = { context_id: (context as any).id };
      saveCache(cache);
      return (context as any).id;
    }
  } catch { /* ignore */ }

  // Don't cache negative results — context may be bound by a later hook
  return null;
}

function loadContextState(contextId: string): null | Record<string, any> {
  try {
    return loadState(contextId) as null | Record<string, any>;
  } catch {
    return null;
  }
}

function writeContextWindow(contextId: string, contextWindowData: Record<string, any>): void {
  try {
    const state = getContext(contextId) as null | Record<string, any>;
    if (state) {
      if (!state.last_session) state.last_session = {};
      state.last_session.context_remaining_pct = contextWindowData.remaining_percentage;
      saveState(contextId, state as any);
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Read JSON from stdin
  let inputData: Record<string, any>;
  try {
    inputData = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    inputData = {};
  }

  // Terminal width and mode
  const termWidth = getTerminalWidth();
  const mode = getDisplayMode(termWidth);

  // Extract input fields
  const sessionId = inputData.session_id ?? "";
  const modelName = inputData.model?.display_name ?? "unknown";
  const cost = inputData.cost ?? {};
  const durationMs: number = cost.total_duration_ms ?? 0;
  const workspace = inputData.workspace ?? {};
  const currentDir: string = workspace.project_dir ?? process.cwd();
  const dirName = path.basename(currentDir);

  // Context window data
  const ctxWin = inputData.context_window ?? {};
  const usage = ctxWin.current_usage ?? {};
  const cacheRead: number = usage.cache_read_input_tokens ?? 0;
  const inputTokens: number = usage.input_tokens ?? 0;
  const cacheCreation: number = usage.cache_creation_input_tokens ?? 0;
  const outputTokens: number = usage.output_tokens ?? 0;
  const contextMax: number = ctxWin.context_window_size ?? 200_000;

  // Calculate context percentage
  const usedPct = ctxWin.used_percentage;
  let contextPct: number;
  const totalInput = cacheRead + inputTokens + cacheCreation;
  const contextUsed = totalInput + outputTokens + CONTEXT_BASELINE_TOKENS;

  if (usedPct !== undefined && usedPct !== null) {
    contextPct = Math.floor(usedPct);
  } else {
    contextPct = contextMax > 0 ? Math.floor((contextUsed * 100) / contextMax) : 0;
  }

  const contextK = Math.floor(contextUsed / 1000);
  const maxK = Math.floor(contextMax / 1000);

  // Format duration
  const durationSec = Math.floor(durationMs / 1000);
  let timeDisplay: string;
  if (durationSec >= 3600) {
    timeDisplay = `${Math.floor(durationSec / 3600)}h${Math.floor((durationSec % 3600) / 60)}m`;
  } else if (durationSec >= 60) {
    timeDisplay = `${Math.floor(durationSec / 60)}m${durationSec % 60}s`;
  } else {
    timeDisplay = `${durationSec}s`;
  }

  // Resolve context ID for display and persistence
  const contextId = resolveContextId(sessionId);

  // Render context section
  renderContext(mode, contextPct, contextK, maxK, timeDisplay, modelName);

  // Render git section
  const git = getGitStatus(currentDir);
  if (git) {
    renderGit(mode, git, dirName);
  }

  // Render context manager line (line 3) with separator
  console.log(SEPARATOR);
  if (contextId) {
    const contextState = loadContextState(contextId);
    renderContextManager(mode, contextId, contextState);
  } else {
    renderNoContext(mode);
  }

  // Persist context_window to state.json
  if (contextId) {
    writeContextWindow(contextId, {
      used_percentage: contextPct,
      remaining_percentage: 100 - contextPct,
      context_window_size: contextMax,
      tokens_used: contextUsed,
      total_input_tokens: totalInput,
      total_output_tokens: outputTokens,
      model: modelName,
      last_updated: new Date().toISOString().split(".")[0],
    });
  }
}

main();
