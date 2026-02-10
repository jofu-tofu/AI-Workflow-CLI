import { execFileSync } from "node:child_process";

/**
 * Capture current git state for session snapshots.
 * All fields are optional — failures are silently ignored.
 */
export function getGitState(projectRoot: string): Record<string, any> {
  const gitState: Record<string, any> = {};
  const isWin = process.platform === "win32";
  const opts = {
    cwd: projectRoot,
    timeout: 5000,
    encoding: "utf-8" as const,
    stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    shell: isWin,
  };

  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts);
    if (branch) gitState.branch = branch.trim();
  } catch { /* non-fatal */ }

  try {
    const status = execFileSync("git", ["status", "--short"], opts);
    if (status) {
      const files = status.trim().split("\n")
        .filter(Boolean)
        .slice(0, 10)
        .map(line => line.trimStart().split(/\s+/).slice(1).join(" "));
      if (files.length > 0) gitState.uncommitted_files = files;
    }
  } catch { /* non-fatal */ }

  try {
    const log = execFileSync("git", ["log", "-1", "--oneline"], opts);
    if (log) gitState.last_commit_short = log.trim();
  } catch { /* non-fatal */ }

  return gitState;
}

/**
 * Get short git status string for display (e.g., in handoff documents).
 */
export function getGitStatusShort(projectRoot?: string): string {
  try {
    const result = execFileSync("git", ["status", "--short"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
      ...(projectRoot ? { cwd: projectRoot } : {}),
      shell: process.platform === "win32",
    });
    return result.trim() || "(no changes)";
  } catch {
    return "(git status unavailable)";
  }
}
