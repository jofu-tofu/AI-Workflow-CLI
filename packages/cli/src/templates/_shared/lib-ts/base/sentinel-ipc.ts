import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface SentinelIpcPaths {
  tmpDir: string;
  inputPath: string;
  stdoutPath: string;
  stderrPath: string;
  sentinelPath: string;
}

function sanitizePrefix(prefix: string): string {
  return prefix.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}

export function createSentinelIpcPaths(prefix: string): SentinelIpcPaths {
  const safePrefix = sanitizePrefix(prefix);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${safePrefix}-`));

  return {
    tmpDir,
    inputPath: path.join(tmpDir, "input.txt"),
    stdoutPath: path.join(tmpDir, "stdout.txt"),
    stderrPath: path.join(tmpDir, "stderr.txt"),
    sentinelPath: path.join(tmpDir, "sentinel.txt"),
  };
}

export function buildShellCaptureScript(
  command: string,
  paths: Pick<SentinelIpcPaths, "inputPath" | "stdoutPath" | "stderrPath" | "sentinelPath">,
  quote: (input: string) => string,
): string {
  return [
    command,
    `< ${quote(paths.inputPath)}`,
    `> ${quote(paths.stdoutPath)}`,
    `2> ${quote(paths.stderrPath)}`,
    `; echo $? > ${quote(paths.sentinelPath)}`,
  ].join(" ");
}

export async function waitForSentinelFile(
  sentinelPath: string,
  timeoutMs: number,
  pollIntervalMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(sentinelPath)) return true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  return fs.existsSync(sentinelPath);
}

export function readSentinelExitCode(sentinelPath: string, fallback = 1): number {
  if (!fs.existsSync(sentinelPath)) return fallback;

  const raw = fs.readFileSync(sentinelPath, "utf-8").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readTextIfExists(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

export function cleanupSentinelIpc(paths: Pick<SentinelIpcPaths, "tmpDir">): void {
  try {
    fs.rmSync(paths.tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}

export function cleanupSentinelPath(sentinelPath: string | undefined): void {
  if (!sentinelPath) return;

  try {
    fs.rmSync(path.dirname(sentinelPath), { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}
