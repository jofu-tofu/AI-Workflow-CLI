/**
 * Claude CLI agent reviewer implementation.
 * Uses claude CLI with --json-schema and --system-prompt flags.
 */

import { shellQuoteWin } from "../../../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseCliOutput } from "../../../../lib-ts/cli-output-parser.js";
import { coerceToReview } from "../../../../lib-ts/json-parser.js";
import type { ReviewerResult } from "../../../../lib-ts/types.js";
import { BaseCliAgent } from "../base/base-agent.js";
import { AGENT_REVIEW_PROMPT_PREFIX } from "../schemas.js";
import { makeResult } from "../types.js";

/**
 * Claude CLI-based agent reviewer.
 * Extends BaseCliAgent with Claude-specific prompt and argument handling.
 */
// ---------------------------------------------------------------------------
// Preflight (standalone — no instance needed)
// ---------------------------------------------------------------------------

export const CLAUDE_PREFLIGHT_INPUT = "Respond with exactly: ok";

export function claudePreflightArgs(model: string): string[] {
  return [
    "--model", model,
    "--max-turns", "1",
    "--output-format", "json",
    "--setting-sources", process.platform === "win32" ? '""' : "",
    "-p",
    "--no-session-persistence",
  ];
}

// ---------------------------------------------------------------------------
// Agent Class
// ---------------------------------------------------------------------------

export class ClaudeAgent extends BaseCliAgent<ReviewerResult> {
  protected buildCliArgs(): string[] {
    const schemaJson = JSON.stringify(this.schema);
    const cmdArgs = [
      "--model", this.agent.model,
      "--output-format", "json",
      "--json-schema", shellQuoteWin(schemaJson),
      "--max-turns", "3",
      "--setting-sources", process.platform === "win32" ? '""' : "",
      "-p",
      "--no-session-persistence", // Prevent subprocess from creating session records
    ];

    if (this.agent.system_prompt) {
      const fullPrompt = AGENT_REVIEW_PROMPT_PREFIX + "\n\n---\n\n" + this.agent.system_prompt;
      cmdArgs.push("--system-prompt", shellQuoteWin(fullPrompt));
    }

    return cmdArgs;
  }

  protected buildPrompt(plan: string): string {
    return `IMMEDIATELY call StructuredOutput with your review of the plan below.
Do NOT output any text before calling StructuredOutput.

PLAN:
<<<
${plan}
>>>
`;
  }

  protected coerceResult(obj: Record<string, unknown> | null, raw: string, err: string): ReviewerResult {
    const [ok, verdict, norm] = coerceToReview(obj, this.getDefaultErrorMessage());
    return makeResult(this.agent.name, ok, verdict, norm, raw, err);
  }

  protected getCliName(): string {
    return "claude";
  }

  protected makeErrorResult(type: "skip" | "error", message: string): ReviewerResult {
    return makeResult(this.agent.name, false, type, {}, "", message);
  }

  protected parseOutput(raw: string, _result: unknown): Record<string, unknown> | null {
    return parseCliOutput(raw, ["verdict", "summary"]);
  }
}
