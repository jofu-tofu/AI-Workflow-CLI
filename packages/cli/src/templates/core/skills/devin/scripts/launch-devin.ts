#!/usr/bin/env bun
/**
 * Launch Devin in a visible pane (tmux/window) and pass the prompt at startup.
 *
 * Usage:
 *   bun launch-devin.ts [--model <model>] [--no-watch] [--context <id>] [--prompt <text>] plan
 *   bun launch-devin.ts [--model <model>] [--no-watch] [--context <id>] [--prompt <text>] --file <path>
 *   bun launch-devin.ts [--model <model>] [--no-watch] [--context <id>] [--prompt <text>] <inline text...>
 */
import * as fs from "node:fs";
import path from "node:path";

import { findLatestPlan } from "../../../lib-ts/context/plan-manager.js";
import {
  cleanupSentinel,
  eprint,
  findLatestPlanByMtime,
  getWellKnownSummaryPath,
  resolveContextForLaunch,
  writeFileRefPromptFile,
  writeInlinePromptFile,
} from "../../../lib-ts/runtime/agent-launcher.js";
import { aiwLaunch } from "../../../lib-ts/runtime/aiw-cli.js";
import { resolveDevinModel, buildCliInvocation, type CliArgSpec } from "../../../lib-ts/runtime/cli-args.js";
import { getProjectRoot } from "../../../lib-ts/runtime/constants.js";
import { logDebug, logWarn } from "../../../lib-ts/runtime/logger.js";
import { DEVIN_MODELS } from "../../../lib-ts/runtime/models.js";
import { displayPath } from "../../../lib-ts/runtime/utils.js";

/** Devin-specific model abbreviations. Checked before tier resolution. */
const DEVIN_ALIASES: Record<string, string> = {
  swe: DEVIN_MODELS.swe,
  gpt: DEVIN_MODELS.gpt,
  opus: DEVIN_MODELS.opus,
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  eprint("Usage: launch-devin.ts [--model <model>] [--no-watch] [--context <id>] [--prompt <text>] plan | --file <path> | <text...>");
  process.exit(1);
}

let modelFlag: string | undefined;
let contextFlag: string | undefined;
let extraPrompt: string | undefined;
let taskId: string | undefined;
let watch = true;
const args: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--model" && i + 1 < rawArgs.length) {
    modelFlag = rawArgs[++i];
  } else if (rawArgs[i] === "--context" && i + 1 < rawArgs.length) {
    contextFlag = rawArgs[++i];
  } else if (rawArgs[i] === "--prompt" && i + 1 < rawArgs.length) {
    extraPrompt = rawArgs[++i];
  } else if (rawArgs[i] === "--task-id" && i + 1 < rawArgs.length) {
    taskId = rawArgs[++i];
  } else if (rawArgs[i] === "--no-watch") {
    watch = false;
  } else if (rawArgs[i] === "--prompt") {
    eprint("Error: --prompt requires a text argument.");
    process.exit(1);
  } else {
    args.push(rawArgs[i]);
  }
}

if (args.length === 0) {
  eprint("Usage: launch-devin.ts [--model <model>] [--no-watch] [--context <id>] [--prompt <text>] plan | --file <path> | <text...>");
  process.exit(1);
}

// Resolve model: alias first, then tier/pass-through
let resolvedModel: string | undefined;
if (modelFlag) {
  const lower = modelFlag.toLowerCase();
  resolvedModel = lower in DEVIN_ALIASES
    ? DEVIN_ALIASES[lower]
    : resolveDevinModel(modelFlag);
}

let promptPath: string | null = null;

const projectRoot = getProjectRoot(process.cwd());
const ctx = resolveContextForLaunch(contextFlag, projectRoot);

if (args[0] === "plan") {
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
    tempFilePrefix: "devin",
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
    tempFilePrefix: "devin",
  });

} else {
  promptPath = writeInlinePromptFile({
    text: args.join(" "),
    extraPrompt,
    ctx,
    projectRoot,
    tempFilePrefix: "devin",
  });
}

// ---------------------------------------------------------------------------
// Launch Devin
// ---------------------------------------------------------------------------

