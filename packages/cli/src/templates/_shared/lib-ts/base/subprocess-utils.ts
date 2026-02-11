/**
 * Subprocess environment utilities.
 * See SPEC.md §5.10
 */

import { execSync } from "node:child_process";

/**
 * Check if this is an internal subprocess call.
 * All hooks should check this and return early to prevent recursion.
 */
export function isInternalCall(): boolean {
  return process.env.AIWCLI_INTERNAL_CALL === "true";
}

/**
 * Get environment for internal subprocess calls.
 * Returns a copy of process.env with AIWCLI_INTERNAL_CALL=true.
 */
export function getInternalSubprocessEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    AIWCLI_INTERNAL_CALL: "true",
  };
}

/**
 * Find an executable on the system PATH.
 * Uses `where` on Windows, `which` on Unix.
 * Returns the first match or null if not found.
 */
export function findExecutable(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
      .trim()
      .split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Type guard for Node.js child_process exec errors.
 * ExecSync throws objects with these extra properties on non-zero exit or timeout.
 */
export interface ExecSyncError {
  killed: boolean;
  signal: string | null;
  stdout: Buffer | string;
  stderr: Buffer | string;
  status: number | null;
  message: string;
}

/** Check if an unknown error is an ExecSync error with process info. */
export function isExecSyncError(e: unknown): e is ExecSyncError {
  return (
    typeof e === "object" &&
    e !== null &&
    "killed" in e &&
    "signal" in e
  );
}
