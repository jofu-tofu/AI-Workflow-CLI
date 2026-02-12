/**
 * Claude Code agent-based plan reviewer.
 * Uses --system-prompt with agent persona for specialized review.
 * See cc-native-plan-review-spec.md §4.10
 */

import * as path from "node:path";
import { logDebug, logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { getInternalSubprocessEnv, findExecutable, execFileAsync } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseCliOutput } from "../cli-output-parser.js";
import { coerceToReview } from "../json-parser.js";
import { debugLog, debugRaw } from "../debug.js";
import type { AgentConfig, ReviewerResult, ReviewOptions } from "../types.js";
import { AGENT_REVIEW_PROMPT_PREFIX } from "../types.js";
import { makeResult } from "./types.js";
import type { Reviewer } from "./types.js";

/**
 * Agent reviewer — runs a Claude Code instance with a custom persona.
 */
export class AgentReviewer implements Reviewer {
  constructor(private agent: AgentConfig) {}

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
    );
  }
}

/**
 * Run a single Claude Code agent to review the plan.
 * Never throws — returns error ReviewerResult on failure.
 */
export async function runAgentReview(
  plan: string,
  agent: AgentConfig,
  schema: Record<string, unknown>,
  timeout: number,
  contextPath?: string,
  sessionName = "unknown",
): Promise<ReviewerResult> {
  const claudePath = findExecutable("claude");
  if (!claudePath) {
    logWarn(agent.name, "Claude CLI not found on PATH");
    return makeResult(agent.name, false, "skip", {}, "", "claude CLI not found on PATH");
  }

  logDebug(agent.name, `Found Claude CLI at: ${claudePath}`);

  const prompt = `IMMEDIATELY call StructuredOutput with your review of the plan below.
Do NOT output any text before calling StructuredOutput.

PLAN:
<<<
${plan}
>>>
`;

  const schemaJson = JSON.stringify(schema);
  const cmdArgs = [
    "--model", agent.model,
    "--output-format", "json",
    "--json-schema", schemaJson,
    "--max-turns", "3",
    "--setting-sources", "",
    "-p",
  ];

  if (agent.system_prompt) {
    const fullPrompt = AGENT_REVIEW_PROMPT_PREFIX + "\n\n---\n\n" + agent.system_prompt;
    cmdArgs.push("--system-prompt", fullPrompt);
  }

  logInfo(agent.name, `Running with model: ${agent.model}, timeout: ${timeout}s`);

  const env = getInternalSubprocessEnv();

  const result = await execFileAsync(claudePath, cmdArgs, {
    input: prompt,
    timeout: timeout * 1000,
    env: env as Record<string, string>,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.killed || result.signal === "SIGTERM") {
    logWarn(agent.name, `TIMEOUT after ${timeout}s`);
    return makeResult(agent.name, false, "error", {}, "", `${agent.name} timed out after ${timeout}s`);
  }

  const raw = result.stdout.trim();
  const err = result.stderr.trim();

  if (!raw && !err && result.exitCode !== 0) {
    logError(agent.name, `Process exited with code ${result.exitCode} and no output`);
    return makeResult(agent.name, false, "error", {}, "", `${agent.name} failed to run (exit ${result.exitCode})`);
  }

  logDebug(agent.name, `Exit code: ${result.exitCode}`);
  logDebug(agent.name, `stdout length: ${raw.length} chars`);
  if (err) logDebug(agent.name, `stderr: ${err.slice(0, 500)}`);

  // Debug logging
  if (contextPath) {
    debugRaw(contextPath, sessionName, `agent:${agent.name}`, "stdout", raw);
    if (err) {
      debugRaw(contextPath, sessionName, `agent:${agent.name}`, "stderr", err);
    }
    debugLog(contextPath, sessionName, `agent:${agent.name}`, "subprocess_info", {
      exit_code: result.exitCode,
      stdout_len: raw.length,
      stderr_len: err.length,
      model: agent.model,
      timeout,
    });
  }

  if (raw) logDebug(agent.name, `stdout preview: ${raw.slice(0, 500)}`);

  const obj = parseCliOutput(raw, ["verdict", "summary"]);

  if (contextPath) {
    debugLog(contextPath, sessionName, `agent:${agent.name}`, "parsed_result", {
      parsed_keys: obj ? Object.keys(obj) : null,
      verdict: obj?.verdict ?? null,
      has_summary: obj ? Boolean(obj.summary) : false,
      issues_count: obj && Array.isArray(obj.issues) ? (obj.issues as unknown[]).length : 0,
    });
  }

  if (obj) {
    logInfo(agent.name, `Parsed JSON successfully, verdict: ${obj.verdict ?? "N/A"}`);
  } else {
    logWarn(agent.name, "Failed to parse JSON from output");
  }

  const [ok, verdict, norm] = coerceToReview(
    obj as Record<string, unknown> | null,
    "Retry or check agent configuration.",
  );

  return makeResult(agent.name, ok, verdict, norm, raw, err);
}

