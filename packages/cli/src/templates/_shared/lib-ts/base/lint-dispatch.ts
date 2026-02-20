/**
 * Linter dispatch table and runner for PostToolUse lint-after-edit hook.
 * Maps file extensions to linter configs, runs linters, parses output.
 * See root CLAUDE.md for template sync targets.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { logDebug, logWarn } from "./logger.js";
import { findExecutable } from "./subprocess-utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinterConfig {
  name: string;
  extensions: string[];
  source: "bundled" | "system";
  binaryName: string;
  buildArgs: (filePath: string) => string[];
  parseOutput: (stdout: string, stderr: string, exitCode: number) => LintError[];
  /** Exit codes that mean "lint errors found" (parse output). Other non-zero = crash (skip). */
  lintExitCodes: number[];
}

export interface LintError {
  line: number;
  column?: number;
  severity: "error" | "warning";
  message: string;
  rule?: string;
}

// ─── Output Parsers ─────────────────────────────────────────────────────────

function parseBiomeOutput(stdout: string, _stderr: string, _exitCode: number): LintError[] {
  try {
    const data = JSON.parse(stdout);
    const diagnostics: any[] = data?.diagnostics ?? [];
    return diagnostics.map((d) => ({
      line: d.location?.span?.start?.line ?? d.location?.sourceCode?.lineIndex ?? 0,
      column: d.location?.span?.start?.character ?? undefined,
      severity: d.severity === "error" || d.severity === "fatal" ? "error" as const : "warning" as const,
      message: typeof d.description === "string" ? d.description : (d.message ?? "Unknown issue"),
      rule: d.category ?? undefined,
    }));
  } catch {
    return [];
  }
}

function parseRuffOutput(stdout: string, _stderr: string, _exitCode: number): LintError[] {
  try {
    const items: any[] = JSON.parse(stdout);
    return items.map((item) => ({
      line: item.location?.row ?? 0,
      column: item.location?.column ?? undefined,
      severity: "error" as const,
      message: item.message ?? "Unknown issue",
      rule: item.code ?? undefined,
    }));
  } catch {
    return [];
  }
}

function parseShellcheckOutput(stdout: string, _stderr: string, _exitCode: number): LintError[] {
  try {
    const data = JSON.parse(stdout);
    const comments: any[] = data?.comments ?? [];
    return comments.map((c) => ({
      line: c.line ?? 0,
      column: c.column ?? undefined,
      severity: c.level === "error" ? "error" as const : "warning" as const,
      message: c.message ?? "Unknown issue",
      rule: c.code ? `SC${c.code}` : undefined,
    }));
  } catch {
    return [];
  }
}

function parseRubocopOutput(stdout: string, _stderr: string, _exitCode: number): LintError[] {
  try {
    const data = JSON.parse(stdout);
    const offenses: any[] = data?.files?.[0]?.offenses ?? [];
    return offenses.map((o) => ({
      line: o.location?.line ?? 0,
      column: o.location?.column ?? undefined,
      severity: o.severity === "error" || o.severity === "fatal" ? "error" as const : "warning" as const,
      message: o.message ?? "Unknown issue",
      rule: o.cop_name ?? undefined,
    }));
  } catch {
    return [];
  }
}

const CPPCHECK_RE = /^(.+):(\d+):(\d+): (\w+): (.+) \[(.+)\]$/;

function parseCppcheckOutput(_stdout: string, stderr: string, _exitCode: number): LintError[] {
  const errors: LintError[] = [];
  for (const line of stderr.split("\n")) {
    const m = CPPCHECK_RE.exec(line.trim());
    if (m) {
      errors.push({
        line: parseInt(m[2]!, 10),
        column: parseInt(m[3]!, 10),
        severity: m[4] === "error" ? "error" : "warning",
        message: m[5]!,
        rule: m[6],
      });
    }
  }
  return errors;
}

// ─── Dispatch Table ─────────────────────────────────────────────────────────

