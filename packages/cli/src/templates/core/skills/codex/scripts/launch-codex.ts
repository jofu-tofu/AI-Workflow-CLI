#!/usr/bin/env bun
/**
 * Launch Codex in a visible pane (tmux/wt/window) and pass the prompt at startup.
 *
 * Usage:
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--no-watch] [--context <id>] [--prompt <text>] plan
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--no-watch] [--context <id>] [--prompt <text>] --file <path>
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--no-watch] [--context <id>] [--prompt <text>] <inline text...>
 */
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

import { findLatestPlan } from "../../../lib-ts/context/plan-manager.js";
import {
  findLatestPlanByMtime,
  resolveContextForLaunch,
  sleep,
  writeFileRefPromptFile,
  writeInlinePromptFile,
} from "../../../lib-ts/runtime/agent-launcher.js";
import { aiwLaunch } from "../../../lib-ts/runtime/aiw-cli.js";
import { resolveCodexModel, buildCliInvocation, isCodexSandbox, type CodexSandbox, type CliArgSpec } from "../../../lib-ts/runtime/cli-args.js";
import { getProjectRoot } from "../../../lib-ts/runtime/constants.js";
import { logDebug, logWarn } from "../../../lib-ts/runtime/logger.js";
import { CODEX_MODELS } from "../../../lib-ts/runtime/models.js";
import { displayPath } from "../../../lib-ts/runtime/utils.js";

/** Codex-specific model abbreviations. Checked before tier resolution. */
const CODEX_ALIASES: Record<string, string> = {
  spark: CODEX_MODELS.spark,
  codex: CODEX_MODELS.codex,
  gpt: CODEX_MODELS.gpt,
};

const SESSION_DISCOVERY_TIMEOUT_MS = 12_000;
const SESSION_DISCOVERY_POLL_MS = 250;
const SESSION_MTIME_WINDOW_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eprint(...args: unknown[]): void {
  process.stderr.write(args.map(String).join(" ") + "\n");
}

function cleanupSentinel(sentinelPath: string | null | undefined): void {
  if (!sentinelPath) return;
  try {
    const dir = path.dirname(sentinelPath);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort */ }
}

function collectSessionJsonlFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const stack: string[] = [rootDir];
  const files: string[] = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function readSessionMeta(sessionFile: string): { sessionId: string; cwd: string; startedAtMs: number } | null {
  try {
    const raw = fs.readFileSync(sessionFile, "utf8");
    const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0);
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine);
    if (parsed?.type !== "session_meta") return null;
    const sessionId = parsed?.payload?.id;
    const cwd = parsed?.payload?.cwd;
    const startedAt = parsed?.payload?.timestamp;
    if (typeof sessionId !== "string" || typeof cwd !== "string") return null;
    const startedAtMs = typeof startedAt === "string"
      ? (Date.parse(startedAt) || 0)
      : 0;
    return { sessionId, cwd, startedAtMs };
  } catch {
    return null;
  }
}

function findLatestSessionCandidate(
  projectRoot: string,
  launchStartedAtMs: number,
  requireProjectCwd = true,
): { sessionId: string; sessionFile: string } | null {
  const sessionsRoot = path.join(os.homedir(), ".codex", "sessions");
  const files = collectSessionJsonlFiles(sessionsRoot);
  if (files.length === 0) return null;

  const candidates: Array<{ sessionId: string; sessionFile: string; mtimeMs: number }> = [];
  const currentThreadId = process.env.CODEX_THREAD_ID ?? "";
  for (const sessionFile of files) {
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(sessionFile).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs < launchStartedAtMs - SESSION_MTIME_WINDOW_MS) continue;

    const meta = readSessionMeta(sessionFile);
    if (!meta) continue;
    if (currentThreadId && meta.sessionId === currentThreadId) continue;
    if (meta.startedAtMs > 0 && meta.startedAtMs < launchStartedAtMs - 1000) continue;
    if (requireProjectCwd && !samePath(meta.cwd, projectRoot)) continue;

    candidates.push({ sessionId: meta.sessionId, sessionFile, mtimeMs });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const best = candidates[0];
  return best ? { sessionId: best.sessionId, sessionFile: best.sessionFile } : null;
}

