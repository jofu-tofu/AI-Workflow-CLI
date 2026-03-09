#!/usr/bin/env node

/**
 * install-hooks.mjs
 *
 * Pure Node.js ESM replacement for install-hooks.sh.
 * Writes a cross-platform shell shim to .git/hooks/pre-commit that delegates
 * to scripts/pre-commit-gate.mjs (or .sh, whichever exists).
 *
 * No external dependencies.
 */

import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const hooksDir = join(repoRoot, ".git", "hooks");
const hookTarget = join(hooksDir, "pre-commit");
const gateScriptName = existsSync(join(repoRoot, "scripts", "pre-commit-gate.mjs"))
  ? "pre-commit-gate.mjs"
  : existsSync(join(repoRoot, "scripts", "pre-commit-gate.sh"))
    ? "pre-commit-gate.sh"
    : null;

// 1. Check that .git/hooks exists
if (!existsSync(hooksDir)) {
  console.log("[install-hooks] .git/hooks directory not found — skipping");
  process.exit(0);
}

// 2. Check if pre-commit hook already exists (file or symlink)
if (existsSync(hookTarget)) {
  console.log("[install-hooks] pre-commit hook already exists — skipping");
  process.exit(0);
}

if (!gateScriptName) {
  console.error("[install-hooks] no pre-commit gate script found in scripts/");
  process.exit(1);
}

const gateCommand = gateScriptName.endsWith(".mjs")
  ? `node "$(dirname "$0")/../../scripts/${gateScriptName}"`
  : `"$(dirname "$0")/../../scripts/${gateScriptName}"`;

// 3. Write a portable shell shim that delegates to the available gate script.
//    Git for Windows ships Git Bash, so #!/bin/sh works everywhere.
const hookContent = `#!/bin/sh
${gateCommand}
`;

writeFileSync(hookTarget, hookContent, { mode: 0o755 });

// Ensure executable on platforms where writeFileSync mode is ignored
try {
  chmodSync(hookTarget, 0o755);
} catch {
  // chmod may fail on Windows; the file is still usable there
}

console.log(`[install-hooks] Wrote pre-commit hook: ${hookTarget}`);
