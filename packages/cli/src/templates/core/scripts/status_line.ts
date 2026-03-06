#!/usr/bin/env bun
/**
 * Status line for Claude Code sessions.
 *
 * Renders context window usage and git status with ANSI colors.
 * Optionally persists context_window data to the session's state.json.
 *
 * Context and git sections only.
 *
 * Usage: echo '{"session_id":"...","model":{"display_name":"Opus"},...}' | bun status_line.ts
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { ContextState } from "../lib-ts/types.js";

// PAI infrastructure imports — graceful fallback when libs aren't available
let CONTEXT_BASELINE_TOKENS = 22_600;
let getContextBySessionId: (id: string, root?: string) => ContextState | null =
	() => null;
let getContext: (id: string, root?: string) => ContextState | null = () => null;
let loadState: (id: string, root?: string) => ContextState | null = () => null;
let saveState: (id: string, state: ContextState) => void = () => {};
let findLatestPlan: (contextId: string) => string | null = () => null;

try {
	const hookUtils = await import("../lib-ts/hooks/hook-utils.js");
	CONTEXT_BASELINE_TOKENS = hookUtils.CONTEXT_BASELINE_TOKENS;
} catch {
	/* PAI hook-utils not available */
}

try {
	const ctxStore = await import("../lib-ts/context/context-store.js");
	getContextBySessionId = ctxStore.getContextBySessionId;
	getContext = ctxStore.getContext;
	loadState = ctxStore.loadState;
	saveState = ctxStore.saveState;
} catch {
	/* PAI context-store not available */
}

try {
	const planMgr = await import("../lib-ts/context/plan-manager.js");
	findLatestPlan = planMgr.findLatestPlan;
} catch {
	/* PAI plan-manager not available */
}

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
// Resolve project root from script location (.aiwcli/_core/scripts/) so paths
// work even when cwd has drifted via `cd` in a Bash tool call.
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "_output");
const CACHE_DIR = path.join(OUTPUT_DIR, "cache");
const STATUSLINE_CACHE = path.join(CACHE_DIR, ".statusline-cache.json");

// ---------------------------------------------------------------------------
// Color level detection (truecolor → 256-color → basic 16 → none)
// ---------------------------------------------------------------------------
type ColorLevel = 0 | 1 | 2 | 3;

function detectColorLevel(): ColorLevel {
	if (process.env.NO_COLOR) return 0;
	const fc = process.env.FORCE_COLOR;
	if (fc !== undefined) return Math.min(3, Math.max(0, parseInt(fc, 10) || 0)) as ColorLevel;
	const ct = process.env.COLORTERM ?? "";
	if (ct === "truecolor" || ct === "24bit") return 3;
	if ((process.env.TERM ?? "").includes("256color")) return 2;
	return 1;
}

const COLOR_LEVEL = detectColorLevel();

function fg(r: number, g: number, b: number, x256: number, b16: number): string {
	if (COLOR_LEVEL === 0) return "";
	if (COLOR_LEVEL === 3) return `\u001B[38;2;${r};${g};${b}m`;
	if (COLOR_LEVEL === 2) return `\u001B[38;5;${x256}m`;
	return `\u001B[${b16}m`;
}

const RESET = COLOR_LEVEL === 0 ? "" : "\u001B[0m";

// Structural
const SLATE_300 = fg(203, 213, 225, 188, 37);
const SLATE_400 = fg(148, 163, 184, 146, 37);
const SLATE_500 = fg(100, 116, 139, 103, 90);
const SLATE_600 = fg(71, 85, 105, 240, 90);

// Semantic
const EMERALD = fg(74, 222, 128, 79, 92);
const ROSE = fg(251, 113, 133, 211, 91);
const AMBER = fg(251, 191, 36, 221, 93);

// Context colors
const CTX_PRIMARY = fg(129, 140, 248, 147, 94);
const CTX_SECONDARY = fg(165, 180, 252, 153, 94);
const CTX_ACCENT = fg(139, 92, 246, 141, 35);
const CTX_BUCKET_EMPTY = fg(75, 82, 95, 239, 90);

// Git colors
const GIT_PRIMARY = fg(56, 189, 248, 81, 96);
const GIT_VALUE = fg(186, 230, 253, 195, 96);
const GIT_DIR = fg(147, 197, 253, 153, 94);
const GIT_CLEAN = fg(125, 211, 252, 117, 96);
const GIT_MODIFIED = fg(96, 165, 250, 111, 94);
const GIT_ADDED = fg(59, 130, 246, 75, 34);
const GIT_STASH = fg(165, 180, 252, 153, 94);
const GIT_AGE_FRESH = fg(125, 211, 252, 117, 96);
const GIT_AGE_RECENT = fg(96, 165, 250, 111, 94);
const GIT_AGE_STALE = fg(59, 130, 246, 75, 34);
const GIT_AGE_OLD = fg(99, 102, 241, 105, 35);