async function waitForCaptureSession(
  projectRoot: string,
  launchStartedAtMs: number,
): Promise<{ sessionId: string; sessionFile: string } | null> {
  const deadline = Date.now() + SESSION_DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const candidate = findLatestSessionCandidate(projectRoot, launchStartedAtMs, true);
    if (candidate) return candidate;
    await sleep(SESSION_DISCOVERY_POLL_MS);
  }
  // Fallback: tolerate launcher cwd drift (common on Windows pane backends).
  return findLatestSessionCandidate(projectRoot, launchStartedAtMs, false);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  eprint("Usage: launch-codex.ts [--model <model>] [--sandbox <mode>] [--no-yolo] [--no-watch] [--context <id>] [--prompt <text>] plan | --file <path> | <text...>");
  process.exit(1);
}

// Extract flags before mode dispatch
let modelFlag: string | undefined;
let sandboxFlag: CodexSandbox | undefined;
let contextFlag: string | undefined;
let extraPrompt: string | undefined;
let yolo = true;
let watch = true;
const args: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--model" && i + 1 < rawArgs.length) {
    modelFlag = rawArgs[++i];
  } else if (rawArgs[i] === "--sandbox" && i + 1 < rawArgs.length) {
    const val = rawArgs[++i];
    if (!isCodexSandbox(val)) {
      eprint(`Error: Invalid sandbox mode "${val}". Valid: read-only, workspace-write, danger-full-access`);
      process.exit(1);
    }
    sandboxFlag = val;
  } else if (rawArgs[i] === "--context" && i + 1 < rawArgs.length) {
    contextFlag = rawArgs[++i];
  } else if (rawArgs[i] === "--prompt" && i + 1 < rawArgs.length) {
    extraPrompt = rawArgs[++i];
  } else switch (rawArgs[i]) {
 case "--no-watch": {
    watch = false;
  
 break;
 }
 case "--no-yolo": {
    yolo = false;
  
 break;
 }
 case "--prompt": {
    eprint("Error: --prompt requires a text argument.");
    process.exit(1);
  
 break;
 }
 case "--yolo": {
    yolo = true;
  
 break;
 }
 default: {
    args.push(rawArgs[i]);
  }
 }
}

if (args.length === 0) {
  eprint("Usage: launch-codex.ts [--model <model>] [--sandbox <mode>] [--no-yolo] [--no-watch] [--context <id>] [--prompt <text>] plan | --file <path> | <text...>");
  process.exit(1);
}

// Resolve model: alias first, then tier/pass-through via shared resolver
let resolvedModel: string | undefined;
if (modelFlag) {
  const lower = modelFlag.toLowerCase();
  resolvedModel = lower in CODEX_ALIASES
    ? CODEX_ALIASES[lower]
    : resolveCodexModel(modelFlag);
}

let promptPath: string | null = null;

const projectRoot = getProjectRoot(process.cwd());
const ctx = resolveContextForLaunch(contextFlag, projectRoot);

