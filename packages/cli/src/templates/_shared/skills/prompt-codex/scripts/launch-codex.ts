#!/usr/bin/env bun
/**
 * Launch Codex in a tmux pane and inject a prompt into its REPL.
 *
 * Usage:
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--context <id>] plan
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--context <id>] --file <path>
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--context <id>] <inline text...>
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  getTmuxAvailability,
  launchDriverInTmuxOrFallback,
} from "../../../lib-ts/base/tmux-driver.js";
import { getProjectRoot } from "../../../lib-ts/base/constants.js";
import { resolveCodexModel, codexReplSpec, buildCliInvocation, isCodexSandbox, type CodexSandbox } from "../../../lib-ts/base/cli-args.js";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eprint(...args: unknown[]): void {
  process.stderr.write(args.map(String).join(" ") + "\n");
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

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  eprint("Usage: launch-codex.ts [--model <model>] [--sandbox <mode>] [--context <id>] plan | --file <path> | <text...>");
  process.exit(1);
}

// Extract --model, --sandbox, and --context flags before mode dispatch
let modelFlag: string | undefined;
let sandboxFlag: CodexSandbox | undefined;
let contextFlag: string | undefined;
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
  } else {
    args.push(rawArgs[i]);
  }
}

if (args.length === 0) {
  eprint("Usage: launch-codex.ts [--model <model>] [--sandbox <mode>] [--context <id>] plan | --file <path> | <text...>");
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

  promptPath = planPath;
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
  promptPath = filePath;

} else {
  // Inline text: join args, write to temp file
  const text = args.join(" ");
  tempFile = path.join(os.tmpdir(), `codex-prompt-${Date.now()}.md`);
  fs.writeFileSync(tempFile, text, "utf-8");
  promptPath = tempFile;
}

// Prepend context orientation if available — graceful degradation on failure
if (ctx && promptPath) {
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

// ---------------------------------------------------------------------------
// Pre-flight: tmux required
// ---------------------------------------------------------------------------

const tmux = getTmuxAvailability();
if (!tmux.available) {
  eprint(`Error: tmux is required for Codex REPL mode. ${tmux.reason ?? ""}`);
  if (tempFile) try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Launch Codex REPL in tmux pane
// ---------------------------------------------------------------------------

// Build args via centralized CLI builder
const codexArgs = buildCliInvocation(codexReplSpec(resolvedModel, sandboxFlag)).args;
if (sandboxFlag) console.log(`Sandbox: ${sandboxFlag}`);
if (resolvedModel) console.log(`Model: ${resolvedModel}${modelFlag !== resolvedModel ? ` (from "${modelFlag}")` : ""}`);

logDebug("codex-skill", `Launching: model=${resolvedModel ?? "default"}, sandbox=${sandboxFlag ?? "default"}, source=${args[0]}, bytes=${promptPath ? fs.statSync(promptPath).size : 0}`);

const result = await launchDriverInTmuxOrFallback({
  toolName: "codex",
  mode: "repl",
  args: codexArgs,
  promptPath,
  sendPromptInRepl: true,
  allowExecFallback: false,
});

// Cleanup temp file after injection
if (tempFile) {
  try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
}

if (!result.launched) {
  logWarn("codex-skill", `Launch failed: ${result.reason}`);
  eprint(`Error: Failed to launch Codex. ${result.reason ?? ""}`);
  process.exit(1);
}

// Log injection diagnostics
const diag = result.sendDiagnostics;
if (diag) {
  if (diag.success) {
    logDebug("codex-skill", `Injection OK: promptWait=${diag.promptWaitMs}ms, retrySent=${diag.retrySent}`);
  } else {
    logWarn("codex-skill", `Injection failed at ${diag.failedAt}: wait=${diag.promptWaitMs}ms, stderr=${diag.tmuxStderr ?? "none"}, paneTail=${diag.paneTailOnTimeout ?? "none"}`);
  }
}

if (result.paneId) {
  console.log(`Codex launched in tmux pane: ${result.paneId}`);
} else {
  console.log("Codex launched in tmux pane.");
}

if (result.reason) {
  // Partial success (e.g., launched but prompt injection failed)
  eprint(`Warning: ${result.reason}`);
}