// ---------------------------------------------------------------------------
// Display modes
// ---------------------------------------------------------------------------

function getTerminalWidth(): number {
	const colsEnv = process.env.COLUMNS;
	if (colsEnv) {
		const cols = parseInt(colsEnv, 10);
		if (cols > 0) return cols;
	}
	try {
		if (process.stdout.columns && process.stdout.columns > 0) {
			return process.stdout.columns;
		}
	} catch {
		/* ignore */
	}
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
	if (COLOR_LEVEL === 0) return "";
	const pct = Math.floor((pos * 100) / maxPos);

	let b: number;
	let g: number;
	let r: number;

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

	if (COLOR_LEVEL === 3) return `\u001B[38;2;${r};${g};${b}m`;
	if (COLOR_LEVEL === 2) {
		const ri = Math.round(r / 51);
		const gi = Math.round(g / 51);
		const bi = Math.round(b / 51);
		return `\u001B[38;5;${16 + 36 * ri + 6 * gi + bi}m`;
	}
	// Level 1: three-band semantic mapping
	if (pct <= 33) return `\u001B[92m`; // bright green
	if (pct <= 66) return `\u001B[93m`; // bright yellow
	return `\u001B[91m`; // bright red
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
// Display width helper — accounts for wide Unicode and ANSI escapes
// ---------------------------------------------------------------------------

const ANSI_RE = new RegExp(`${String.raw`\u001B`}\\[[0-9;]*m`, "g");

function isWideChar(cp: number): boolean {
	return (
		cp === 0x26_c1 || // ⛁ draughts man
		cp === 0x23_f1 || // ⏱ stopwatch
		(cp >= 0x26_00 && cp <= 0x26_ff) || // misc symbols
		(cp >= 0x27_00 && cp <= 0x27_bf) || // dingbats
		(cp >= 0x1_f3_00 && cp <= 0x1_fa_ff) || // emoji
		(cp >= 0xfe_00 && cp <= 0xfe_0f) || // variation selectors
		(cp >= 0x4e_00 && cp <= 0x9f_ff) || // CJK
		(cp >= 0x30_00 && cp <= 0x30_3f) // CJK symbols
	);
}

function measureWidth(str: string): number {
	const stripped = str.replace(ANSI_RE, "");
	let w = 0;
	for (const ch of stripped) {
		w += isWideChar(ch.codePointAt(0) ?? 0) ? 2 : 1;
	}
	return w;
}

function truncateToWidth(str: string, maxWidth: number): string {
	// Walk through string preserving ANSI codes (zero-width) and measuring visible chars
	let w = 0;
	let lastAnsiEnd = 0;
	const segments: string[] = [];
	const raw = str;

	// Split into text and ANSI segments, tracking width
	let truncated = false;
	ANSI_RE.lastIndex = 0;
	let match = ANSI_RE.exec(raw);
	while (match !== null) {
		// Text before this ANSI code
		const textBefore = raw.slice(lastAnsiEnd, match.index);
		for (const ch of textBefore) {
			const cw = isWideChar(ch.codePointAt(0) ?? 0) ? 2 : 1;
			if (w + cw > maxWidth) {
				truncated = true;
				break;
			}
			w += cw;
			segments.push(ch);
		}
		if (truncated) break;
		segments.push(match[0]); // ANSI code (zero width)
		lastAnsiEnd = match.index + match[0].length;
		match = ANSI_RE.exec(raw);
	}
	if (!truncated) {
		// Remaining text after last ANSI
		const remaining = raw.slice(lastAnsiEnd);
		for (const ch of remaining) {
			const cw = isWideChar(ch.codePointAt(0) ?? 0) ? 2 : 1;
			if (w + cw > maxWidth) break;
			w += cw;
			segments.push(ch);
		}
	}
	return segments.join("") + RESET;
}

// ---------------------------------------------------------------------------
// Separator (dynamic width)
// ---------------------------------------------------------------------------

function makeSeparator(width: number): string {
	return `${SLATE_600}${"─".repeat(Math.max(1, width))}${RESET}`;
}

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
	termWidth: number,
	contextPct: number,
	contextK: number,
	maxK: number,
	modelName: string,
): string {
	let pctColor: string;
	if (contextPct <= 33) pctColor = EMERALD;
	else if (contextPct <= 66) pctColor = AMBER;
	else pctColor = ROSE;

	const shortModel = shortenModel(modelName);
	let line: string;

	switch (mode) {
		case "micro": {
			const [bar] = renderContextBar(6, contextPct);
			line =
				`${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
				`${SLATE_600}\u2502${RESET} ` +
				`${bar} ${pctColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k/${maxK}k)${RESET}`;

			break;
		}
		case "mini": {
			const [bar] = renderContextBar(8, contextPct);
			line =
				`${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
				`${SLATE_600}\u2502${RESET} ` +
				`${CTX_SECONDARY}CTX:${RESET} ${bar} ` +
				`${pctColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k/${maxK}k)${RESET}`;

			break;
		}
		case "nano": {
			const [bar] = renderContextBar(5, contextPct);
			line =
				`${CTX_PRIMARY}\u25C9${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
				`${bar} ${pctColor}${contextPct}%${RESET}`;

			break;
		}
		default: {
			// Calculate how many bar buckets fit. Each bucket = ⛁ (2 cols) + space (1 col) = 3 cols.
			// Fixed parts: "◉ Model: {model} │ Context:  {pct}% ({Xk}/{Yk})"
			const fixedWidth =
				2 +
				8 +
				shortModel.length +
				3 +
				10 +
				1 +
				`${contextPct}`.length +
				2 +
				`${contextK}k/${maxK}k`.length +
				2;
			const availableForBar = termWidth - fixedWidth;
			const buckets = Math.max(
				4,
				Math.min(24, Math.floor(availableForBar / 3)),
			);

			const [bar, lastColor] = renderContextBar(buckets, contextPct);
			line =
				`${CTX_PRIMARY}\u25C9${RESET} ${CTX_SECONDARY}Model:${RESET} ${CTX_ACCENT}${shortModel}${RESET} ` +
				`${SLATE_600}\u2502${RESET} ` +
				`${CTX_SECONDARY}Context:${RESET} ${bar} ` +
				`${lastColor}${contextPct}%${RESET} ${SLATE_500}(${contextK}k/${maxK}k)${RESET}`;
		}
	}

	return truncateToWidth(line, termWidth);
}

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

interface GitStatus {
	branch: string;
	modified: number;
	staged: number;
	untracked: number;
	stash_count: number;
	ahead: number;
	behind: number;
	age_display: string;
	age_color: string;
}

function runGit(args: string[], cwd: string, timeout = 2000): string | null {
	try {
		const result = execFileSync("git", args, {
			cwd,
			timeout,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		return result.trim();
	} catch {
		return null;
	}
}

function getGitStatus(cwd: string): GitStatus | null {
	// One call replaces 6: branch, modified, staged, untracked, ahead/behind, and repo check.
	// porcelain=v2 -b gives structured header lines + per-file XY status codes.
	const porcelain = runGit(["status", "--porcelain=v2", "-b"], cwd);
	if (porcelain === null) return null;

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

	for (const line of porcelain.split(/\r?\n/)) {
		if (line.startsWith("# branch.head ")) {
			const b = line.slice(14).trim();
			status.branch = b === "(detached)" ? "detached" : b;
		} else if (line.startsWith("# branch.ab ")) {
			// Format: "+<ahead> -<behind>"
			const m = line.match(/\+(\d+) -(\d+)/);
			if (m) {
				status.ahead = parseInt(m[1] ?? "0", 10);
				status.behind = parseInt(m[2] ?? "0", 10);
			}
		} else if (line.startsWith("1 ") || line.startsWith("2 ")) {
			// Changed tracked file: "1 XY ..." where X=staged Y=unstaged, '.'=unchanged
			const x = line[2] ?? ".";
			const y = line[3] ?? ".";
			if (x !== ".") status.staged++;
			if (y !== ".") status.modified++;
		} else if (line.startsWith("? ")) {
			status.untracked++;
		}
	}

	// Stash count (no equivalent in status output)
	const stash = runGit(["stash", "list"], cwd);
	if (stash) status.stash_count = stash.split(/\r?\n/).filter(Boolean).length;

	// Commit age
	const log = runGit(["log", "-1", "--format=%ct"], cwd);
	if (log) {
		try {
			const lastEpoch = parseInt(log, 10);
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
		} catch {
			/* ignore */
		}
	}

	return status;
}

function renderGit(
	mode: string,
	termWidth: number,
	git: GitStatus | null,
	dirName: string,
): string {
	const totalChanged = git ? git.modified + git.staged : 0;
	const statusIcon =
		git && (totalChanged > 0 || git.untracked > 0) ? "*" : "\u2713";

	let line: string;

	switch (mode) {
		case "micro": {
			line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET}`;
			if (git) {
				line += ` ${GIT_VALUE}${git.branch}${RESET}`;
				if (git.age_display) {
					line += ` ${git.age_color}${git.age_display}${RESET}`;
				}
				line += " ";
				if (statusIcon === "\u2713") {
					line += `${GIT_CLEAN}${statusIcon}${RESET}`;
				} else {
					line += `${GIT_MODIFIED}${statusIcon}${totalChanged}${RESET}`;
				}
			}
			break;
		}
		case "mini": {
			line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET}`;
			if (git) {
				line += ` ${SLATE_600}\u2502${RESET} ${GIT_VALUE}${git.branch}${RESET}`;
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
			}
			break;
		}
		case "nano": {
			line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_DIR}${dirName}${RESET}`;
			if (git) {
				line += ` ${GIT_VALUE}${git.branch}${RESET} `;
				if (statusIcon === "\u2713") {
					line += `${GIT_CLEAN}\u2713${RESET}`;
				} else {
					line += `${GIT_MODIFIED}*${totalChanged}${RESET}`;
				}
			}
			break;
		}
		default: {
			line = `${GIT_PRIMARY}\u25C8${RESET} ${GIT_PRIMARY}PWD:${RESET} ${GIT_DIR}${dirName}${RESET}`;
			if (git) {
				line +=
					` ${SLATE_600}\u2502${RESET} ` +
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
			}
		}
	}

	return truncateToWidth(line, termWidth);
}

