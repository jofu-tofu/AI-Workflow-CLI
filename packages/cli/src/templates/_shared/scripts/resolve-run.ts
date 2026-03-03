#!/usr/bin/env bun
/* global Bun */
/**
 * Cross-platform project root resolver for hook and status line commands.
 *
 * Finds the project root (via git or .aiwcli/ anchor walk-up), then spawns
 * the target script with cwd set to the root. stdin/stdout/stderr pass through.
 *
 * Install:  ~/.aiwcli/bin/resolve-run.ts  (global, always findable via ~)
 * Usage:    bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/scripts/status_line.ts
 *
 * On Windows, settings.json commands use absolute paths (expanded at init time
 * by platform-commands.ts) so cmd.exe can execute them without ~ expansion.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

/**
 * Convert MSYS2/Git-Bash POSIX path to native Windows path.
 * /c/Users/foo → C:/Users/foo
 * Passes through non-MSYS paths unchanged.
 */
function fromMsysPosixPath(p: string): string {
  if (process.platform !== "win32") return p;
  const m = p.match(/^\/([a-zA-Z])\/(.*)/);
  return m ? `${m[1]!.toUpperCase()}:/${m[2]!}` : p;
}

function findProjectRoot(): string {
  // 1. git (works from unknown subdirectory of a repo)
  try {
    let root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 2000,
    }).trim();
    // MSYS2 git returns POSIX paths (/c/Users/...) that native Bun can't use
    root = fromMsysPosixPath(root);
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
const callerCwd = process.cwd();

if (!fs.existsSync(fullPath)) {
  process.stderr.write(`resolve-run: script not found: ${fullPath}\n`);
  process.exit(1);
}

// Scope FORCE_COLOR to status line only — other hooks may emit structured
// output that should not contain ANSI escape codes.
const isStatusLine = fullPath.endsWith("status_line.ts");

const result = Bun.spawnSync(["bun", fullPath, ...process.argv.slice(3)], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  cwd: root,
  env: {
    ...process.env,
    AIW_CALLER_CWD: callerCwd,
    ...(isStatusLine ? { FORCE_COLOR: process.env.FORCE_COLOR ?? "2" } : {}),
  },
});

process.exit(result.exitCode);



