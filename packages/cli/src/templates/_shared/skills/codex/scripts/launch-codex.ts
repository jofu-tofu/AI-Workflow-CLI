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
import * as path from "node:path";

import { launchDriverInTmuxOrFallback } from "../../../lib-ts/base/tmux-driver.js";
import { cleanupSentinelPath } from "../../../lib-ts/base/sentinel-ipc.js";
import { getProjectRoot } from "../../../lib-ts/base/constants.js";
import { resolveCodexModel, codexReplSpec, buildCliInvocation, isCodexSandbox, type CodexSandbox, type CliArgSpec } from "../../../lib-ts/base/cli-args.js";
import { CODEX_MODELS } from "../../../lib-ts/base/models.js";
import { logDebug, logWarn } from "../../../lib-ts/base/logger.js";
import { displayPath } from "../../../lib-ts/base/utils.js";
import { getContextBySessionId, getContext } from "../../../lib-ts/context/context-store.js";
import { buildExternalAgentContext } from "../../../lib-ts/context/context-formatter.js";
import { findLatestPlan } from "../../../lib-ts/context/plan-manager.js";
import type { ContextState } from "../../../lib-ts/types.js";

/** Codex-specific model abbreviations. Checked before tier resolution. */
const CODEX_ALIASES: Record<string, string> = {
  spark: CODEX_MODELS.spark,
  codex: CODEX_MODELS.codex,
  gpt: CODEX_MODELS.gpt,
};

const SESSION_DISCOVERY_TIMEOUT_MS = 12000;
const SESSION_DISCOVERY_POLL_MS = 250;
const SESSION_MTIME_WINDOW_MS = 120000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eprint(...args: unknown[]): void {
  process.stderr.write(args.map(String).join(" ") + "\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const raw = fs.readFileSync(sessionFile, "utf-8");
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

/** Fallback plan discovery: scan all context plan dirs by mtime. */
function findLatestPlanByMtime(projectRoot: string): string | null {
  const contextsDir = path.join(projectRoot, "_output", "contexts");
  if (!fs.existsSync(contextsDir)) return null;

  let best: { path: string; mtime: number } | null = null;

  for (const ctxEntry of fs.readdirSync(contextsDir)) {
    if (ctxEntry.startsWith("_")) continue;
    const plansDir = path.join(contextsDir, ctxEntry, "plans");
    if (!fs.existsSync(plansDir)) continue;

    for (const file of fs.readdirSync(plansDir)) {
      if (!file.endsWith(".md")) continue;
      const fullPath = path.join(plansDir, file);
      try {
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (!best || mtime > best.mtime) {
          best = { path: fullPath, mtime };
        }
      } catch { /* skip unreadable */ }
    }
  }

  return best?.path ?? null;
}

function buildFileModeBootstrapPrompt(
  targetPath: string,
  sourceLabel: "plan" | "file",
  extraPrompt?: string,
  orientation?: string,
): string {
  const absolutePath = path.resolve(targetPath);
  const sourceTitle = sourceLabel === "plan" ? "Plan Source" : "File Source";
  const sections: string[] = ["## Startup Brief", ""];

  if (orientation?.trim()) {
    sections.push(orientation.trim(), "", "---", "");
  }

  sections.push(
    `## ${sourceTitle}`,
    "",
    `Primary input path: ${absolutePath}`,
    "",
    "Read this file directly from disk before taking action.",
    "Treat its contents as the source of truth.",
    "Do not ask for the file contents to be pasted inline.",
  );

  if (extraPrompt?.trim()) {
    sections.push("", "## Additional Instructions", "", extraPrompt.trim());
  }

  return sections.join("\n");
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
  } else if (rawArgs[i] === "--prompt") {
    eprint("Error: --prompt requires a text argument.");
    process.exit(1);
  } else if (rawArgs[i] === "--yolo") {
    yolo = true;
  } else if (rawArgs[i] === "--no-yolo") {
    yolo = false;
  } else if (rawArgs[i] === "--no-watch") {
    watch = false;
  } else {
    args.push(rawArgs[i]);
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
let tempFile: string | null = null;
let fileReferencePath: string | null = null;
let fileReferenceLabel: "plan" | "file" | null = null;
let extraPromptEmbedded = false;

const projectRoot = getProjectRoot(process.cwd());

// Context lookup — available for all modes (orientation header + plan discovery)
// --context flag preferred (passed by skill caller); CLAUDE_SESSION_ID as fallback (hooks only)
let ctx: ContextState | null = null;
if (contextFlag) {
  ctx = getContext(contextFlag, projectRoot) ?? null;
} else {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId) {
    ctx = getContextBySessionId(sessionId, projectRoot) ?? null;
  }
}

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

  fileReferencePath = path.resolve(planPath);
  fileReferenceLabel = "plan";
  console.log(`Found plan: ${displayPath(planPath)}`);

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
  fileReferencePath = path.resolve(filePath);
  fileReferenceLabel = "file";

} else {
  // Inline text: join args, write to temp file
  const text = args.join(" ");
  tempFile = path.join(os.tmpdir(), `codex-prompt-${Date.now()}.md`);
  fs.writeFileSync(tempFile, text, "utf-8");
  promptPath = tempFile;
}

if (fileReferencePath && fileReferenceLabel) {
  let orientation = "";
  if (ctx) {
    try {
      orientation = buildExternalAgentContext(ctx, projectRoot);
    } catch {
      logWarn("codex-skill", `Context orientation build failed for ${ctx.id}, continuing without header`);
    }
  }

  const bootstrap = buildFileModeBootstrapPrompt(
    fileReferencePath,
    fileReferenceLabel,
    extraPrompt,
    orientation,
  );
  tempFile = path.join(os.tmpdir(), `codex-file-ref-${Date.now()}.md`);
  fs.writeFileSync(tempFile, bootstrap, "utf-8");
  promptPath = tempFile;
  extraPromptEmbedded = Boolean(extraPrompt?.trim());
}

// Prepend context orientation if available — graceful degradation on failure
if (ctx && promptPath && !fileReferencePath) {
  try {
    const orientation = buildExternalAgentContext(ctx, projectRoot);
    const original = fs.readFileSync(promptPath, "utf-8");
    const combined = `${orientation}\n\n---\n\n${original}`;
    const contextPromptPath = path.join(os.tmpdir(), `codex-ctx-prompt-${Date.now()}.md`);
    fs.writeFileSync(contextPromptPath, combined, "utf-8");
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    }
    promptPath = contextPromptPath;
    tempFile = contextPromptPath;
  } catch {
    logWarn("codex-skill", `Context orientation prepend failed for ${ctx.id}, continuing without header`);
  }
}

