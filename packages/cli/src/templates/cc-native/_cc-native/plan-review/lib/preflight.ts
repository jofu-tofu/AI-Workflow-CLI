/**
 * Preflight health checks for plan review agents.
 * Validates provider+model combos work before committing agents to them.
 * Runs minimal "ping" requests in parallel per unique provider:model combo.
 */

import { logInfo, logWarn, logDebug } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable, execFileAsync, getInternalSubprocessEnv } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import type { ModelsConfig, PreflightCheckResult, PreflightReport } from "../../lib-ts/types.js";
import { claudePreflightArgs, CLAUDE_PREFLIGHT_INPUT } from "./reviewers/providers/claude-agent.js";
import { codexPreflightArgs, CODEX_PREFLIGHT_INPUT } from "./reviewers/providers/codex-agent.js";

const HOOK = "preflight";
const DEFAULT_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

interface PreflightCommandConfig {
  cliName: string;
  buildArgs: (model: string) => string[];
  input: string;
}

const PREFLIGHT_COMMANDS: Record<string, PreflightCommandConfig> = {
  claude: { cliName: "claude", buildArgs: claudePreflightArgs, input: CLAUDE_PREFLIGHT_INPUT },
  codex:  { cliName: "codex",  buildArgs: codexPreflightArgs,  input: CODEX_PREFLIGHT_INPUT },
};

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

function classifyError(stderr: string, exitCode: number | null, killed: boolean, signal: string | null): string {
  if (killed || signal === "SIGTERM") return "Preflight timed out";
  if (/model.*not found|not available/i.test(stderr)) return "Model not available for this account";
  if (/rate limit|429/i.test(stderr)) return "Rate limited";
  if (/auth|api key|401/i.test(stderr)) return "Authentication failed";
  if (/quota|billing/i.test(stderr)) return "Quota/billing issue";
  return `Exit code ${exitCode}`;
}

// ---------------------------------------------------------------------------
// Single Check
// ---------------------------------------------------------------------------

async function checkProviderModel(
  provider: string,
  model: string,
  timeoutMs: number,
): Promise<PreflightCheckResult> {
  const config = PREFLIGHT_COMMANDS[provider];
  if (!config) {
    return { provider, model, available: false, latencyMs: 0, error: `Unknown provider: ${provider}` };
  }

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
      logWarn(HOOK, `${provider}:${model} failed: ${error} (stderr: ${result.stderr.slice(-200)})`);
      return { provider, model, available: false, latencyMs, error };
    }

    logDebug(HOOK, `${provider}:${model} passed (${latencyMs}ms)`);
    return { provider, model, available: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    logWarn(HOOK, `${provider}:${model} exception: ${error}`);
    return { provider, model, available: false, latencyMs, error };
  }
}

// ---------------------------------------------------------------------------
// Run All Checks
// ---------------------------------------------------------------------------

export async function runPreflight(
  modelsConfig: ModelsConfig,
  timeoutMs?: number,
): Promise<PreflightReport> {
  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  // Collect unique provider:model combos from enabled providers
  const checks: Array<{ provider: string; model: string }> = [];
  const seen = new Set<string>();

  for (const [provider, config] of Object.entries(modelsConfig.providers)) {
    if (!config.enabled || config.models.length === 0) continue;
    if (!PREFLIGHT_COMMANDS[provider]) {
      logWarn(HOOK, `No preflight command for provider '${provider}', skipping`);
      continue;
    }
    for (const model of config.models) {
      const key = `${provider}:${model}`;
      if (!seen.has(key)) {
        seen.add(key);
        checks.push({ provider, model });
      }
    }
  }

  if (checks.length === 0) {
    logWarn(HOOK, "No provider:model combos to check");
    return { checks: [], available: new Map(), allFailed: true, totalMs: Date.now() - start };
  }

  logInfo(HOOK, `Checking ${checks.length} provider:model combo(s): ${checks.map(c => `${c.provider}:${c.model}`).join(", ")}`);

  // Run all checks in parallel
  const results = await Promise.all(
    checks.map(({ provider, model }) => checkProviderModel(provider, model, effectiveTimeout)),
  );

  // Build available map
  const available = new Map<string, Set<string>>();
  for (const r of results) {
    if (r.available) {
      if (!available.has(r.provider)) available.set(r.provider, new Set());
      available.get(r.provider)!.add(r.model);
    }
  }

  const allFailed = available.size === 0;
  const totalMs = Date.now() - start;

  // Log summary
  const passed = results.filter(r => r.available).length;
  const failed = results.filter(r => !r.available).length;
  logInfo(HOOK, `Preflight complete: ${passed} passed, ${failed} failed (${totalMs}ms)`);

  for (const r of results) {
    if (!r.available) {
      logWarn(HOOK, `  FAIL ${r.provider}:${r.model} — ${r.error}`);
    }
  }

  return { checks: results, available, allFailed, totalMs };
}
