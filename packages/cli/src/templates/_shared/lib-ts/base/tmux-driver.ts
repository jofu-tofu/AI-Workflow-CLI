/**
 * Shared tmux pane driver helpers for launching CLI tools in split panes.
 *
 * This module centralizes:
 * - tmux/session availability checks
 * - split-pane command launch behavior (auto-close vs hold-open)
 * - REPL prompt injection into tmux panes
 * - optional direct exec fallback when tmux is unavailable
 * - optional provider/model preflight hook point
 */

import * as fs from "node:fs";

import { execFileAsync, findExecutable } from "./subprocess-utils.js";

export type DriverMode = "exec" | "repl";
export type TmuxSplitFlag = "-h" | "-v";

export interface DriverPreflightResult {
  available: boolean;
  error?: string;
}

export type DriverPreflight =
  (toolPath: string) => Promise<DriverPreflightResult> | DriverPreflightResult;

export interface SendToPaneOptions {
  waitForPromptMs?: number;
  postPasteDelayMs?: number;
  retryEnter?: boolean;
  retryDelayMs?: number;
}

export interface LaunchDriverOptions {
  toolName: string;
  toolBin?: string;
  mode?: DriverMode;
  args?: string[];
  env?: Record<string, string>;
  promptPath?: string;
  sendPromptInRepl?: boolean;
  splitFlag?: string;
  splitTarget?: string;
  autoClose?: boolean;
  holdPane?: boolean;
  holdMessage?: string;
  allowExecFallback?: boolean;
  preflight?: DriverPreflight;
  timeoutMs?: number;
}

export interface LaunchDriverResult {
  launched: boolean;
  usedTmux: boolean;
  mode: DriverMode;
  toolPath?: string;
  paneId?: string;
  exitCode?: number;
  reason?: string;
  stderr?: string;
}

export interface TmuxAvailability {
  available: boolean;
  tmuxPath?: string;
  reason?: string;
}

const REPL_PROMPT_REGEX = /(^|\n)\s*[›>]\s/;
const REPL_ACTIVITY_HINT = "\n• ";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

function buildEnvPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${quoteForSh(value)}`)
    .join(" ");
}

function buildToolCommand(
  toolPath: string,
  args: string[],
  env: Record<string, string>,
  mode: DriverMode,
  promptPath?: string,
): string {
  const envPrefix = buildEnvPrefix(env);
  const argPart = args.map((arg) => quoteForSh(arg)).join(" ");
  const base = [envPrefix, quoteForSh(toolPath), argPart]
    .filter(Boolean)
    .join(" ");

  if (mode === "exec" && promptPath) {
    return `${base} < ${quoteForSh(promptPath)}`;
  }

  return base;
}

function wrapPaneCommand(
  command: string,
  autoClose: boolean,
  holdPane: boolean,
  holdMessage: string,
): string {
  if (autoClose) {
    return `${command}; code=$?; tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true; exit $code`;
  }

  if (holdPane) {
    return `${command}; code=$?; echo; echo ${quoteForSh(holdMessage)}; exec bash`;
  }

  return command;
}

async function capturePaneText(tmuxPath: string, paneId: string): Promise<string> {
  const result = await execFileAsync(tmuxPath, ["capture-pane", "-p", "-t", paneId], {
    timeout: 3000,
  });
  return result.exitCode === 0 ? result.stdout : "";
}

async function waitForReplPrompt(
  tmuxPath: string,
  paneId: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await capturePaneText(tmuxPath, paneId);
    if (REPL_PROMPT_REGEX.test(snapshot)) return true;
    await sleep(250);
  }
  return false;
}

export function quoteForSh(input: string): string {
  return `'${input.replaceAll("'", "'\"'\"'")}'`;
}

export function normalizeSplitFlag(value: string | undefined): TmuxSplitFlag {
  return value?.trim() === "-v" ? "-v" : "-h";
}

export function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function getTmuxAvailability(): TmuxAvailability {
  if (!process.env.TMUX) {
    return { available: false, reason: "TMUX is not set" };
  }

  const tmuxPath = findExecutable("tmux");
  if (!tmuxPath) {
    return { available: false, reason: "tmux not found on PATH" };
  }

  return { available: true, tmuxPath };
}

export function resolveToolPath(toolName: string, toolBin?: string): string | null {
  const bin = toolBin?.trim() || toolName;
  return findExecutable(bin);
}

