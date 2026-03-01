/**
 * Agent-based plan reviewer with multi-provider support.
 * Routes to provider-specific implementations (Claude, Codex, Gemini).
 * See cc-native-plan-review-spec.md §4.10
 */

import type { ExecutionBackend } from "../../../../_shared/lib-ts/agent-exec/execution-backend.js";
import { logWarn } from "../../../../_shared/lib-ts/base/logger.js";
import { debugLog, debugRaw } from "../../../lib-ts/debug.js";
import type { AgentConfig, ReviewerResult, ReviewOptions } from "../../../lib-ts/types.js";
import { ClaudeAgent } from "./providers/claude-agent.js";
import { CodexAgent } from "./providers/codex-agent.js";
import { GeminiAgent } from "./providers/gemini-agent.js";
import type { Reviewer } from "./types.js";
import { makeResult } from "./types.js";

/**
 * Agent reviewer — runs a CLI instance with a custom persona.
 */
export class AgentReviewer implements Reviewer {
  constructor(
    private agent: AgentConfig,
    private backend?: ExecutionBackend,
  ) {}

  async review(
    plan: string,
    schema: Record<string, unknown>,
    options: ReviewOptions,
  ): Promise<ReviewerResult> {
    return runAgentReview(
      plan,
      this.agent,
      schema,
      options.timeout,
      options.context_path,
      options.session_name ?? "unknown",
      this.backend,
    );
  }
}

/**
 * Run a single agent to review the plan.
 * Routes to provider-specific implementation based on agent.provider.
 * Never throws — returns error ReviewerResult on failure.
 */
export async function runAgentReview(
  plan: string,
  agent: AgentConfig,
  schema: Record<string, unknown>,
  timeout: number,
  contextPath?: string,
  sessionName = "unknown",
  backend?: ExecutionBackend,
): Promise<ReviewerResult> {
  try {
    const config = {
      agent, schema, timeout, contextPath, sessionName,
      debugLogger: { log: debugLog, raw: debugRaw },
    };

    let reviewer: ClaudeAgent | CodexAgent | GeminiAgent;

    switch (agent.provider) {
      case "codex": {
        reviewer = new CodexAgent(config, backend);
        break;
      }
      case "gemini": {
        reviewer = new GeminiAgent(config, backend);
        break;
      }
      default: {
        reviewer = new ClaudeAgent(config, backend);
        break;
      }
    }

    return await reviewer.review(plan);
  } catch (error) {
    logWarn(agent.name, `Unexpected error creating reviewer: ${error}`);
    return makeResult(agent.name, false, "error", {}, "", `Failed: ${error}`);
  }
}