const LINTERS: LinterConfig[] = [
  {
    name: "biome",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".css"],
    source: "bundled",
    binaryName: "biome",
    buildArgs: (filePath) => ["lint", "--reporter=json", "--max-diagnostics=20", filePath],
    parseOutput: parseBiomeOutput,
    lintExitCodes: [1],
  },
  {
    name: "ruff",
    extensions: [".py", ".pyi"],
    source: "system",
    binaryName: "ruff",
    buildArgs: (filePath) => ["check", "--no-fix", "--output-format=json", filePath],
    parseOutput: parseRuffOutput,
    lintExitCodes: [1],
  },
  {
    name: "shellcheck",
    extensions: [".sh", ".bash"],
    source: "system",
    binaryName: "shellcheck",
    buildArgs: (filePath) => ["-f", "json1", filePath],
    parseOutput: parseShellcheckOutput,
    lintExitCodes: [1],
  },
  {
    name: "rubocop",
    extensions: [".rb"],
    source: "system",
    binaryName: "rubocop",
    buildArgs: (filePath) => ["--format", "json", "--no-autocorrect", filePath],
    parseOutput: parseRubocopOutput,
    lintExitCodes: [1, 2],
  },
  {
    name: "cppcheck",
    extensions: [".c", ".cpp", ".h", ".hpp"],
    source: "system",
    binaryName: "cppcheck",
    buildArgs: (filePath) => ["--enable=warning,style", "--template=gcc", filePath],
    parseOutput: parseCppcheckOutput,
    lintExitCodes: [1],
  },
];

/** Extension → LinterConfig lookup map (built once). */
const EXT_MAP = new Map<string, LinterConfig>();
for (const linter of LINTERS) {
  for (const ext of linter.extensions) {
    EXT_MAP.set(ext, linter);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up the linter config for a file by extension.
 * Returns null if no linter is configured for this file type.
 */
export function getLinterForFile(filePath: string): LinterConfig | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP.get(ext) ?? null;
}

/**
 * Resolve the binary path for a linter.
 * Bundled linters: check project node_modules/.bin first, then PATH.
 * System linters: check PATH only.
 * Returns null if binary not found.
 */
function resolveBinary(config: LinterConfig, projectRoot: string): string | null {
  if (config.source === "bundled") {
    // 1. Project-local node_modules
    const localBin = path.join(projectRoot, "node_modules", ".bin", config.binaryName);
    if (fs.existsSync(localBin)) return localBin;

    // 2. PATH (covers global npm install of aiwcli)
    return findExecutable(config.binaryName);
  }

  // System linters: PATH only
  return findExecutable(config.binaryName);
}

/**
 * Run a linter on a file.
 * Returns null if the linter binary is not found.
 * Returns { errors: [] } if the file passes lint.
 */
export function runLinter(
  config: LinterConfig,
  filePath: string,
  projectRoot: string,
): { errors: LintError[] } | null {
  const binary = resolveBinary(config, projectRoot);
  if (!binary) {
    logDebug("lint-dispatch", `${config.name} binary not found, skipping`);
    return null;
  }

  const args = config.buildArgs(filePath);

  try {
    // eslint-disable-next-line no-undef -- Bun runtime global
    const result = (Bun as any).spawnSync([binary, ...args], {
      cwd: projectRoot,
      timeout: 8000, // 8s soft limit (10s hook timeout is the hard kill)
      stdout: "pipe",
      stderr: "pipe",
    });

    const {exitCode} = result;
    const stdout = result.stdout?.toString() ?? "";
    const stderr = result.stderr?.toString() ?? "";

    // Exit 0 = clean
    if (exitCode === 0) return { errors: [] };

    // Known lint-error exit codes → parse output
    if (config.lintExitCodes.includes(exitCode)) {
      const errors = config.parseOutput(stdout, stderr, exitCode);
      return { errors };
    }

    // Unknown exit code = crash/timeout → skip
    logWarn("lint-dispatch", `${config.name} exited with unexpected code ${exitCode} on ${filePath}`);
    return { errors: [] };
  } catch (error) {
    logWarn("lint-dispatch", `${config.name} execution failed: ${error}`);
    return { errors: [] };
  }
}

/**
 * Format lint errors for Claude's context injection.
 * Returns a human-readable string suitable for emitContext().
 */
export function formatLintErrors(
  filePath: string,
  linterName: string,
  errors: LintError[],
  maxShown = 15,
): string {
  const shown = errors.slice(0, maxShown);
  const lines = [
    `Lint: ${errors.length} issue(s) in \`${filePath}\` (${linterName})`,
    "",
  ];

  for (const err of shown) {
    const loc = err.column ? `L${err.line}:${err.column}` : `L${err.line}`;
    const sev = err.severity === "error" ? "error" : "warn";
    const rule = err.rule ? ` [${err.rule}]` : "";
    lines.push(`- **${sev}** ${loc}: ${err.message}${rule}`);
  }

  if (errors.length > maxShown) {
    lines.push(`- ... and ${errors.length - maxShown} more`);
  }

  lines.push("");
  lines.push("Fix these lint errors in the file you just edited.");

  return lines.join("\n");
}
