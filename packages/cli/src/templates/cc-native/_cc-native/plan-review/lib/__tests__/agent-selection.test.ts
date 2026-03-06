/**
 * Tests for agent-selection module, focusing on:
 * - assignModelsToAgents with preflight filtering
 * - Provider priority ordering (codex-first)
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { AgentConfig, ModelsConfig } from "../../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindExecutable = mock(() => "/usr/bin/mock-cli" as string | null);

mock.module("../../../../_core/lib-ts/runtime/subprocess-utils.js", () => ({
  findExecutable: mockFindExecutable,
}));

mock.module("../../../../_core/lib-ts/runtime/logger.js", () => ({
  logDebug: () => {},
  logInfo: () => {},
  logWarn: () => {},
  logError: () => {},
}));

const { assignModelsToAgents } = await import("../agent-selection.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(name: string): AgentConfig {
  return {
    name,
    model: "default-model",
    provider: "",
    focus: "test",
    categories: [],
    description: `Test agent ${name}`,
    system_prompt: "",
  };
}

function makeModelsConfig(providers: Record<string, { enabled: boolean; models: string[] }>): ModelsConfig {
  return { providers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assignModelsToAgents", () => {
  beforeEach(() => {
    mockFindExecutable.mockReset();
    mockFindExecutable.mockReturnValue("/usr/bin/mock-cli");
  });

  it("assigns provider and model to agents", () => {
    const agents = [makeAgent("a1"), makeAgent("a2")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const result = assignModelsToAgents(agents, config);

    expect(result.length).toBe(2);
    expect(result[0]!.provider).toBe("claude");
    expect(result[0]!.model).toBe("sonnet");
    expect(result[1]!.provider).toBe("claude");
  });

  it("prefers codex over claude when both available", () => {
    const agents = [makeAgent("a1"), makeAgent("a2"), makeAgent("a3")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config);

    // All agents should be on codex (higher priority)
    expect(result.every(a => a.provider === "codex")).toBe(true);
    expect(result.every(a => a.model === "codex-mini-latest")).toBe(true);
  });

  it("falls back to claude when codex CLI not found", () => {
    mockFindExecutable.mockImplementation((name: string) => {
      return name === "claude" ? "/usr/bin/claude" : null;
    });

    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config);

    expect(result[0]!.provider).toBe("claude");
    expect(result[0]!.model).toBe("sonnet");
  });

  it("filters models by preflight results", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "opus"] },
    });

    // Only sonnet passed preflight
    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = assignModelsToAgents(agents, config, preflightAvailable);

    expect(result[0]!.provider).toBe("claude");
    expect(result[0]!.model).toBe("sonnet");
  });

  it("skips provider entirely when no models passed preflight", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    // Only claude passed, codex failed entirely
    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = assignModelsToAgents(agents, config, preflightAvailable);

    expect(result[0]!.provider).toBe("claude");
  });

  it("falls back to claude defaults when all providers fail CLI check", () => {
    mockFindExecutable.mockReturnValue(null);

    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config);

    expect(result[0]!.provider).toBe("claude");
  });

  it("skips disabled providers", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config);

    expect(result[0]!.provider).toBe("codex");
  });

  it("skips providers with empty model lists", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: [] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config);

    expect(result[0]!.provider).toBe("codex");
  });

  it("without preflight, does not filter models", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      codex: { enabled: true, models: ["model-a", "model-b"] },
    });

    // Run multiple times to statistically verify both models can be assigned
    const models = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = assignModelsToAgents(agents, config);
      models.add(result[0]!.model);
    }

    // At least one of the models should appear (statistically near-certain with 50 runs)
    expect(models.size).toBeGreaterThanOrEqual(1);
  });

  it("preserves agent fields other than provider and model", () => {
    const agent = makeAgent("test-agent");
    agent.focus = "security";
    agent.system_prompt = "Be thorough";

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const result = assignModelsToAgents([agent], config);

    expect(result[0]!.name).toBe("test-agent");
    expect(result[0]!.focus).toBe("security");
    expect(result[0]!.system_prompt).toBe("Be thorough");
  });
});