// ---------------------------------------------------------------------------
// Context manager line (line 3)
// ---------------------------------------------------------------------------

function findActivePlanFile(): string | null {
	try {
		const plansDir = path.join(homedir(), ".claude", "plans");
		if (!fs.existsSync(plansDir)) return null;
		const planFiles = fs
			.readdirSync(plansDir)
			.filter((f) => f.endsWith(".md"))
			.map((f) => {
				const fullPath = path.join(plansDir, f);
				return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
			})
			.sort((a, b) => b.mtime - a.mtime);
		return planFiles.length > 0 ? (planFiles[0]?.path ?? null) : null;
	} catch {
		return null;
	}
}

function renderContextManager(
	mode: string,
	contextId: string,
	contextState: ContextState | null,
): string {
	// Strip YYMMDD-HHMM- timestamp prefix from context ID for display
	let displayId = contextId.replace(/^\d{6}-\d{4}-/, "");
	if (!displayId) displayId = contextId;

	// Truncate display_id per mode
	const maxIdLen: Record<string, number> = {
		nano: 14,
		micro: 18,
		mini: 22,
		normal: 30,
	};
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
	} else if (stateMode === "has_staged_work") {
		const label = mode === "nano" ? "Ready" : "Plan Ready";
		modeBadge = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Mode:${RESET} ${EMERALD}${label}${RESET}`;
	} else if (stateMode === "active") {
		const label = "Active";
		modeBadge = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Mode:${RESET} ${CTX_ACCENT}${label}${RESET}`;
	}

	// Resolve plan file path for display
	let planFilePath: string | null = null;
	if (isPlanning) {
		planFilePath = activePlanFile;
	} else if (statePlanPath) {
		planFilePath = statePlanPath;
	} else if (stateMode === "has_staged_work" || stateMode === "active") {
		try {
			planFilePath = findLatestPlan(contextId) ?? null;
		} catch {
			/* ignore */
		}
	}

	// Build plan name (mini/normal only)
	let planPart = "";
	if ((mode === "mini" || mode === "normal") && planFilePath) {
		const planStem = path
			.basename(planFilePath, path.extname(planFilePath))
			.replace(/^\d{4}-\d{2}-\d{2}-(\d{4}-)?/, "");
		const maxPlanLen = mode === "mini" ? 20 : 30;
		let truncatedPlan = planStem.slice(0, maxPlanLen);
		if (planStem.length > maxPlanLen) truncatedPlan += "\u2026";
		planPart = ` ${SLATE_600}\u2502${RESET} ${CTX_SECONDARY}Plan:${RESET} ${SLATE_300}${truncatedPlan}${RESET}`;
	}

	// Note: termWidth not available here — caller truncates via main()
	switch (mode) {
		case "micro":
		case "nano": {
			return `${CTX_ACCENT}\u25C6${RESET} ${SLATE_400}${truncatedId}${RESET}${modeBadge}`;
		}
		case "mini": {
			return `${CTX_ACCENT}\u25C6${RESET} ${SLATE_400}${truncatedId}${RESET}${modeBadge}${planPart}`;
		}
		default: {
			return `${CTX_ACCENT}\u25C6${RESET} ${CTX_SECONDARY}Context:${RESET} ${SLATE_300}${truncatedId}${RESET}${modeBadge}${planPart}`;
		}
	}
}

