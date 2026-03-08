#!/usr/bin/env bun
/**
 * Cross-platform project root resolver for hook and status line commands.
 *
 * Finds the project root, sets cwd, then dynamically imports the target script
 * in-process (no second bun spawn). stdin/stdout/stderr pass through naturally.
 *
 * Root detection strategy (fastest first):
 *   1. Derive from this script's own location (O(1) — no I/O)
 *   2. Walk up from cwd to find .aiwcli/ anchor (O(depth) — a few stat calls)
 *
 * Usage:    bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/hook.ts
 */
import * as fs from "node:fs";
import path from "node:path";

function findProjectRoot(): string {
  // 1. Derive from script location: .aiwcli/_core/scripts/resolve-run.ts → 3 levels up
  const derived = path.resolve(import.meta.dir, "..", "..", "..");
  if (fs.existsSync(path.join(derived, ".aiwcli"))) return derived;

  // 2. Walk up from cwd to find .aiwcli/ anchor
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".aiwcli"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd(); // last resort
}

const target = process.argv[2];
if (!target) {
  process.stderr.write("resolve-run: missing script path argument\n");
  process.exit(1);
}

const root = findProjectRoot();
const fullPath = path.resolve(root, target);

if (!fs.existsSync(fullPath)) {
  process.stderr.write(`resolve-run: script not found: ${fullPath}\n`);
  process.exit(1);
}

// Set up environment before importing the hook
process.env.AIW_CALLER_CWD = process.cwd();

// Scope FORCE_COLOR to status line only — other hooks may emit structured
// output that should not contain ANSI escape codes.
if (fullPath.endsWith("status_line.ts")) {
  process.env.FORCE_COLOR ??= "2";
}

// Strip the consumed target-script argument so the imported script sees only
// its own flags in process.argv.slice(2).  Without this, the script path
// leaks into the args and can end up as literal prompt text sent to agents.
process.argv.splice(2, 1);

process.chdir(root);
await import(fullPath);



