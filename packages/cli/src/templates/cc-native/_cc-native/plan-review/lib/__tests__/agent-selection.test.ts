/**
 * Tests for agent-selection module.
 * Tests resolveEnabledProviders directly with simple predicates — zero mocks.
 * Tests assignModelsToAgents with DI options (randomFn, isCliAvailable) — zero mocks.
 * Logger mock is for noise suppression only.
 */

import { describe, it, expect, mock } from "bun:test";
import type { AgentConfig, ModelsConfig } from "../../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Mock logger for noise suppression only (no assertions on logger calls)
// ---------------------------------------------------------------------------

mock.module("../../../../_core/lib-ts/runtime/logger.js", () => ({
  logDebug: () => {},
  logInfo: () => {},
  logWarn: () => {},
  logError: () => {},
}));

// Mock subprocess-utils so module load doesn't fail (not used by tests via DI)
mock.module("../../../../_core/lib-ts/runtime/subprocess-utils.js", () => ({
  findExecutable: () => null,
}));

const { assignModelsToAgents, resolveEnabledProviders } = await import("../agent-selection.js");

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

/** CLI always available */
const allAvailable = () => true;

/** CLI never available */
const noneAvailable = () => false;

/** Only specific CLIs available */
const onlyAvailable = (...names: string[]) => (name: string) => names.includes(name);

// ---------------------------------------------------------------------------
// resolveEnabledProviders — pure, zero mocks
// ---------------------------------------------------------------------------

describe("resolveEnabledProviders", () => {
  it("returns enabled providers sorted by priority (codex first)", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = resolveEnabledProviders(config, allAvailable);

    expect(result.length).toBe(2);
    expect(result[0]![0]).toBe("codex");
    expect(result[1]![0]).toBe("claude");
  });

  it("excludes providers whose CLI is not available", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = resolveEnabledProviders(config, onlyAvailable("claude"));

    expect(result.length).toBe(1);
    expect(result[0]![0]).toBe("claude");
  });

  it("excludes disabled providers", () => {
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = resolveEnabledProviders(config, allAvailable);

    expect(result.length).toBe(1);
    expect(result[0]![0]).toBe("codex");
  });

  it("excludes providers with empty model lists", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: [] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = resolveEnabledProviders(config, allAvailable);

    expect(result.length).toBe(1);
    expect(result[0]![0]).toBe("codex");
  });

  it("filters models by preflight results", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "opus"] },
    });

    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = resolveEnabledProviders(config, allAvailable, preflightAvailable);

    expect(result.length).toBe(1);
    expect(result[0]![1].models).toEqual(["sonnet"]);
  });

  it("skips provider when no models passed preflight", () => {
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    // Only claude passed preflight
    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = resolveEnabledProviders(config, allAvailable, preflightAvailable);

    expect(result.length).toBe(1);
    expect(result[0]![0]).toBe("claude");
  });

  it("returns empty when no providers are available", () => {
    const config = makeModelsConfig({
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = resolveEnabledProviders(config, noneAvailable);

    expect(result).toEqual([]);
  });

  it("puts unknown providers after known ones in priority", () => {
    const config = makeModelsConfig({
      gemini: { enabled: true, models: ["gemini-pro"] },
      codex: { enabled: true, models: ["codex-mini"] },
    });

    const result = resolveEnabledProviders(config, allAvailable);

    expect(result[0]![0]).toBe("codex");
    expect(result[1]![0]).toBe("gemini");
  });
});

// ---------------------------------------------------------------------------
// assignModelsToAgents — uses DI, zero subprocess mocks
// ---------------------------------------------------------------------------

describe("assignModelsToAgents", () => {
  it("assigns provider and model to agents", () => {
    const agents = [makeAgent("a1"), makeAgent("a2")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

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

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result.every(a => a.provider === "codex")).toBe(true);
    expect(result.every(a => a.model === "codex-mini-latest")).toBe(true);
  });

  it("falls back to claude when codex CLI not found", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: onlyAvailable("claude"),
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("claude");
    expect(result[0]!.model).toBe("sonnet");
  });

  it("filters models by preflight results", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet", "opus"] },
    });

    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = assignModelsToAgents(agents, config, preflightAvailable, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("claude");
    expect(result[0]!.model).toBe("sonnet");
  });

  it("skips provider entirely when no models passed preflight", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const preflightAvailable = new Map([
      ["claude", new Set(["sonnet"])],
    ]);

    const result = assignModelsToAgents(agents, config, preflightAvailable, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("claude");
  });

  it("falls back to claude defaults when all providers fail CLI check", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: noneAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("claude");
  });

  it("skips disabled providers", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: false, models: ["sonnet"] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("codex");
  });

  it("skips providers with empty model lists", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      claude: { enabled: true, models: [] },
      codex: { enabled: true, models: ["codex-mini-latest"] },
    });

    const result = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.provider).toBe("codex");
  });

  it("selects deterministic model with randomFn", () => {
    const agents = [makeAgent("a1")];
    const config = makeModelsConfig({
      codex: { enabled: true, models: ["model-a", "model-b"] },
    });

    // randomFn=0 picks index 0 (model-a)
    const result0 = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });
    expect(result0[0]!.model).toBe("model-a");

    // randomFn=0.5 picks index 1 (model-b)
    const result1 = assignModelsToAgents(agents, config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0.5,
    });
    expect(result1[0]!.model).toBe("model-b");
  });

  it("preserves agent fields other than provider and model", () => {
    const agent = makeAgent("test-agent");
    agent.focus = "security";
    agent.system_prompt = "Be thorough";

    const config = makeModelsConfig({
      claude: { enabled: true, models: ["sonnet"] },
    });

    const result = assignModelsToAgents([agent], config, undefined, {
      isCliAvailable: allAvailable,
      randomFn: () => 0,
    });

    expect(result[0]!.name).toBe("test-agent");
    expect(result[0]!.focus).toBe("security");
    expect(result[0]!.system_prompt).toBe("Be thorough");
  });
});