function renderNoContext(mode: string): string {
	const warn = `${ROSE}\u26A0 ${RESET}`;
	if (mode === "normal") {
		return `${warn} ${ROSE}NO CONTEXT${RESET} ${SLATE_500}\u2014 type ^ for context manager${RESET}`;
	}
	return `${warn} ${ROSE}NO CONTEXT${RESET}`;
}

// ---------------------------------------------------------------------------
// Context persistence
// ---------------------------------------------------------------------------

interface StatuslineCache {
	sessions?: Record<string, { context_id: string | null }>;
}

function loadCache(): StatuslineCache {
	try {
		if (fs.existsSync(STATUSLINE_CACHE)) {
			return JSON.parse(fs.readFileSync(STATUSLINE_CACHE, "utf8"));
		}
	} catch {
		/* ignore */
	}
	return {};
}

function saveCache(cache: StatuslineCache): void {
	try {
		fs.mkdirSync(path.dirname(STATUSLINE_CACHE), { recursive: true });
		fs.writeFileSync(STATUSLINE_CACHE, JSON.stringify(cache, null, 2), "utf8");
	} catch {
		/* ignore */
	}
}

function resolveContextId(sessionId: string): string | null {
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
			const ctxId = context.id;
			cache.sessions[sessionId] = { context_id: ctxId };
			saveCache(cache);
			return ctxId;
		}
	} catch {
		/* ignore */
	}

	// Don't cache negative results — context may be bound by a later hook
	return null;
}

