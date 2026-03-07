#!/usr/bin/env bun
/**
 * Council debate runner for architectural decisions.
 * Uses multi-agent infrastructure to simulate structured debate.
 */

import { runAgentReview } from "../lib-ts/reviewers/agent.js";
import type { AgentConfig } from "../lib-ts/reviewers/types.js";
import { logInfo, logError } from "../../_shared/lib-ts/base/logger.js";

// Debate schema - each agent responds with their perspective
const DEBATE_SCHEMA = {
  type: "object",
  properties: {
    agent_name: { type: "string", description: "Name of this agent/perspective" },
    position: {
      type: "string",
      enum: ["approach_a", "approach_b", "hybrid", "neither"],
      description: "Which approach this agent supports"
    },
    reasoning: {
      type: "array",
      items: { type: "string" },
      description: "Key reasoning points (3-5 bullet points)"
    },
    rebuttals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concern: { type: "string" },
          response: { type: "string" }
        },
        required: ["concern", "response"]
      },
      description: "Responses to anticipated counterarguments"
    },
    verdict: {
      type: "string",
      description: "Final recommendation with confidence level"
    }
  },
  required: ["agent_name", "position", "reasoning", "rebuttals", "verdict"]
};

// Define 3 council agents with different perspectives
const COUNCIL_AGENTS: AgentConfig[] = [
  {
    name: "Correctness Advocate",
    provider: "claude",
    model: "claude-sonnet-4-5",
    enabled: true,
    system_prompt: `You are the Correctness Advocate in this architectural council.

YOUR MANDATE: Prioritize system correctness and data integrity above all else.

EVALUATION CRITERIA:
- What happens if timing assumptions break?
- Can the system enter invalid states?
- Are there race conditions or ordering dependencies?
- What's the blast radius of bugs in each approach?
- Which approach has fewer failure modes?

STYLE:
- Be skeptical of "it should work" assumptions
- Point out edge cases and failure scenarios
- Ask "what breaks when X happens before Y?"
- Favor defensive, fail-safe designs`
  },
  {
    name: "Simplicity Champion",
    provider: "claude",
    model: "claude-sonnet-4-5",
    enabled: true,
    system_prompt: `You are the Simplicity Champion in this architectural council.

YOUR MANDATE: Advocate for the simplest solution that could possibly work.

EVALUATION CRITERIA:
- Which approach has fewer moving parts?
- Can a new developer understand it in 5 minutes?
- How many state transitions are required?
- Is the responsibility of each component clear?
- Which approach requires less documentation?

STYLE:
- Challenge unnecessary complexity
- Prefer explicit over implicit behavior
- Ask "do we really need this?"
- Value readability and maintainability
- Distrust "clever" solutions`
  },
  {
    name: "Pragmatist",
    provider: "claude",
    model: "claude-sonnet-4-5",
    enabled: true,
    system_prompt: `You are the Pragmatist in this architectural council.

YOUR MANDATE: Balance theoretical correctness with practical engineering constraints.

EVALUATION CRITERIA:
- What's the migration cost from current state?
- How much code needs to change?
- What's the testing burden?
- Are there real-world scenarios that break each approach?
- Which approach is easier to debug when things go wrong?

STYLE:
- Consider operational reality
- Value incremental improvements over rewrites
- Ask "what problem are we actually solving?"
- Challenge both over-engineering and under-engineering
- Focus on developer experience`
  }
];

interface DebateResult {
  agent_name: string;
  position: string;
  reasoning: string[];
  rebuttals: Array<{ concern: string; response: string }>;
  verdict: string;
}

async function runCouncilDebate(topic: string): Promise<void> {
  logInfo("council", "Starting council debate");
  console.log("\n=== COUNCIL DEBATE ===\n");
  console.log(topic);
  console.log("\n" + "=".repeat(80) + "\n");

  const results: DebateResult[] = [];

  // Run all agents in parallel
  const promises = COUNCIL_AGENTS.map(async (agent) => {
    logInfo("council", `Running agent: ${agent.name}`);

    const result = await runAgentReview(
      topic,
      agent,
      DEBATE_SCHEMA,
      90000, // 90 second timeout
      undefined,
      "council-debate"
    );

    if (!result.ok) {
      logError("council", `Agent ${agent.name} failed: ${result.error}`);
      console.error(`\n[ERROR] ${agent.name} failed: ${result.error}\n`);
      return null;
    }

    return result.normalized as unknown as DebateResult;
  });

  const responses = await Promise.all(promises);

  // Filter out failed agents
  for (const response of responses) {
    if (response) {
      results.push(response);
    }
  }

  if (results.length === 0) {
    console.error("\n[FATAL] All agents failed to respond\n");
    process.exit(1);
  }

  // Display results
  for (const result of results) {
    console.log(`\n### ${result.agent_name}\n`);
    console.log(`**Position:** ${result.position}\n`);

    console.log("**Reasoning:**");
    for (const point of result.reasoning) {
      console.log(`- ${point}`);
    }

    if (result.rebuttals.length > 0) {
      console.log("\n**Rebuttals:**");
      for (const rebuttal of result.rebuttals) {
        console.log(`- *${rebuttal.concern}*`);
        console.log(`  → ${rebuttal.response}`);
      }
    }

    console.log(`\n**Verdict:** ${result.verdict}\n`);
    console.log("-".repeat(80));
  }

  // Compute consensus
  console.log("\n=== CONSENSUS ANALYSIS ===\n");

  const positionCounts = new Map<string, number>();
  for (const result of results) {
    positionCounts.set(result.position, (positionCounts.get(result.position) || 0) + 1);
  }

  console.log("**Position Distribution:**");
  for (const [position, count] of positionCounts.entries()) {
    console.log(`- ${position}: ${count}/${results.length} agents`);
  }

  const majorityPosition = Array.from(positionCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];

  if (majorityPosition[1] >= 2) {
    console.log(`\n**Majority Decision:** ${majorityPosition[0]} (${majorityPosition[1]}/${results.length} agents)`);
  } else {
    console.log("\n**No clear majority** - further investigation needed");
  }

  console.log("\n" + "=".repeat(80) + "\n");
  logInfo("council", "Debate complete");
}

// Read debate topic from args or stdin
const args = process.argv.slice(2);
let topic: string;

if (args.length > 0) {
  topic = args.join(" ");
} else {
  // Read from stdin (pipe mode)
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  topic = Buffer.concat(chunks).toString("utf-8").trim();
}

if (!topic) {
  console.error("Usage: council_debate.ts <topic> OR echo '<topic>' | council_debate.ts");
  process.exit(1);
}

runCouncilDebate(topic).catch((e) => {
  logError("council", `Fatal error: ${e}`);
  console.error(`\n[FATAL] ${e}\n`);
  process.exit(1);
});
