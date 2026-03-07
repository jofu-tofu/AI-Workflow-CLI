/**
 * Test suite for refactored agent provider architecture.
 * Tests entry points for ClaudeAgent, CodexAgent, GeminiAgent.
 * Focus: structural correctness, not review quality.
 */

import { describe, test, expect } from "bun:test";
import { ClaudeAgent } from "../providers/claude-agent.js";
import { CodexAgent } from "../providers/codex-agent.js";
import { GeminiAgent } from "../providers/gemini-agent.js";
import { runAgentReview } from "../agent.js";
import { REVIEW_SCHEMA } from "../schemas.js";
import type { AgentConfig } from "../../types.js";

const SAMPLE_PLAN = `# Test Plan

## Goal
Test the new agent provider architecture.

## Steps
1. Instantiate agent
2. Call review()
3. Validate output structure

## Success Criteria
- No errors thrown
- Valid ReviewerResult returned
`;

const createTestAgentConfig = (provider: string): AgentConfig => ({
  name: `test-${provider}`,
  model: provider === "codex" ? "gpt-4" : "claude-3-5-sonnet-20241022",
  provider: provider,
  focus: "Testing",
  enabled: true,
  categories: ["test"],
  description: "Test agent",
  system_prompt: "You are a test reviewer. Provide a brief assessment.",
});

describe("ClaudeAgent", () => {
  test(
    "instantiates and calls review() without throwing",
    async () => {
      const agent = new ClaudeAgent(
        createTestAgentConfig("claude"),
        REVIEW_SCHEMA,
        30, // timeout seconds
        undefined, // contextPath
        "test-session"
      );

      const result = await agent.review(SAMPLE_PLAN);

      // Should return ReviewerResult structure
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("verdict");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("raw");
      expect(result).toHaveProperty("err");
    },
    40000 // 40s timeout for real CLI execution
  );

  test(
    "returns valid verdict type",
    async () => {
      const agent = new ClaudeAgent(
        createTestAgentConfig("claude"),
        REVIEW_SCHEMA,
        30,
        undefined,
        "test-session"
      );

      const result = await agent.review(SAMPLE_PLAN);

      // Verdict must be one of the allowed types
      expect(["pass", "warn", "fail", "error", "skip"]).toContain(result.verdict);
    },
    40000
  );

  test(
    "populates name field correctly",
    async () => {
      const config = createTestAgentConfig("claude");
      const agent = new ClaudeAgent(config, REVIEW_SCHEMA, 30);

      const result = await agent.review(SAMPLE_PLAN);

      expect(result.name).toBe(config.name);
    },
    40000
  );
});

describe("CodexAgent", () => {
  test("instantiates and calls review() without throwing", async () => {
    const agent = new CodexAgent(
      createTestAgentConfig("codex"),
      REVIEW_SCHEMA,
      30,
      undefined,
      "test-session"
    );

    const result = await agent.review(SAMPLE_PLAN);

    // Should return ReviewerResult structure (may be skip if CLI not found)
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("raw");
    expect(result).toHaveProperty("err");
  });

  test("returns skip verdict when CLI not found", async () => {
    const agent = new CodexAgent(
      createTestAgentConfig("codex"),
      REVIEW_SCHEMA,
      30,
      undefined,
      "test-session"
    );

    const result = await agent.review(SAMPLE_PLAN);

    // If codex not installed, should return skip
    if (result.verdict === "skip") {
      expect(result.ok).toBe(false);
      expect(result.err).toContain("codex");
    } else {
      // If codex IS installed, should return valid verdict
      expect(["pass", "warn", "fail", "error"]).toContain(result.verdict);
    }
  });
});

describe("GeminiAgent", () => {
  test("throws not-implemented error on review()", async () => {
    const agent = new GeminiAgent(
      createTestAgentConfig("gemini"),
      REVIEW_SCHEMA,
      30,
      undefined,
      "test-session"
    );

    // GeminiAgent should throw when calling review()
    // The error happens in getCliName() which is called first
    await expect(agent.review(SAMPLE_PLAN)).rejects.toThrow("not implemented");
  });
});

describe("runAgentReview routing", () => {
  test(
    "routes to ClaudeAgent when provider=claude",
    async () => {
      const config = createTestAgentConfig("claude");

      const result = await runAgentReview(
        SAMPLE_PLAN,
        config,
        REVIEW_SCHEMA,
        30,
        undefined,
        "test-session"
      );

      // Should return ReviewerResult from ClaudeAgent
      expect(result.name).toBe(config.name);
      expect(result).toHaveProperty("verdict");
    },
    40000
  );

  test("routes to CodexAgent when provider=codex", async () => {
    const config = createTestAgentConfig("codex");

    const result = await runAgentReview(
      SAMPLE_PLAN,
      config,
      REVIEW_SCHEMA,
      30,
      undefined,
      "test-session"
    );

    // Should return ReviewerResult from CodexAgent
    expect(result.name).toBe(config.name);
    expect(result).toHaveProperty("verdict");
  });

  test("routes to GeminiAgent when provider=gemini", async () => {
    const config = createTestAgentConfig("gemini");

    const result = await runAgentReview(
      SAMPLE_PLAN,
      config,
      REVIEW_SCHEMA,
      30,
      undefined,
      "test-session"
    );

    // GeminiAgent throws, but runAgentReview catches and returns error result
    expect(result.verdict).toBe("error");
    expect(result.ok).toBe(false);
    expect(result.err).toContain("not implemented");
  });

  test(
    "defaults to ClaudeAgent for unknown provider",
    async () => {
      const config = { ...createTestAgentConfig("unknown"), provider: "unknown" };

      const result = await runAgentReview(
        SAMPLE_PLAN,
        config,
        REVIEW_SCHEMA,
        30,
        undefined,
        "test-session"
      );

      // Should default to ClaudeAgent
      expect(result.name).toBe(config.name);
      expect(result).toHaveProperty("verdict");
    },
    40000
  );
});

describe("ReviewerResult field validation", () => {
  test(
    "all required fields have correct types",
    async () => {
      const agent = new ClaudeAgent(
        createTestAgentConfig("claude"),
        REVIEW_SCHEMA,
        30
      );

      const result = await agent.review(SAMPLE_PLAN);

      // Type checks
      expect(typeof result.name).toBe("string");
      expect(result.name.length).toBeGreaterThan(0);
      expect(typeof result.ok).toBe("boolean");
      expect(typeof result.verdict).toBe("string");
      expect(["pass", "warn", "fail", "error", "skip"]).toContain(result.verdict);
      expect(typeof result.data).toBe("object");
      expect(result.data).not.toBeNull();
      expect(typeof result.raw).toBe("string");
      expect(typeof result.err).toBe("string");
    },
    40000
  );
});