function loadContextState(contextId: string): ContextState | null {
	try {
		return loadState(contextId);
	} catch {
		return null;
	}
}

function writeContextWindow(
	contextId: string,
	contextWindowData: Record<string, unknown>,
): void {
	try {
		const state = getContext(contextId);
		if (state) {
			if (!state.last_session) state.last_session = { session_id: undefined, saved_at: undefined, save_reason: undefined, transcript_path: undefined };
			(state.last_session as Record<string, unknown>).context_remaining_pct =
				contextWindowData.remaining_percentage;
			saveState(contextId, state);
		}
	} catch {
		/* ignore */
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Shape of the JSON payload piped to status_line.ts via stdin */
interface StatusLineInput {
	session_id?: string;
	model?: { display_name?: string };
	workspace?: { project_dir?: string };
	context_window?: {
		current_usage?: {
			cache_read_input_tokens?: number;
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			output_tokens?: number;
		};
		context_window_size?: number;
		used_percentage?: number;
	};
}

function main(): void {
	// Read JSON from stdin
	let inputData: StatusLineInput;
	try {
		inputData = JSON.parse(fs.readFileSync(0, "utf8")) as StatusLineInput;
	} catch {
		inputData = {};
	}

	// Terminal width and mode
	const termWidth = getTerminalWidth();
	const mode = getDisplayMode(termWidth);

	// Extract input fields
	const sessionId = inputData.session_id ?? "";
	const modelName = inputData.model?.display_name ?? "unknown";
	const currentDir: string = inputData.workspace?.project_dir ?? process.cwd();
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
		contextPct = Math.floor(usedPct as number);
	} else {
		contextPct =
			contextMax > 0 ? Math.floor((contextUsed * 100) / contextMax) : 0;
	}

	const contextK = Math.floor(contextUsed / 1000);
	const maxK = Math.floor(contextMax / 1000);

	// Resolve context ID for display and persistence
	const contextId = resolveContextId(sessionId);

	// Render content lines first, truncate all to terminal width, then size separators
	const contextLine = renderContext(mode, termWidth, contextPct, contextK, maxK, modelName);
	const git = getGitStatus(currentDir);
	const gitLine = renderGit(mode, termWidth, git, dirName);

	let ctxMgrLine: string;
	if (contextId) {
		const contextState = loadContextState(contextId);
		ctxMgrLine = truncateToWidth(renderContextManager(mode, contextId, contextState), termWidth);
	} else {
		ctxMgrLine = truncateToWidth(renderNoContext(mode), termWidth);
	}

	// Measure visible width of each content line, cap separator at terminal width
	const maxContentWidth = Math.min(
		termWidth,
		Math.max(
			measureWidth(contextLine),
			measureWidth(gitLine),
			measureWidth(ctxMgrLine),
		),
	);
	const sep = makeSeparator(maxContentWidth);

	const lines = [contextLine, sep, gitLine, sep, ctxMgrLine];

	// Single atomic write — prevents partial output if process is interrupted
	process.stdout.write(lines.join("\n") + "\n");

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


