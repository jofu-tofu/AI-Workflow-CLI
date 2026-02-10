/**
 * Cross-platform atomic file writes with security.
 * Crash-safe writes by writing to temp file then renaming.
 * NOT for concurrent access — assumes single-session-per-context.
 * See SPEC.md §4
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

/**
 * Write file atomically with retry logic.
 * Creates temp file, writes, fsyncs, renames.
 * Returns [success, error].
 * See SPEC.md §4.2
 */
export function atomicWrite(
  filePath: string,
  content: string,
  maxAttempts = 2,
  backoffMs: number[] = [500, 1000],
): [boolean, string | null] {
  // Ensure parent directory exists
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const stem = path.basename(filePath, path.extname(filePath));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tmpName = `.${stem}_${crypto.randomBytes(4).toString("hex")}.tmp`;
    const tmpPath = path.join(dir, tmpName);

    try {
      // Write to temp file
      const fd = fs.openSync(tmpPath, "w");
      try {
        fs.writeSync(fd, content, undefined, "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // Set restrictive permissions (best-effort)
      try {
        fs.chmodSync(tmpPath, 0o600);
      } catch {
        // May fail on some filesystems
      }

      // Atomic rename (cross-platform on modern Node/Bun)
      fs.renameSync(tmpPath, filePath);

      return [true, null];
    } catch (e: any) {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup
      }

      if (attempt < maxAttempts - 1) {
        const waitMs = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? backoffMs[backoffMs.length - 1] ?? 500;
        sleepSync(waitMs);
      } else {
        const errType = e?.constructor?.name ?? "Error";
        const errMsg = String(e).split("\n")[0]?.slice(0, 200) ?? "";
        return [false, `${errType}: ${errMsg}`];
      }
    }
  }

  return [false, "Max retry attempts exceeded"];
}

/**
 * Append to file with retry logic.
 * For JSONL files where each line is independent.
 * See SPEC.md §4.3
 */
export function atomicAppend(
  filePath: string,
  content: string,
  maxAttempts = 2,
  backoffMs: number[] = [500, 1000],
): [boolean, string | null] {
  // Ensure parent directory exists
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const isNewFile = !fs.existsSync(filePath);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fd = fs.openSync(filePath, "a");
      try {
        fs.writeSync(fd, content, undefined, "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // Set permissions on newly created files (best-effort)
      if (isNewFile) {
        try {
          fs.chmodSync(filePath, 0o600);
        } catch {
          // May fail on some filesystems
        }
      }

      return [true, null];
    } catch (e: any) {
      if (attempt < maxAttempts - 1) {
        const waitMs = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? backoffMs[backoffMs.length - 1] ?? 500;
        sleepSync(waitMs);
      } else {
        const errType = e?.constructor?.name ?? "Error";
        const errMsg = String(e).split("\n")[0]?.slice(0, 200) ?? "";
        return [false, `${errType}: ${errMsg}`];
      }
    }
  }

  return [false, "Max retry attempts exceeded"];
}

/**
 * Synchronous sleep for retry backoff.
 * Uses Atomics.wait() for CPU-friendly blocking instead of busy-wait.
 */
function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const i32 = new Int32Array(sab);
  Atomics.wait(i32, 0, 0, ms);
}
