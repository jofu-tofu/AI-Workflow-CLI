/**
 * Shared preflight health check for provider+model availability.
 * Extracted from plan-review/lib/preflight.ts for reuse by unknown hook.
 *
 * Validates that a CLI tool + model combo works by running a minimal "ping" request.
 */

import { logDebug, logWarn } from "./logger.js";
import { execFileAsync, findExecutable, getInternalSubprocessEnv } from "./subprocess-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreflightCommandConfig {
  buildArgs: (model: string) => string[];
  cliName: string;
  input: string;
}

export interface PreflightCheckResult {
  available: boolean;
  error?: string;
  latencyMs: number;
  model: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

export function classifyError(
  stderr: string,
  exitCode: null | number,
  killed: boolean,
  signal: null | string,
): string {
  if (killed || signal === "SIGTERM") return "Preflight timed out";
  if (/model.*not found|not available/i.test(stderr)) return "Model not available for this account";
  if (/rate limit|429/i.test(stderr)) return "Rate limited";
  if (/auth|api key|401/i.test(stderr)) return "Authentication failed";
  if (/quota|billing/i.test(stderr)) return "Quota/billing issue";
  return `Exit code ${exitCode}`;
}

// ---------------------------------------------------------------------------
// Single Provider+Model Check
// ---------------------------------------------------------------------------

/**
 * Check if a single provider:model combo is available.
 * Takes a PreflightCommandConfig so callers define their own CLI args.
 */
export async function checkProviderModel(
  provider: string,
  model: string,
  config: PreflightCommandConfig,
  options?: {
    hook?: string;
    timeoutMs?: number;
  },
): Promise<PreflightCheckResult> {
  const timeoutMs = options?.timeoutMs ?? 0;
  const hook = options?.hook ?? "preflight";
  const cliPath = findExecutable(config.cliName);
  if (!cliPath) {
    return { provider, model, available: false, latencyMs: 0, error: `CLI '${config.cliName}' not found on PATH` };
  }

  const start = Date.now();
  try {
    const env = getInternalSubprocessEnv();
    const result = await execFileAsync(cliPath, config.buildArgs(model), {
      input: config.input,
      timeout: timeoutMs,
      env: env as Record<string, string>,
      maxBuffer: 1 * 1024 * 1024,
      shell: process.platform === "win32",
    });

    const latencyMs = Date.now() - start;

    if (result.killed || result.signal === "SIGTERM") {
      return { provider, model, available: false, latencyMs, error: "Preflight timed out" };
    }

    if (result.exitCode !== 0) {
      const error = classifyError(result.stderr, result.exitCode, result.killed, result.signal);
      logWarn(hook, `${provider}:${model} failed: ${error} (stderr: ${result.stderr.slice(-200)})`);
      return { provider, model, available: false, latencyMs, error };
    }

    logDebug(hook, `${provider}:${model} passed (${latencyMs}ms)`);
    return { provider, model, available: true, latencyMs };
  } catch (error_) {
    const latencyMs = Date.now() - start;
    const error = error_ instanceof Error ? error_.message : String(error_);
    logWarn(hook, `${provider}:${model} exception: ${error}`);
    return { provider, model, available: false, latencyMs, error };
  }
}

