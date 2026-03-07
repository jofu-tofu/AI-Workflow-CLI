/**
 * Integration test for OrchestratorClaudeAgent via runOrchestrator().
 * Tests the migration from direct execFileAsync to BaseCliAgent framework.
 *
 * Run: bun test .aiwcli/_cc-native/lib-ts/__tests__/orchestrator-agent.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentConfig, OrchestratorConfig, OrchestratorResult } from "../types.js";

// Mock subprocess-utils to avoid actual CLI invocations
vi.mock("../../../_shared/lib-ts/base/subprocess-utils.js", () => ({
  findExecutable: vi.fn(),
  execFileAsync: vi.fn(),
  getInternalSubprocessEnv: vi.fn(() => ({})),
  shellQuoteWin: vi.fn((s: string) => s),
}));

// Mock logger to suppress output
vi.mock("../../../_shared/lib-ts/base/logger.js", () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const FAKE_PLAN = `# Add User Authentication

## Steps
1. Add JWT middleware
2. Create login/register endpoints
3. Add password hashing with bcrypt
4. Write integration tests

## Files
- src/auth/middleware.ts
- src/auth/routes.ts
- src/auth/hash.ts
`;

const FAKE_AGENTS: AgentConfig[] = [
  {
    name: "security-reviewer",
    model: "claude-sonnet-4-5-20250929",
    provider: "claude",
    focus: "security",
    enabled: true,
    categories: ["code", "security"],
    description: "Reviews security concerns",
    system_prompt: "You are a security reviewer.",
  },
  {
    name: "architecture-reviewer",
    model: "claude-sonnet-4-5-20250929",
    provider: "claude",
    focus: "architecture",
    enabled: true,
    categories: ["code", "infrastructure"],
    description: "Reviews architecture decisions",
    system_prompt: "You are an architecture reviewer.",
  },
  {
    name: "testing-reviewer",
    model: "claude-sonnet-4-5-20250929",
    provider: "claude",
    focus: "testing",
    enabled: true,
    categories: ["code"],
    description: "Reviews test coverage",
    system_prompt: "You are a testing reviewer.",
  },
];

const FAKE_CONFIG: OrchestratorConfig = {
  enabled: true,
  model: "claude-sonnet-4-5-20250929",
  timeout: 60,
};

const FAKE_SETTINGS: Record<string, unknown> = {
  agentSelection: {
    simple: { min: 1, max: 2 },
    medium: { min: 3, max: 5 },
    high: { min: 5, max: 8 },
    fallbackCount: 2,
  },
  complexityCategories: ["code", "infrastructure", "documentation"],
};

describe("OrchestratorClaudeAgent via runOrchestrator", () => {
  let findExecutable: ReturnType<typeof vi.fn>;
  let execFileAsync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const subproc = await import("../../../_shared/lib-ts/base/subprocess-utils.js");
    findExecutable = subproc.findExecutable as ReturnType<typeof vi.fn>;
    execFileAsync = subproc.execFileAsync as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns fallback when claude CLI not found", async () => {
    findExecutable.mockReturnValue(null);

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.complexity).toBe("medium");
    expect(result.category).toBe("code");
    expect(result.selected_agents).toHaveLength(2); // fallbackCount
    expect(result.error).toBeDefined();
  });

  it("parses valid orchestrator output", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    const mockOutput = JSON.stringify({
      structured_output: {
        complexity: "high",
        category: "code",
        selectedAgents: ["security-reviewer", "architecture-reviewer", "testing-reviewer"],
        reasoning: "Authentication involves security-sensitive operations requiring thorough review.",
      },
    });

    execFileAsync.mockResolvedValue({
      stdout: mockOutput,
      stderr: "",
      exitCode: 0,
      signal: null,
      killed: false,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.complexity).toBe("high");
    expect(result.category).toBe("code");
    expect(result.selected_agents).toEqual(["security-reviewer", "architecture-reviewer", "testing-reviewer"]);
    expect(result.reasoning).toContain("security-sensitive");
    expect(result.error).toBeUndefined();
  });

  it("returns fallback on timeout", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    execFileAsync.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: "SIGTERM",
      killed: true,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.complexity).toBe("medium");
    expect(result.error).toBeDefined();
  });

  it("returns fallback on non-zero exit with no output", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    execFileAsync.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 1,
      signal: null,
      killed: false,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.complexity).toBe("medium");
    expect(result.error).toBeDefined();
  });

  it("validates complexity enum — invalid falls back to medium", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    const mockOutput = JSON.stringify({
      structured_output: {
        complexity: "extreme", // invalid
        category: "code",
        selectedAgents: ["security-reviewer"],
        reasoning: "Test",
      },
    });

    execFileAsync.mockResolvedValue({
      stdout: mockOutput,
      stderr: "",
      exitCode: 0,
      signal: null,
      killed: false,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.complexity).toBe("medium"); // fallback
  });

  it("validates category — invalid falls back to code", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    const mockOutput = JSON.stringify({
      structured_output: {
        complexity: "simple",
        category: "quantum-physics", // not in categories list
        selectedAgents: [],
        reasoning: "Test",
      },
    });

    execFileAsync.mockResolvedValue({
      stdout: mockOutput,
      stderr: "",
      exitCode: 0,
      signal: null,
      killed: false,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(result.category).toBe("code"); // fallback
  });

  it("excludes mandatory agents from selection pool", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    const mockOutput = JSON.stringify({
      structured_output: {
        complexity: "medium",
        category: "code",
        selectedAgents: ["testing-reviewer"],
        reasoning: "Only non-mandatory agents selected",
      },
    });

    execFileAsync.mockResolvedValue({
      stdout: mockOutput,
      stderr: "",
      exitCode: 0,
      signal: null,
      killed: false,
    });

    const mandatory = new Set(["security-reviewer"]);
    const { runOrchestrator } = await import("../orchestrator.js");
    const result = await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS, mandatory);

    expect(result.selected_agents).toEqual(["testing-reviewer"]);
  });

  it("passes correct CLI args to execFileAsync", async () => {
    findExecutable.mockReturnValue("/usr/bin/claude");

    execFileAsync.mockResolvedValue({
      stdout: JSON.stringify({ structured_output: { complexity: "simple", category: "code", selectedAgents: [], reasoning: "test" } }),
      stderr: "",
      exitCode: 0,
      signal: null,
      killed: false,
    });

    const { runOrchestrator } = await import("../orchestrator.js");
    await runOrchestrator(FAKE_PLAN, FAKE_AGENTS, FAKE_CONFIG, FAKE_SETTINGS);

    expect(execFileAsync).toHaveBeenCalledOnce();
    const [cliPath, args, opts] = execFileAsync.mock.calls[0];

    expect(cliPath).toBe("/usr/bin/claude");
    expect(args).toContain("--model");
    expect(args).toContain(FAKE_CONFIG.model);
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--json-schema");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("-p");
    expect(opts.timeout).toBe(FAKE_CONFIG.timeout * 1000);
  });
});
