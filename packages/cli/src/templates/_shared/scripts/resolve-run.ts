#!/usr/bin/env bun
/**
 * Cross-platform project root resolver for hook and status line commands.
 *
 * Finds the project root (via git or .aiwcli/ anchor walk-up), then spawns
 * the target script with cwd set to the root. stdin/stdout/stderr pass through.
 *
 * Install:  ~/.aiwcli/bin/resolve-run.ts  (global, always findable via ~)
 * Usage:    bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/scripts/status_line.ts
 *
 * Works on: bash, zsh, PowerShell, cmd (anywhere bun + ~ expansion works)
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

function findProjectRoot(): string {
  // 1. git (works from any subdirectory of a repo)
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 2000,
    }).trim();
    if (root && fs.existsSync(path.join(root, ".aiwcli"))) return root;
  } catch { /* not a git repo or git not available */ }

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

const result = Bun.spawnSync(["bun", fullPath], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  cwd: root,
});

process.exit(result.exitCode);