export async function sendFileToPane(
  tmuxPath: string,
  paneId: string,
  filePath: string,
  options?: SendToPaneOptions,
): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;

  await waitForReplPrompt(tmuxPath, paneId, options?.waitForPromptMs ?? 12000);

  const bufferName = `aiwcli-pane-${Date.now()}`;
  const load = await execFileAsync(tmuxPath, ["load-buffer", "-b", bufferName, filePath], {
    timeout: 3000,
  });
  if (load.exitCode !== 0) return false;

  const paste = await execFileAsync(tmuxPath, ["paste-buffer", "-d", "-p", "-b", bufferName, "-t", paneId], {
    timeout: 3000,
  });
  if (paste.exitCode !== 0) return false;

  await sleep(options?.postPasteDelayMs ?? 500);

  const firstEnter = await execFileAsync(tmuxPath, ["send-keys", "-t", paneId, "Enter"], {
    timeout: 3000,
  });
  if (firstEnter.exitCode !== 0) return false;

  if (options?.retryEnter === false) {
    return true;
  }

  await sleep(options?.retryDelayMs ?? 1200);
  const snapshot = await capturePaneText(tmuxPath, paneId);
  const lastFewLines = snapshot.split(/\r?\n/).slice(-5).join("\n");
  if (REPL_PROMPT_REGEX.test(lastFewLines) && !lastFewLines.includes(REPL_ACTIVITY_HINT)) {
    const secondEnter = await execFileAsync(tmuxPath, ["send-keys", "-t", paneId, "Enter"], {
      timeout: 3000,
    });
    if (secondEnter.exitCode !== 0) return false;
  }

  return true;
}

export async function launchDriverInTmuxOrFallback(
  options: LaunchDriverOptions,
): Promise<LaunchDriverResult> {
  const mode = options.mode ?? "exec";
  const args = options.args ?? [];
  const envVars = options.env ?? {};
  const timeoutMs = options.timeoutMs ?? 0;
  const toolPath = resolveToolPath(options.toolName, options.toolBin);

  if (!toolPath) {
    return {
      launched: false,
      usedTmux: false,
      mode,
      reason: `${options.toolBin ?? options.toolName} not found on PATH`,
    };
  }

  if (options.preflight) {
    const preflight = await options.preflight(toolPath);
    if (!preflight.available) {
      return {
        launched: false,
        usedTmux: false,
        mode,
        toolPath,
        reason: preflight.error ?? "driver preflight failed",
      };
    }
  }

  if (mode === "exec" && options.promptPath && !fs.existsSync(options.promptPath)) {
    return {
      launched: false,
      usedTmux: false,
      mode,
      toolPath,
      reason: `prompt file not found: ${options.promptPath}`,
    };
  }

  const tmux = getTmuxAvailability();
  if (tmux.available && tmux.tmuxPath) {
    const splitFlag = normalizeSplitFlag(options.splitFlag);
    const splitTarget = options.splitTarget?.trim();
    const baseCmd = buildToolCommand(toolPath, args, envVars, mode, options.promptPath);
    const holdMessage = options.holdMessage ?? "[aiwcli] Driver exited. Pane held open.";
    const paneBody = wrapPaneCommand(
      baseCmd,
      Boolean(options.autoClose),
      Boolean(options.holdPane) && !Boolean(options.autoClose),
      holdMessage,
    );
    const paneCmd = `bash -lc ${quoteForSh(paneBody)}`;

    const tmuxArgs = ["split-window", splitFlag, "-P", "-F", "#{pane_id}"];
    if (splitTarget) tmuxArgs.push("-t", splitTarget);
    tmuxArgs.push(paneCmd);

    const split = await execFileAsync(tmux.tmuxPath, tmuxArgs, { timeout: 3000 });
    if (split.exitCode !== 0) {
      return {
        launched: false,
        usedTmux: true,
        mode,
        toolPath,
        reason: "tmux split-window failed",
        stderr: split.stderr.trim() || undefined,
      };
    }

    const paneId = getLastLine(split.stdout);
    if (mode === "repl" && options.sendPromptInRepl !== false && paneId && options.promptPath) {
      const sent = await sendFileToPane(tmux.tmuxPath, paneId, options.promptPath);
      if (!sent) {
        return {
          launched: true,
          usedTmux: true,
          mode,
          toolPath,
          paneId,
          reason: "launched, but prompt injection failed",
        };
      }
    }

    return {
      launched: true,
      usedTmux: true,
      mode,
      toolPath,
      paneId: paneId || undefined,
    };
  }

  if (mode === "exec" && options.allowExecFallback) {
    const input = options.promptPath
      ? fs.readFileSync(options.promptPath, "utf-8")
      : undefined;

    const result = await execFileAsync(toolPath, args, {
      input,
      timeout: timeoutMs,
      env: { ...process.env, ...envVars },
      shell: process.platform === "win32",
    });

    return {
      launched: true,
      usedTmux: false,
      mode,
      toolPath,
      exitCode: result.exitCode,
      stderr: result.stderr,
      reason: result.exitCode === 0 ? undefined : `fallback exec exited ${result.exitCode}`,
    };
  }

  return {
    launched: false,
    usedTmux: false,
    mode,
    toolPath,
    reason: `${tmux.reason ?? "tmux unavailable"}; fallback disabled`,
  };
}