if (args[0] === "plan") {
  // Plan discovery: context system first, mtime fallback second
  let planPath: string | null = null;

  if (ctx) {
    planPath = findLatestPlan(ctx.id, projectRoot);
  }

  if (!planPath) {
    planPath = findLatestPlanByMtime(projectRoot);
  }

  if (!planPath) {
    eprint("Error: No plan found. Create a plan first (use plan mode), then run this command.");
    process.exit(1);
  }

  console.log(`Found plan: ${displayPath(planPath)}`);
  promptPath = writeFileRefPromptFile({
    fileReferencePath: path.resolve(planPath),
    label: "plan",
    extraPrompt,
    ctx,
    projectRoot,
    tempFilePrefix: "codex",
  });

} else if (args[0] === "--file") {
  if (!args[1]) {
    eprint("Error: --file requires a path argument.");
    process.exit(1);
  }
  const filePath = path.resolve(args[1]);
  if (!fs.existsSync(filePath)) {
    eprint(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  promptPath = writeFileRefPromptFile({
    fileReferencePath: filePath,
    label: "file",
    extraPrompt,
    ctx,
    projectRoot,
    tempFilePrefix: "codex",
  });

} else {
  // Inline text: join args, write to temp file with context + extra prompt
  promptPath = writeInlinePromptFile({
    text: args.join(" "),
    extraPrompt,
    ctx,
    projectRoot,
    tempFilePrefix: "codex",
  });
}

// ---------------------------------------------------------------------------
// Launch Codex
// ---------------------------------------------------------------------------

const launchCwd = process.env.AIW_CALLER_CWD?.trim() || process.cwd();
if (yolo) console.log("Mode: YOLO (bypass approvals and sandbox)");
if (sandboxFlag) console.log(`Sandbox: ${sandboxFlag}`);
if (resolvedModel) console.log(`Model: ${resolvedModel}${modelFlag !== resolvedModel ? ` (from "${modelFlag}")` : ""}`);

logDebug("codex-skill", `Launching: model=${resolvedModel ?? "default"}, sandbox=${sandboxFlag ?? "default"}, yolo=${yolo}, extraPrompt=${Boolean(extraPrompt)}, source=${args[0]}, bytes=${promptPath ? fs.statSync(promptPath).size : 0}`);

const launchStartedAtMs = Date.now();

// Shell out to `aiw launch` instead of importing tmux modules directly.
// This consolidates all pane-launching logic in the CLI binary.
const result = await aiwLaunch({
  codex: true,
  wait: false,
  json: true,
  split: "auto",
  promptPath: promptPath ?? undefined,
  cwd: launchCwd,
});

if (!result.launched) {
  // Final fallback: non-interactive codex exec in current terminal.
  eprint(`Note: Pane launch unavailable (${result.reason ?? "unknown"}). Using codex exec mode (non-interactive).`);

  const execSpec: CliArgSpec = {
    provider: "codex",
    model: resolvedModel ?? CODEX_MODELS.codex,
    mode: "structured",
    sandbox: sandboxFlag ?? "danger-full-access",
  };
  const execInv = buildCliInvocation(execSpec);
  const promptContent = promptPath ? fs.readFileSync(promptPath, "utf8") : "";

  if (promptPath) {
    try { fs.unlinkSync(promptPath); } catch { /* ignore */ }
  }

  const { execFileAsync } = await import("../../../lib-ts/runtime/subprocess-utils.js");
  const execResult = await execFileAsync(execInv.cliName, execInv.args, {
    input: promptContent,
    env: { ...process.env, ...execInv.env },
    shell: process.platform === "win32",
  });

  if (execResult.stdout) console.log(execResult.stdout);
  if (execResult.exitCode !== 0) {
    eprint(`Codex exec exited with code ${execResult.exitCode}`);
    if (execResult.stderr) eprint(execResult.stderr);
    process.exit(1);
  }

  console.log("Codex exec completed (non-interactive mode).");
  process.exit(0);
}

const backendLabel = result.backend === "tmux" ? "tmux pane" : result.backend === "psmux" ? "psmux pane" : "window";
if (result.paneId) {
  console.log(`Codex launched in ${backendLabel}: ${result.paneId}`);
} else {
  console.log(`Codex launched in ${backendLabel}.`);
}

if (watch && (result.paneId || result.sentinelPath)) {
  try {
    const {
      persistSummary,
      SUMMARY_UNAVAILABLE_MESSAGE,
      summarizeFromSessionFileFallback,
      summarizeViaResume,
      summarizeViaSessionFile,
      waitForPaneClose,
    } = await import("../lib/codex-watcher.js");

    const sessionInfo = await waitForCaptureSession(projectRoot, launchStartedAtMs);
    await waitForPaneClose({
      backend: result.backend,
      paneId: result.paneId,
      sentinelPath: result.sentinelPath,
    });

    const sessionFile = sessionInfo?.sessionFile ?? "";
    const sessionId = sessionInfo?.sessionId ?? "";
    const summary = (await summarizeViaSessionFile(sessionFile))
      ?? (sessionId ? await summarizeViaResume(sessionId) : null)
      ?? summarizeFromSessionFileFallback(sessionFile)
      ?? SUMMARY_UNAVAILABLE_MESSAGE;
    const summaryPath = persistSummary(summary, "codex", sessionId || undefined);

    console.log("\n--- Codex Session Summary ---");
    console.log(summary);
    if (summaryPath) {
      console.log(`\n[summary_file:${summaryPath}]`);
    }
  } catch (error) {
    logWarn("codex-skill", `Watch flow failed: ${String(error)}`);
    const fallbackMsg = "Codex session completed. Summary unavailable (watch error).";
    const { persistSummary: persistFallback } = await import("../lib/codex-watcher.js");
    const fallbackPath = persistFallback(fallbackMsg, "codex");
    console.log("\n--- Codex Session Summary ---");
    console.log(fallbackMsg);
    if (fallbackPath) {
      console.log(`\n[summary_file:${fallbackPath}]`);
    }
  } finally {
    cleanupSentinel(result.sentinelPath);
  }
} else {
  cleanupSentinel(result.sentinelPath);
}

if (result.reason) {
  eprint(`Warning: ${result.reason}`);
}


