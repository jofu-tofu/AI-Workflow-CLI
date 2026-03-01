#!/usr/bin/env bun
/**
 * Launch Codex in a tmux pane and inject a prompt into its REPL.
 *
 * Usage:
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] plan
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] --file <path>
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] <inline text...>
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
import { logDebug, logWarn } from "../../../lib-ts/base/logger.js";
import { getContextBySessionId } from "../../../lib-ts/context/context-store.js";
import { findLatestPlan } from "../../../lib-ts/context/plan-manager.js";

/** Codex-specific model abbreviations. Checked before tier resolution. */
const CODEX_ALIASES: Record<string, string> = {
  spark: "gpt-5.3-codex-spark",
  codex: "gpt-5.3-codex",
  gpt: "gpt-5.2",
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
  eprint("Usage: launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] plan | --file <path> | <text...>");
  process.exit(1);
}

// Extract --model and --sandbox flags before mode dispatch
let modelFlag: string | undefined;
let sandboxFlag: CodexSandbox | undefined;
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
  } else {
    args.push(rawArgs[i]);
  }
}

if (args.length === 0) {
  eprint("Usage: launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] plan | --file <path> | <text...>");
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

if (args[0] === "plan") {
  // Plan discovery: context system first, mtime fallback second
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let planPath: string | null = null;

  if (sessionId) {
    const ctx = getContextBySessionId(sessionId, projectRoot);
    if (ctx) {
      planPath = findLatestPlan(ctx.id, projectRoot);
    }
  }

  if (!planPath) {
    planPath = findLatestPlanByMtime(projectRoot);
  }

  if (!planPath) {
    eprint("Error: No plan found. Create a plan first (use plan mode), then run this command.");
    process.exit(1);
  }

  promptPath = planPath;
  console.log(`Found plan: ${planPath}`);

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
