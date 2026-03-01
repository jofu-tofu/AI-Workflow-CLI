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
import { findBestSplit, listPanes } from "./tmux-pane-placement.js";

export type DriverMode = "exec" | "repl";
export type TmuxSplitFlag = "-h" | "-v";
export type TmuxSplitOption = TmuxSplitFlag | "auto";

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

export interface SendToPaneResult {
  success: boolean;
  /** Which step failed, if any */
  failedAt?: "prompt-wait" | "load-buffer" | "paste-buffer" | "send-enter";
  /** ms spent waiting for REPL prompt */
  promptWaitMs?: number;
  /** Last 200 chars of pane content at time of prompt-wait timeout */
  paneTailOnTimeout?: string;
  /** stderr from the failed tmux command, if any */
  tmuxStderr?: string;
  /** Whether retry Enter was sent */
  retrySent?: boolean;
}

export interface LaunchDriverOptions {
  toolName: string;
  toolBin?: string;
  mode?: DriverMode;
  args?: string[];
  env?: Record<string, string>;
  promptPath?: string;
  sendPromptInRepl?: boolean;
  splitFlag?: TmuxSplitOption;
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
  sendDiagnostics?: SendToPaneResult;
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

function splitFlagFromDimensions(width: number, height: number): TmuxSplitFlag {
  return width >= height ? "-h" : "-v";
}

async function resolveSplitFlagForTargetPane(
  tmuxPath: string,
  splitTarget: string,
): Promise<TmuxSplitFlag | null> {
  const size = await execFileAsync(
    tmuxPath,
    ["display-message", "-p", "-t", splitTarget, "#{pane_width} #{pane_height}"],
    { timeout: 3000 },
  );
  if (size.exitCode !== 0) return null;

  const parts = size.stdout.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const width = Number.parseInt(parts[0] ?? "", 10);
  const height = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return splitFlagFromDimensions(width, height);
}

async function resolveAutoSplit(
  tmuxPath: string,
  splitTarget?: string,
): Promise<{ splitFlag: TmuxSplitFlag; splitTarget?: string }> {
  const explicitTarget = splitTarget?.trim();
  if (explicitTarget) {
    const splitFlag = await resolveSplitFlagForTargetPane(tmuxPath, explicitTarget);
    return {
      splitFlag: splitFlag ?? "-h",
      splitTarget: explicitTarget,
    };
  }

  const panes = await listPanes(tmuxPath);
  const placement = findBestSplit(panes);
  if (!placement) return { splitFlag: "-h" };

  return {
    splitFlag: placement.splitFlag,
    splitTarget: placement.targetPane,
  };
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
): Promise<SendToPaneResult> {
  if (!fs.existsSync(filePath)) return { success: false, failedAt: "load-buffer", tmuxStderr: "file not found" };

  const startTime = Date.now();
  const promptReady = await waitForReplPrompt(tmuxPath, paneId, options?.waitForPromptMs ?? 12000);
  const promptWaitMs = Date.now() - startTime;

  if (!promptReady) {
    const snapshot = await capturePaneText(tmuxPath, paneId);
    const paneTailOnTimeout = snapshot.slice(-200);
    return { success: false, failedAt: "prompt-wait", promptWaitMs, paneTailOnTimeout };
  }

  const bufferName = `aiwcli-pane-${Date.now()}`;
  const load = await execFileAsync(tmuxPath, ["load-buffer", "-b", bufferName, filePath], {
    timeout: 3000,
  });
  if (load.exitCode !== 0) return { success: false, failedAt: "load-buffer", promptWaitMs, tmuxStderr: load.stderr };

  const paste = await execFileAsync(tmuxPath, ["paste-buffer", "-d", "-p", "-b", bufferName, "-t", paneId], {
    timeout: 3000,
  });
  if (paste.exitCode !== 0) return { success: false, failedAt: "paste-buffer", promptWaitMs, tmuxStderr: paste.stderr };

  await sleep(options?.postPasteDelayMs ?? 500);

  const firstEnter = await execFileAsync(tmuxPath, ["send-keys", "-t", paneId, "Enter"], {
    timeout: 3000,
  });
  if (firstEnter.exitCode !== 0) return { success: false, failedAt: "send-enter", promptWaitMs, tmuxStderr: firstEnter.stderr };

  if (options?.retryEnter === false) {
    return { success: true, promptWaitMs, retrySent: false };
  }

  let retrySent = false;
  await sleep(options?.retryDelayMs ?? 1200);
  const snapshot = await capturePaneText(tmuxPath, paneId);
  const lastFewLines = snapshot.split(/\r?\n/).slice(-5).join("\n");
  if (REPL_PROMPT_REGEX.test(lastFewLines) && !lastFewLines.includes(REPL_ACTIVITY_HINT)) {
    const secondEnter = await execFileAsync(tmuxPath, ["send-keys", "-t", paneId, "Enter"], {
      timeout: 3000,
    });
    if (secondEnter.exitCode !== 0) return { success: false, failedAt: "send-enter", promptWaitMs, tmuxStderr: secondEnter.stderr };
    retrySent = true;
  }

  return { success: true, promptWaitMs, retrySent };
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
    const requestedSplitFlag = options.splitFlag;
    const explicitSplitTarget = options.splitTarget?.trim();
    let splitFlag: TmuxSplitFlag;
    let splitTarget: string | undefined;

    if (requestedSplitFlag === "auto") {
      try {
        const resolved = await resolveAutoSplit(tmux.tmuxPath, explicitSplitTarget);
        splitFlag = resolved.splitFlag;
        splitTarget = resolved.splitTarget;
      } catch {
        splitFlag = "-h";
        splitTarget = explicitSplitTarget;
      }
    } else {
      splitFlag = normalizeSplitFlag(requestedSplitFlag);
      splitTarget = explicitSplitTarget;
    }

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
      const sendResult = await sendFileToPane(tmux.tmuxPath, paneId, options.promptPath);
      if (!sendResult.success) {
        return {
          launched: true,
          usedTmux: true,
          mode,
          toolPath,
          paneId,
          reason: `launched, but prompt injection failed at ${sendResult.failedAt}`,
          sendDiagnostics: sendResult,
        };
      }
      return {
        launched: true,
        usedTmux: true,
        mode,
        toolPath,
        paneId: paneId || undefined,
        sendDiagnostics: sendResult,
      };
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