if (extraPrompt && promptPath && !extraPromptEmbedded) {
  try {
    const base = fs.readFileSync(promptPath, "utf-8");
    const combined = `${base}\n\n---\n\n## Additional Instructions\n\n${extraPrompt}`;
    const extraPromptPath = path.join(os.tmpdir(), `codex-extra-prompt-${Date.now()}.md`);
    fs.writeFileSync(extraPromptPath, combined, "utf-8");
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    }
    promptPath = extraPromptPath;
    tempFile = extraPromptPath;
  } catch {
    logWarn("codex-skill", "Extra prompt append failed, continuing without it");
  }
}

// ---------------------------------------------------------------------------
// Launch Codex
// ---------------------------------------------------------------------------

const codexArgs = buildCliInvocation(codexReplSpec(resolvedModel, sandboxFlag, yolo)).args;
if (yolo) console.log("Mode: YOLO (bypass approvals and sandbox)");
if (sandboxFlag) console.log(`Sandbox: ${sandboxFlag}`);
if (resolvedModel) console.log(`Model: ${resolvedModel}${modelFlag !== resolvedModel ? ` (from "${modelFlag}")` : ""}`);

logDebug("codex-skill", `Launching: model=${resolvedModel ?? "default"}, sandbox=${sandboxFlag ?? "default"}, yolo=${yolo}, extraPrompt=${!!extraPrompt}, source=${args[0]}, bytes=${promptPath ? fs.statSync(promptPath).size : 0}`);

const launchStartedAtMs = Date.now();
const result = await launchDriverInTmuxOrFallback({
  toolName: "codex",
  mode: "repl",
  args: codexArgs,
  splitFlag: "auto",
  promptPath: promptPath ?? undefined,
  allowExecFallback: false,
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
  const promptContent = promptPath ? fs.readFileSync(promptPath, "utf-8") : "";

  if (tempFile) {
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
  }

  const { execFileAsync } = await import("../../../lib-ts/base/subprocess-utils.js");
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

const backendLabel = result.backend === "tmux" ? "tmux pane" : (result.backend === "wt" ? "Windows Terminal pane" : "window");
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
      summarizeViaSessionFileSpark,
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
    const summary = summarizeViaSessionFileSpark(sessionFile)
      ?? (sessionId ? await summarizeViaResume(sessionId) : null)
      ?? summarizeFromSessionFileFallback(sessionFile)
      ?? SUMMARY_UNAVAILABLE_MESSAGE;
    const summaryPath = persistSummary(summary, sessionId || undefined);

    console.log("\n--- Codex Session Summary ---");
    console.log(summary);
    if (summaryPath) {
      console.log(`\n[summary_file:${summaryPath}]`);
    }
  } catch (error) {
    logWarn("codex-skill", `Watch flow failed: ${String(error)}`);
    const fallbackMsg = "Codex session completed. Summary unavailable (watch error).";
    const { persistSummary: persistFallback } = await import("../lib/codex-watcher.js");
    const fallbackPath = persistFallback(fallbackMsg);
    console.log("\n--- Codex Session Summary ---");
    console.log(fallbackMsg);
    if (fallbackPath) {
      console.log(`\n[summary_file:${fallbackPath}]`);
    }
  } finally {
    cleanupSentinelPath(result.sentinelPath);
  }
} else {
  cleanupSentinelPath(result.sentinelPath);
}

if (result.reason) {
  eprint(`Warning: ${result.reason}`);
}
