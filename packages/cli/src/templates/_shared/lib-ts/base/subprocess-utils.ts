/**
 * Subprocess environment utilities.
 * See SPEC.md §5.10
 */

import { execSync, execFile } from "node:child_process";

/**
 * Check if this is an internal subprocess call.
 * All hooks should check this and return early to prevent recursion.
 */
export function isInternalCall(): boolean {
  return process.env.AIWCLI_INTERNAL_CALL === "true";
}

/**
 * Get environment for internal subprocess calls.
 * Returns a copy of process.env with AIWCLI_INTERNAL_CALL=true and
 * Claude Code nesting-detection env vars removed so subprocess
 * claude instances can run without being blocked.
 */
export function getInternalSubprocessEnv(): Record<string, string | undefined> {
  const env = {
    ...process.env,
    AIWCLI_INTERNAL_CALL: "true",
  };
  // Explicitly delete vars that block subprocess calls (set to undefined does not work)
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}
/**
 * Find an executable on the system PATH.
 * Uses `where` on Windows, `which` on Unix.
 * On Windows, prefers .cmd/.exe over extensionless shims since
 * execFileSync cannot spawn extensionless shell scripts.
 * Returns the first match or null if not found.
 */
export function findExecutable(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const lines = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], shell: true })
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return null;

    // On Windows, `where` may return an extensionless shim first (e.g. npm creates
    // both `claude` and `claude.cmd`). execFileSync can't spawn the extensionless
    // one, so prefer .cmd or .exe.
    if (process.platform === "win32") {
      const preferred = lines.find((l) => /\.(cmd|exe)$/i.test(l));
      return preferred ?? lines[0] ?? null;
    }

    return lines[0] ?? null;
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

/**
 * Quote a string for use as a cmd.exe argument when shell: true.
 * Wraps in double quotes and escapes inner double quotes as "".
 * On non-Windows platforms, returns the string unchanged (execFile
 * handles quoting automatically without shell).
 */
export function shellQuoteWin(arg: string): string {
  if (process.platform !== "win32") return arg;
  return '"' + arg.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// Async Subprocess Execution
// ---------------------------------------------------------------------------

/**
 * Result from an async subprocess execution.
 * Never throws — callers inspect fields to determine outcome.
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  killed: boolean;
  signal: string | null;
}

/** Options for execFileAsync. */
export interface ExecAsyncOptions {
  /** Data piped to the child's stdin. */
  input?: string;
  /** Timeout in milliseconds (not seconds). */
  timeout?: number;
  /** Environment variables for the child process. */
  env?: Record<string, string | undefined>;
  /** Maximum bytes on stdout/stderr. Default: 10 MB. */
  maxBuffer?: number;
  /** Use shell for execution. Required on Windows for .cmd files. */
  shell?: boolean;
}

/**
 * Async subprocess execution that does NOT block the event loop.
 * Drop-in replacement for execFileSync in Promise-based parallel patterns.
 *
 * Returns ExecResult on both success and non-zero exit.
 * On timeout: result.killed = true, result.signal = "SIGTERM".
 * On spawn failure: result.exitCode = -1, result.stderr contains error.
 */
export function execFileAsync(
  file: string,
  args: string[],
  options?: ExecAsyncOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf-8",
        timeout: options?.timeout ?? 0,
        env: options?.env as NodeJS.ProcessEnv,
        maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
        shell: options?.shell,
      },
      (error, stdout, stderr) => {
        if (error) {
          // execFile callback error includes process exit info
          const errObj = error as unknown as Record<string, unknown>;
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            exitCode: typeof errObj.code === "number" ? errObj.code : (error as any).status ?? 1,
            killed: Boolean(errObj.killed),
            signal: typeof errObj.signal === "string" ? errObj.signal : null,
          });
        } else {
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            exitCode: 0,
            killed: false,
            signal: null,
          });
        }
      },
    );

    // Pipe input to stdin if provided
    if (options?.input != null && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}
