#!/usr/bin/env bun
/**
 * Launch Codex in a tmux pane and inject a prompt into its REPL.
 *
 * Usage:
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] plan
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] --file <path>
 *   bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] <inline text...>
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  getTmuxAvailability,
  launchDriverInTmuxOrFallback,
} from "../../../lib-ts/base/tmux-driver.js";
import { getProjectRoot } from "../../../lib-ts/base/constants.js";
import { isModelTier, resolveModelForProvider } from "../../../lib-ts/base/cli-args.js";
import { getContextBySessionId } from "../../../lib-ts/context/context-store.js";
import { findLatestPlan } from "../../../lib-ts/context/plan-manager.js";

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
  eprint("Usage: launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] plan | --file <path> | <text...>");
  process.exit(1);
}

// Extract --model and --sandbox flags before mode dispatch
let modelFlag: string | undefined;
let sandboxFlag = "disabled";
const args: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--model" && i + 1 < rawArgs.length) {
    modelFlag = rawArgs[++i];
  } else if (rawArgs[i] === "--sandbox" && i + 1 < rawArgs.length) {
    sandboxFlag = rawArgs[++i];
  } else {
    args.push(rawArgs[i]);
  }
}

if (args.length === 0) {
  eprint("Usage: launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] plan | --file <path> | <text...>");
  process.exit(1);
}

// Resolve model tier to Codex model ID
let resolvedModel: string | undefined;
if (modelFlag) {
  resolvedModel = isModelTier(modelFlag) ? resolveModelForProvider(modelFlag, "codex") : modelFlag;
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

// Build extra args for Codex CLI
const codexArgs: string[] = ["--sandbox", sandboxFlag];
console.log(`Sandbox: ${sandboxFlag}`);
if (resolvedModel) {
  codexArgs.push("--model", resolvedModel);
  console.log(`Model: ${resolvedModel}${modelFlag !== resolvedModel ? ` (from tier "${modelFlag}")` : ""}`);
}

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
  eprint(`Error: Failed to launch Codex. ${result.reason ?? ""}`);
  process.exit(1);
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
