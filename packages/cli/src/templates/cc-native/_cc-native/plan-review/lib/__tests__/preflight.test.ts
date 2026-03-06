/**
 * Tests for preflight health checks.
 * Tests pure functions (collectPreflightChecks, buildPreflightReport) directly.
 * Tests classifyError from shared preflight module directly.
 * Slim integration tests for runPreflight mock only checkProviderModel (network boundary).
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ModelsConfig, PreflightCheckResult, PreflightReport } from "../../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Mock logger for noise suppression only (no assertions on logger calls)
// ---------------------------------------------------------------------------

mock.module("../../../../_core/lib-ts/runtime/logger.js", () => ({
  hookLog: () => {},
  logDebug: () => {},
  logInfo: () => {},
  logWarn: () => {},
  logError: () => {},
  logBlocking: () => {},
  logDiagnostic: () => {},
  logHookError: () => {},
  setSessionId: () => {},
  setContextPath: () => {},
  getContextPath: () => null,
}));

// ---------------------------------------------------------------------------
// Import pure functions under test (no mocks needed)
// ---------------------------------------------------------------------------

const { collectPreflightChecks, buildPreflightReport } = await import("../preflight.js");
const { classifyError } = await import("../../../../_core/lib-ts/runtime/preflight.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModelsConfig(providers: Record<string, { enabled: boolean; models: string[] }>): ModelsConfig {
  return { providers };
}

// ---------------------------------------------------------------------------
// collectPreflightChecks — pure, zero mocks
// ---------------------------------------------------------------------------

describe("collectPreflightChecks", () => {
  const knownProviders = new Set(["claude", "codex"]);

  it("collects enabled providers with known names", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const { checks, skippedProviders } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([
      { provider: "claude", model: "sonnet" },
      { provider: "codex", model: "codex-mini-latest" },
    ]);
    expect(skippedProviders).toEqual([]);
  });

  it("skips disabled providers", () => {
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const { checks } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([{ provider: "codex", model: "codex-mini-latest" }]);
  });

  it("skips providers with empty model lists", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: [] },
    });

    const { checks } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([]);
  });

  it("reports unknown providers in skippedProviders", () => {
    const config = makeModelsConfig({
      unknown_provider: { enabled: true, models: ["some-model"] },
    });

    const { checks, skippedProviders } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([]);
    expect(skippedProviders).toEqual(["unknown_provider"]);
  });

  it("deduplicates same provider:model combo", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "sonnet"] },
    });

    const { checks } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([{ provider: "claude", model: "sonnet" }]);
  });

  it("collects multiple models per provider", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "opus"] },
    });

    const { checks } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([
      { provider: "claude", model: "sonnet" },
      { provider: "claude", model: "opus" },
    ]);
  });

  it("returns empty checks when no providers are enabled", () => {
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
    });

    const { checks, skippedProviders } = collectPreflightChecks(config, knownProviders);

    expect(checks).toEqual([]);
    expect(skippedProviders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildPreflightReport — pure, zero mocks
// ---------------------------------------------------------------------------

describe("buildPreflightReport", () => {
  it("builds available map from passing results", () => {
    const results = [
      { provider: "claude", model: "sonnet", available: true, latencyMs: 50 },
      { provider: "codex", model: "codex-mini-latest", available: true, latencyMs: 30 },
    ];

    const report = buildPreflightReport(results, 100);

    expect(report.allFailed).toBe(false);
    expect(report.available.size).toBe(2);
    expect(report.available.get("claude")?.has("sonnet")).toBe(true);
    expect(report.available.get("codex")?.has("codex-mini-latest")).toBe(true);
    expect(report.totalMs).toBe(100);
  });

  it("reports allFailed when all results fail", () => {
    const results = [
      { provider: "claude", model: "sonnet", available: false, error: "Auth failed", latencyMs: 10 },
      { provider: "codex", model: "codex-mini", available: false, error: "Timeout", latencyMs: 15000 },
    ];

    const report = buildPreflightReport(results, 15000);

    expect(report.allFailed).toBe(true);
    expect(report.available.size).toBe(0);
  });

  it("reports allFailed=true for empty results", () => {
    const report = buildPreflightReport([], 5);

    expect(report.allFailed).toBe(true);
    expect(report.available.size).toBe(0);
    expect(report.checks).toEqual([]);
  });

  it("groups multiple models under same provider", () => {
    const results = [
      { provider: "claude", model: "sonnet", available: true, latencyMs: 50 },
      { provider: "claude", model: "opus", available: true, latencyMs: 80 },
    ];

    const report = buildPreflightReport(results, 80);

    expect(report.available.get("claude")?.size).toBe(2);
    expect(report.available.get("claude")?.has("sonnet")).toBe(true);
    expect(report.available.get("claude")?.has("opus")).toBe(true);
  });

  it("excludes failed models from available map", () => {
    const results = [
      { provider: "claude", model: "sonnet", available: true, latencyMs: 50 },
      { provider: "claude", model: "opus", available: false, error: "Rate limited", latencyMs: 10 },
    ];

    const report = buildPreflightReport(results, 50);

    expect(report.allFailed).toBe(false);
    expect(report.available.get("claude")?.has("sonnet")).toBe(true);
    expect(report.available.get("claude")?.has("opus")).toBe(false);
  });

  it("preserves check results in output", () => {
    const results = [
      { provider: "claude", model: "sonnet", available: true, latencyMs: 42 },
    ];

    const report = buildPreflightReport(results, 42);

    expect(report.checks.length).toBe(1);
    expect(report.checks[0]!.provider).toBe("claude");
    expect(report.checks[0]!.model).toBe("sonnet");
    expect(report.checks[0]!.available).toBe(true);
    expect(report.checks[0]!.latencyMs).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// classifyError — pure, zero mocks (from shared _core/lib-ts/runtime/preflight.ts)
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  it("classifies timeout (killed + SIGTERM)", () => {
    expect(classifyError("", null, true, "SIGTERM")).toBe("Preflight timed out");
  });

  it("classifies timeout (killed without signal)", () => {
    expect(classifyError("", null, true, null)).toBe("Preflight timed out");
  });

  it("classifies model not found", () => {
    expect(classifyError("model not found", 1, false, null)).toBe("Model not available for this account");
  });

  it("classifies not available", () => {
    expect(classifyError("not available for your plan", 1, false, null)).toBe("Model not available for this account");
  });

  it("classifies rate limit by text", () => {
    expect(classifyError("rate limit exceeded", 1, false, null)).toBe("Rate limited");
  });

  it("classifies rate limit by 429", () => {
    expect(classifyError("error 429", 1, false, null)).toBe("Rate limited");
  });

  it("classifies auth errors", () => {
    expect(classifyError("invalid api key", 1, false, null)).toBe("Authentication failed");
  });

  it("classifies 401 as auth", () => {
    expect(classifyError("HTTP 401 Unauthorized", 1, false, null)).toBe("Authentication failed");
  });

  it("classifies quota errors", () => {
    expect(classifyError("billing quota exceeded", 1, false, null)).toBe("Quota/billing issue");
  });

  it("falls back to exit code for unknown errors", () => {
    expect(classifyError("something unexpected", 42, false, null)).toBe("Exit code 42");
  });
});

// ---------------------------------------------------------------------------
// runPreflight — slim integration (mock only checkProviderModel)
// ---------------------------------------------------------------------------

describe("runPreflight", () => {
  // Mock the network boundary: checkProviderModel and subprocess-utils
  const mockCheckProviderModel = mock(
    async (provider: string, model: string) =>
      ({ provider, model, available: true, latencyMs: 10 }) as PreflightCheckResult,
  );

  const mockFindExecutable = mock(() => "/usr/bin/mock-cli" as string | null);

  // Re-mock the modules to inject our mock for integration tests
  mock.module("../../../../_core/lib-ts/runtime/preflight.js", () => ({
    checkProviderModel: mockCheckProviderModel,
    classifyError,
  }));

  mock.module("../../../../_core/lib-ts/runtime/subprocess-utils.js", () => ({
    findExecutable: mockFindExecutable,
    execFileAsync: mock(() => Promise.resolve({ stdout: "ok", stderr: "", exitCode: 0, killed: false, signal: null })),
    isInternalCall: () => false,
    getInternalSubprocessEnv: () => ({}),
    normalizePathForCli: (p: string) => p,
    shellQuoteWin: (arg: string) => arg,
    isExecSyncError: () => false,
  }));

  // Re-import to pick up the mocked checkProviderModel
  let runPreflight: (config: ModelsConfig, timeoutMs?: number) => Promise<PreflightReport>;

  beforeEach(async () => {
    mockCheckProviderModel.mockReset();
    mockCheckProviderModel.mockImplementation(
      async (provider: string, model: string) =>
        ({ provider, model, available: true, latencyMs: 10 }) as PreflightCheckResult,
    );
    // Force fresh import to pick up mocks
    const mod = await import("../preflight.js");
    runPreflight = mod.runPreflight;
  });

  it("returns available report when checks pass", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(false);
    expect(report.available.size).toBe(2);
  });

  it("reports allFailed when all checks fail", async () => {
    mockCheckProviderModel.mockImplementation(
      async (provider: string, model: string) =>
        ({ provider, model, available: false, latencyMs: 10, error: "Auth failed" }) as PreflightCheckResult,
    );

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    expect(report.available.size).toBe(0);
  });

  it("returns empty checks when no providers enabled", async () => {
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    expect(report.checks.length).toBe(0);
  });
});
