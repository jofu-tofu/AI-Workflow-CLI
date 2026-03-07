#!/usr/bin/env bun
/**
 * Simplified council debate runner - bypasses review infrastructure.
 * Directly invokes claude CLI and parses debate-specific schema.
 */

import { spawn } from "child_process";
import { shellQuoteWin } from "../../_core/lib-ts/runtime/subprocess-utils.js";

const DEBATE_SCHEMA = {
  type: "object",
  properties: {
    agent_name: { type: "string" },
    position: {
      type: "string",
      enum: ["approach_a", "approach_b", "hybrid", "neither"],
    },
    reasoning: {
      type: "array",
      items: { type: "string" },
    },
    rebuttals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concern: { type: "string" },
          response: { type: "string" },
        },
        required: ["concern", "response"],
      },
    },
    verdict: { type: "string" },
  },
  required: ["agent_name", "position", "reasoning", "rebuttals", "verdict"],
};

const AGENTS = [
  {
    name: "Correctness Advocate",
    system: `You are the Correctness Advocate in this architectural council.

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
- Favor defensive, fail-safe designs`,
  },
  {
    name: "Simplicity Champion",
    system: `You are the Simplicity Champion in this architectural council.

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
- Distrust "clever" solutions`,
  },
  {
    name: "Pragmatist",
    system: `You are the Pragmatist in this architectural council.

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
- Focus on developer experience`,
  },
];

interface DebateResult {
  agent_name: string;
  position: string;
  reasoning: string[];
  rebuttals: Array<{ concern: string; response: string }>;
  verdict: string;
}

async function runAgent(
  topic: string,
  agentName: string,
  systemPrompt: string,
): Promise<DebateResult | null> {
  return new Promise((resolve) => {
    const schemaJson = JSON.stringify(DEBATE_SCHEMA);
    const promptText = `IMMEDIATELY call StructuredOutput with your council debate response.
Do NOT output any text before calling StructuredOutput.

TOPIC:
<<<
${topic}
>>>
`;

    const args = [
      "--model",
      "claude-sonnet-4-5",
      "--output-format",
      "json",
      "--json-schema",
      shellQuoteWin(schemaJson),
      "--max-turns",
      "3",
      "--setting-sources",
      process.platform === "win32" ? '""' : "",
      "-p",
      "--no-session-persistence",
      "--system-prompt",
      shellQuoteWin(systemPrompt),
    ];

    const claudeCmd = process.platform === "win32"
      ? "C:\\Users\\fujos\\AppData\\Roaming\\npm\\claude.cmd"
      : "claude";

    console.error(`\n[${agentName}] Starting...`);

    const proc = spawn(claudeCmd, args, {
      shell: true,
      env: {
        ...process.env,
        CLAUDECODE: undefined,
        CLAUDE_CODE_ENTRYPOINT: undefined,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[${agentName}] Failed with exit code ${code}`);
        console.error(`[${agentName}] stderr: ${stderr}`);
        resolve(null);
        return;
      }

      // Parse CLI wrapper output
      try {
        const wrapper = JSON.parse(stdout);
        if (wrapper.type !== "result" || !wrapper.structured_output) {
          console.error(`[${agentName}] No structured_output in wrapper`);
          console.error(`[${agentName}] wrapper keys: ${Object.keys(wrapper).join(", ")}`);
          resolve(null);
          return;
        }

        const result = wrapper.structured_output as DebateResult;
        console.error(`[${agentName}] ✓ Position: ${result.position}`);
        resolve(result);
      } catch (e) {
        console.error(`[${agentName}] Parse error: ${e}`);
        console.error(`[${agentName}] stdout: ${stdout.slice(0, 500)}`);
        resolve(null);
      }
    });

    // Send prompt to stdin
    proc.stdin?.write(promptText);
    proc.stdin?.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  let topic: string;

  if (args.length > 0) {
    topic = args.join(" ");
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    topic = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (!topic) {
    console.error("Usage: council_debate_simple.ts <topic>");
    process.exit(1);
  }

  console.log("\n=== COUNCIL DEBATE ===\n");
  console.log(topic.slice(0, 200) + "...\n");
  console.log("=".repeat(80) + "\n");

  // Run all agents in parallel
  const promises = AGENTS.map((agent) =>
    runAgent(topic, agent.name, agent.system),
  );

  const results = (await Promise.all(promises)).filter(
    (r): r is DebateResult => r !== null,
  );

  if (results.length === 0) {
    console.error("\n[FATAL] All agents failed\n");
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
    positionCounts.set(
      result.position,
      (positionCounts.get(result.position) || 0) + 1,
    );
  }

  console.log("**Position Distribution:**");
  for (const [position, count] of positionCounts.entries()) {
    console.log(`- ${position}: ${count}/${results.length} agents`);
  }

  const majorityPosition = Array.from(positionCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (majorityPosition && majorityPosition[1] >= 2) {
    console.log(
      `\n**Majority Decision:** ${majorityPosition[0]} (${majorityPosition[1]}/${results.length} agents)`,
    );
  } else {
    console.log("\n**No clear majority** - further investigation needed");
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

main().catch((e) => {
  console.error(`\n[FATAL] ${e}\n`);
  process.exit(1);
});
