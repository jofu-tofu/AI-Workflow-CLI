/**
 * Preflight health checks for plan review agents.
 * Validates provider+model combos work before committing agents to them.
 * Runs minimal "ping" requests in parallel per unique provider:model combo.
 *
 * Uses shared checkProviderModel() from _shared/lib-ts/base/preflight.ts.
 * This module provides the batch orchestrator and provider registry specific
 * to the plan review pipeline.
 */

import { preflightCommandConfig } from "../../../_shared/lib-ts/base/cli-args.js";
import { logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { checkProviderModel, type PreflightCommandConfig } from "../../../_shared/lib-ts/base/preflight.js";
import type { ModelsConfig, PreflightCheckResult, PreflightReport } from "../../lib-ts/types.js";

const HOOK = "preflight";
const DEFAULT_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Provider Registry (built from centralized cli-args)
// ---------------------------------------------------------------------------

const PREFLIGHT_COMMANDS: Record<string, PreflightCommandConfig> = {
  claude: preflightCommandConfig("claude"),
  codex:  preflightCommandConfig("codex"),
};

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

  // Run all checks in parallel (pass provider-specific config from registry)
  const results = await Promise.all(
    checks.map(({ provider, model }) =>
      checkProviderModel(provider, model, PREFLIGHT_COMMANDS[provider]!, effectiveTimeout, HOOK),
    ),
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
