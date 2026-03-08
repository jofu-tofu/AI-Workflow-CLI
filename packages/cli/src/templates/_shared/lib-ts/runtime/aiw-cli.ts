/**
 * Helper to discover and invoke the `aiw` CLI binary from template scripts.
 *
 * Reads the resolved binary path from `.aiwcli/.aiw-bin-path` (written by `aiw init`).
 * Falls back to `aiw` on PATH if the file is missing.
 */

import * as fs from "node:fs";
import path from "node:path";

import { getProjectRoot } from "./constants.js";
import { execFileAsync, type ExecResult } from "./subprocess-utils.js";

function resolveAiwBin(cwd?: string): string {
  const projectRoot = getProjectRoot(cwd ?? process.cwd());
  const binPathFile = path.join(projectRoot, ".aiwcli", ".aiw-bin-path");
  try {
    const binPath = fs.readFileSync(binPathFile, "utf8").trim();
    if (binPath && fs.existsSync(binPath)) return binPath;
  } catch {
    // Fall through to PATH lookup
  }
  return "aiw";
}

export interface AiwLaunchOptions {
  /** Launch codex instead of claude. */
  codex?: boolean;
  /** Launch devin instead of claude. */
  devin?: boolean;
  /** Block until pane exits. */
  wait?: boolean;
  /** Return JSON output. */
  json?: boolean;
  /** Split direction: auto, h, or v. */
  split?: "auto" | "h" | "v";
  /** Extra env vars to inject. */
  env?: Record<string, string>;
  /** Path to prompt file. */
  promptPath?: string;
  /** Working directory. */
  cwd?: string;
  /** Timeout in ms (only relevant with --wait). */
  timeoutMs?: number;
}

export interface AiwLaunchResult {
  launched: boolean;
  backend: string;
  paneId: string | null;
  sentinelPath: string | null;
  exitCode: number | null;
  reason: string | null;
}

/**
 * Shell out to `aiw launch` with structured options.
 * Returns parsed JSON result when --json is used.
 */
export async function aiwLaunch(options: AiwLaunchOptions): Promise<AiwLaunchResult> {
  const bin = resolveAiwBin(options.cwd);
  const args = ["launch"];

  if (options.codex) args.push("--codex");
  if (options.devin) args.push("--devin");
  if (options.wait) args.push("--wait");
  args.push("--json");
  if (options.split) args.push("--split", options.split);
  if (options.env && Object.keys(options.env).length > 0) {
    args.push("--env", JSON.stringify(options.env));
  }
  if (options.promptPath) args.push("--prompt-path", options.promptPath);

  const result = await execFileAsync(bin, args, {
    timeout: options.timeoutMs ?? 14_400_000,
    env: process.env as Record<string, string>,
    shell: process.platform === "win32",
  });

  return parseJsonResult(result);
}

function parseJsonResult(result: ExecResult): AiwLaunchResult {
  try {
    const lines = result.stdout.trim().split(/\r?\n/);
    const lastLine = lines.at(-1) ?? "";
    const parsed = JSON.parse(lastLine);
    return {
      launched: Boolean(parsed.launched),
      backend: String(parsed.backend ?? "exec"),
      paneId: parsed.paneId ?? null,
      sentinelPath: parsed.sentinelPath ?? null,
      exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : null,
      reason: parsed.reason ?? null,
    };
  } catch {
    return {
      launched: false,
      backend: "exec",
      paneId: null,
      sentinelPath: null,
      exitCode: result.exitCode,
      reason: `Failed to parse aiw launch output: ${result.stderr || result.stdout}`,
    };
  }
}