const launchCwd = process.env.AIW_CALLER_CWD?.trim() || process.cwd();

// Generate task ID if not provided by caller.
if (!taskId) {
  taskId = `${Date.now()}-${process.pid}`;
}
const wellKnownPath = getWellKnownSummaryPath("devin", taskId, projectRoot);
console.log(`Task ID: ${taskId}`);
console.log(`Summary will be at: ${wellKnownPath}`);

if (resolvedModel) console.log(`Model: ${resolvedModel}${modelFlag !== resolvedModel ? ` (from "${modelFlag}")` : ""}`);

logDebug("devin-skill", `Launching: model=${resolvedModel ?? "default"}, taskId=${taskId}, extraPrompt=${Boolean(extraPrompt)}, source=${args[0]}, bytes=${promptPath ? fs.statSync(promptPath).size : 0}`);

const launchStartedAtMs = Date.now();

const result = await aiwLaunch({
  devin: true,
  wait: false,
  json: true,
  split: "auto",
  promptPath: promptPath ?? undefined,
  cwd: launchCwd,
});

if (!result.launched) {
  // Fallback: non-interactive devin -p mode
  eprint(`Note: Pane launch unavailable (${result.reason ?? "unknown"}). Using devin exec mode (non-interactive).`);

  const execSpec: CliArgSpec = {
    provider: "devin",
    model: resolvedModel ?? DEVIN_MODELS.swe,
    mode: "print",
    extraArgs: promptPath ? ["--prompt-file", promptPath] : [],
  };
  const execInv = buildCliInvocation(execSpec);

  const { execFileAsync } = await import("../../../lib-ts/runtime/subprocess-utils.js");
  const execResult = await execFileAsync(execInv.cliName, execInv.args, {
    env: { ...process.env, ...execInv.env },
    shell: process.platform === "win32",
  });

  if (execResult.stdout) console.log(execResult.stdout);
  if (execResult.exitCode !== 0) {
    eprint(`Devin exec exited with code ${execResult.exitCode}`);
    if (execResult.stderr) eprint(execResult.stderr);
    process.exit(1);
  }

  console.log("Devin exec completed (non-interactive mode).");
  process.exit(0);
}

const backendLabel = result.backend === "tmux" ? "tmux pane" : result.backend === "psmux" ? "psmux pane" : "window";
if (result.paneId) {
  console.log(`Devin launched in ${backendLabel}: ${result.paneId}`);
} else {
  console.log(`Devin launched in ${backendLabel}.`);
}

if (watch && (result.paneId || result.sentinelPath)) {
  try {
    const {
      SUMMARY_UNAVAILABLE_MESSAGE,
      summarizeDevinSession,
      waitForPaneClose,
      persistSummary,
    } = await import("../lib/devin-watcher.js");

    await waitForPaneClose({
      backend: result.backend,
      paneId: result.paneId,
      sentinelPath: result.sentinelPath,
    });

    const summary = (await summarizeDevinSession(projectRoot, launchStartedAtMs, result.paneId))
      ?? SUMMARY_UNAVAILABLE_MESSAGE;
    const summaryPath = persistSummary(summary, "devin", undefined, taskId, projectRoot);

    console.log("\n--- Devin Session Summary ---");
    console.log(summary);
    console.log(`\n[well_known_summary:${wellKnownPath}]`);
    if (summaryPath) {
      console.log(`[summary_file:${summaryPath}]`);
    }
  } catch (error) {
    logWarn("devin-skill", `Watch flow failed: ${String(error)}`);
    const { persistSummary: persistFallback } = await import("../lib/devin-watcher.js");
    const fallbackMsg = "Devin session completed. Summary unavailable (watch error).";
    const fallbackPath = persistFallback(fallbackMsg, "devin", undefined, taskId, projectRoot);
    console.log("\n--- Devin Session Summary ---");
    console.log(fallbackMsg);
    console.log(`\n[well_known_summary:${wellKnownPath}]`);
    if (fallbackPath) {
      console.log(`[summary_file:${fallbackPath}]`);
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
