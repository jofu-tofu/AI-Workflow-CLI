/**
 * Tests for preflight health checks.
 * Mocks subprocess execution to test error classification, parallel execution,
 * and aggregation logic without hitting real CLIs.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { PreflightReport } from "../../../lib-ts/types.js";
import type { ModelsConfig } from "../../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// We need to mock subprocess-utils before importing preflight
const mockFindExecutable = mock(() => "/usr/bin/claude" as string | null);
const mockExecFileAsync = mock(() =>
  Promise.resolve({
    stdout: "ok",
    stderr: "",
    exitCode: 0 as number | null,
    killed: false,
    signal: null as string | null,
  }),
);

mock.module("../../../../_core/lib-ts/runtime/subprocess-utils.js", () => ({
  findExecutable: mockFindExecutable,
  execFileAsync: mockExecFileAsync,
  isInternalCall: () => false,
  getInternalSubprocessEnv: () => ({}),
  normalizePathForCli: (p: string) => p,
  shellQuoteWin: (arg: string) => arg,
  isExecSyncError: () => false,
}));

// Mock logger to suppress output during tests
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

// Now import the module under test
const { runPreflight } = await import("../preflight.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModelsConfig(providers: Record<string, { enabled: boolean; models: string[] }>): ModelsConfig {
  return { providers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runPreflight", () => {
  beforeEach(() => {
    mockFindExecutable.mockReset();
    mockExecFileAsync.mockReset();
    // Default: CLI found, exit 0
    mockFindExecutable.mockReturnValue("/usr/bin/mock-cli");
    mockExecFileAsync.mockResolvedValue({
      stdout: "ok", stderr: "", exitCode: 0, killed: false, signal: null,
    });
  });

  it("returns all available when both providers pass", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(false);
    expect(report.available.size).toBe(2);
    expect(report.available.get("claude")?.has("sonnet")).toBe(true);
    expect(report.available.get("codex")?.has("codex-mini-latest")).toBe(true);
    expect(report.checks.length).toBe(2);
  });

  it("marks provider unavailable on non-zero exit", async () => {
    mockExecFileAsync.mockImplementation(async (file: string, args: string[]) => {
      // Claude succeeds, codex fails
      const isCodex = args.includes("exec");
      return {
        stdout: isCodex ? "" : "ok",
        stderr: isCodex ? "model not found" : "",
        exitCode: isCodex ? 1 : 0,
        killed: false,
        signal: null,
      };
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(false);
    expect(report.available.has("claude")).toBe(true);
    expect(report.available.has("codex")).toBe(false);

    const codexCheck = report.checks.find(c => c.provider === "codex");
    expect(codexCheck?.available).toBe(false);
    expect(codexCheck?.error).toBe("Model not available for this account");
  });

  it("reports allFailed when all providers fail", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "auth error 401", exitCode: 1, killed: false, signal: null,
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    expect(report.available.size).toBe(0);
    expect(report.checks.every(c => !c.available)).toBe(true);
  });

  it("reports allFailed when no providers are enabled", async () => {
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    expect(report.checks.length).toBe(0);
  });

  it("skips provider when CLI not found", async () => {
    mockFindExecutable.mockReturnValue(null);

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    const check = report.checks[0];
    expect(check?.available).toBe(false);
    expect(check?.error).toContain("not found on PATH");
  });

  it("deduplicates same provider:model combo", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "sonnet"] },
    });

    const report = await runPreflight(config);

    // Should only check once despite duplicate model
    expect(report.checks.length).toBe(1);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
  });

  it("classifies timeout errors", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "", exitCode: null, killed: true, signal: "SIGTERM",
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.available).toBe(false);
    expect(check?.error).toBe("Preflight timed out");
  });

  it("classifies rate limit errors", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "rate limit exceeded (429)", exitCode: 1, killed: false, signal: null,
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.error).toBe("Rate limited");
  });

  it("classifies auth errors", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "invalid api key", exitCode: 1, killed: false, signal: null,
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.error).toBe("Authentication failed");
  });

  it("classifies quota errors", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "billing quota exceeded", exitCode: 1, killed: false, signal: null,
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.error).toBe("Quota/billing issue");
  });

  it("falls back to exit code for unknown errors", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "", stderr: "something unexpected", exitCode: 42, killed: false, signal: null,
    });

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.error).toBe("Exit code 42");
  });

  it("handles multiple models per provider", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "opus"] },
    });

    const report = await runPreflight(config);

    expect(report.checks.length).toBe(2);
    expect(report.available.get("claude")?.size).toBe(2);
  });

  it("passes timeout to execFileAsync", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    await runPreflight(config, 5000);

    const callArgs = mockExecFileAsync.mock.calls[0];
    expect(callArgs?.[2]?.timeout).toBe(5000);
  });

  it("handles exception from execFileAsync", async () => {
    mockExecFileAsync.mockRejectedValue(new Error("spawn ENOENT"));

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.allFailed).toBe(true);
    const check = report.checks[0];
    expect(check?.available).toBe(false);
    expect(check?.error).toContain("spawn ENOENT");
  });

  it("skips unknown provider names", async () => {
    const config = makeModelsConfig({
      unknown_provider: { enabled: true, models: ["some-model"] },
    });

    const report = await runPreflight(config);

    // No execFileAsync calls since provider isn't in registry
    expect(report.allFailed).toBe(true);
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it("records latencyMs for each check", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    const check = report.checks[0];
    expect(check?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records totalMs for the full run", async () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const report = await runPreflight(config);

    expect(report.totalMs).toBeGreaterThanOrEqual(0);
  });
});
