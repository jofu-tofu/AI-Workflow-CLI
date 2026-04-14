/**
 * Claude CLI agent reviewer implementation.
 * Uses claude CLI with --json-schema and --system-prompt flags.
 */

import { buildCliInvocation, reviewSpec } from "../../../../_core/lib-ts/runtime/cli-args.js";
import { parseCliOutput } from "../../cli-output-parser.js";
import { coerceToReview } from "../../json-parser.js";
import type { ReviewerResult } from "../../types.js";
import { AGENT_REVIEW_PROMPT_PREFIX } from "../schemas.js";
import { makeResult } from "../types.js";
import { BaseCliAgent } from "../base/base-agent.js";

/**
 * Claude CLI-based agent reviewer.
 * Extends BaseCliAgent with Claude-specific prompt and argument handling.
 */
export class ClaudeAgent extends BaseCliAgent<ReviewerResult> {
  protected getCliName(): string {
    return "claude";
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

  protected buildCliArgs(): string[] {
    const fullPrompt = this.agent.system_prompt
      ? AGENT_REVIEW_PROMPT_PREFIX + "\n\n---\n\n" + this.agent.system_prompt
      : undefined;

    const invocation = buildCliInvocation(reviewSpec("claude", this.agent.model, this.schema, fullPrompt));
    return invocation.args;
  }

  protected parseOutput(raw: string, _result: unknown): Record<string, unknown> | null {
    return parseCliOutput(raw, ["verdict", "summary"]);
  }

  protected coerceResult(obj: Record<string, unknown> | null, raw: string, err: string): ReviewerResult {
    const [ok, verdict, norm] = coerceToReview(obj, this.getDefaultErrorMessage());
    return makeResult(this.agent.name, ok, verdict, norm, raw, err);
  }

  protected makeErrorResult(type: "skip" | "error", message: string): ReviewerResult {
    return makeResult(this.agent.name, false, type, {}, "", message);
  }
}
