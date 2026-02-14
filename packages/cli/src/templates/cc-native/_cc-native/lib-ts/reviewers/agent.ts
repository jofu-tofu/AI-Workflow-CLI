/**
 * Agent-based plan reviewer with multi-provider support.
 * Routes to Claude or Codex CLI based on agent.provider field.
 * See cc-native-plan-review-spec.md §4.10
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logDebug, logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { getInternalSubprocessEnv, findExecutable, execFileAsync, shellQuoteWin } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseCliOutput } from "../cli-output-parser.js";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";
import { debugLog, debugRaw } from "../debug.js";
import type { AgentConfig, ReviewerResult, ReviewOptions } from "../types.js";
import { AGENT_REVIEW_PROMPT_PREFIX } from "../types.js";
import { makeResult } from "./types.js";
import type { Reviewer } from "./types.js";

/**
 * Agent reviewer — runs a CLI instance with a custom persona.
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
): Promise<ReviewerResult> {
  if (agent.provider === "codex") {
    return runAgentReviewCodex(plan, agent, schema, timeout, contextPath, sessionName);
  }
  // Default: Claude (existing implementation)
  return runAgentReviewClaude(plan, agent, schema, timeout, contextPath, sessionName);
}

/**
 * Run a single Claude Code agent to review the plan.
 */
async function runAgentReviewClaude(
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
    "--json-schema", shellQuoteWin(schemaJson),
    "--max-turns", "3",
    "--setting-sources", process.platform === "win32" ? '""' : "",
    "-p",
  ];

  if (agent.system_prompt) {
    const fullPrompt = AGENT_REVIEW_PROMPT_PREFIX + "\n\n---\n\n" + agent.system_prompt;
    cmdArgs.push("--system-prompt", shellQuoteWin(fullPrompt));
  }

  logInfo(agent.name, `Running Claude with model: ${agent.model}, timeout: ${timeout}s`);

  const env = getInternalSubprocessEnv();

  const result = await execFileAsync(claudePath, cmdArgs, {
    input: prompt,
    timeout: timeout * 1000,
    env: env as Record<string, string>,
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  if (result.killed || result.signal === "SIGTERM") {
    logWarn(agent.name, `Claude TIMEOUT after ${timeout}s`);
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
      provider: "claude",
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

/**
 * Run a single Codex CLI agent to review the plan.
 * Adapts the codex.ts reviewer pattern for agent-based review with persona.
 */
async function runAgentReviewCodex(
  plan: string,
  agent: AgentConfig,
  schema: Record<string, unknown>,
  timeout: number,
  contextPath?: string,
  sessionName = "unknown",
): Promise<ReviewerResult> {
  const codexPath = findExecutable("codex");
  if (!codexPath) {
    logWarn(agent.name, "Codex CLI not found on PATH, skipping");
    return makeResult(agent.name, false, "skip", {}, "", "codex CLI not found on PATH");
  }

  // Codex has no --system-prompt flag, so we prepend the agent persona to stdin.
  const fullPrompt = [
    AGENT_REVIEW_PROMPT_PREFIX,
    "---",
    agent.system_prompt || "",
    "---",
    `Return ONLY a JSON object matching this schema:\n${JSON.stringify(schema)}`,
    "",
    "PLAN:",
    "<<<",
    plan,
    ">>>",
  ].join("\n\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `codex-agent-${agent.name}-`));

  try {
    const schemaPath = path.join(tmpDir, "schema.json");
    const outPath = path.join(tmpDir, "output.json");
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), "utf-8");

    const cmdArgs = ["exec", "--sandbox", "read-only"];
    if (agent.model) cmdArgs.push("--model", agent.model);
    cmdArgs.push("--output-schema", schemaPath, "-o", outPath, "-");

    logInfo(agent.name, `Running Codex with model: ${agent.model}, timeout: ${timeout}s`);

    const env = getInternalSubprocessEnv();

    const result = await execFileAsync(codexPath, cmdArgs, {
      input: fullPrompt,
      timeout: timeout * 1000,
      env: env as Record<string, string>,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32",
    });

    if (result.killed || result.signal === "SIGTERM") {
      logWarn(agent.name, `Codex TIMEOUT after ${timeout}s`);
      return makeResult(agent.name, false, "error", {}, "", `${agent.name} (codex) timed out after ${timeout}s`);
    }

    const err = result.stderr.trim();

    // Log exit code and stderr tail for ALL non-zero exits (aids diagnosis of intermittent failures)
    if (result.exitCode !== 0) {
      const stderrTail = err.slice(-500);
      logWarn(agent.name, `Codex exited with code ${result.exitCode}, stderr_len=${err.length}, stderr_tail: ${stderrTail}`);
    }

    if (!result.stdout && !err && !fs.existsSync(outPath) && result.exitCode !== 0) {
      logError(agent.name, `Codex exited with code ${result.exitCode} and no output`);
      return makeResult(agent.name, false, "error", {}, "", `${agent.name} (codex) failed (exit ${result.exitCode})`);
    }

    // Read output: prefer temp file, fallback to stdout
    let raw = "";
    const outExists = fs.existsSync(outPath);
    if (outExists) {
      raw = fs.readFileSync(outPath, "utf-8");
    }

    logDebug(agent.name, `Codex output: exit=${result.exitCode}, outFile=${outExists} (${raw.length} chars), stdout=${result.stdout.length} chars`);

    // Debug logging
    if (contextPath) {
      debugRaw(contextPath, sessionName, `agent:${agent.name}`, "stdout", raw || result.stdout);
      if (err) debugRaw(contextPath, sessionName, `agent:${agent.name}`, "stderr", err);
      debugLog(contextPath, sessionName, `agent:${agent.name}`, "subprocess_info", {
        exit_code: result.exitCode,
        stdout_len: (raw || result.stdout).length,
        stderr_len: err.length,
        out_file_exists: outExists,
        model: agent.model,
        provider: "codex",
        timeout,
      });
    }

    // Parse output
    const obj = parseJsonMaybe(raw) ?? parseJsonMaybe(result.stdout);
    const [ok, verdict, norm] = coerceToReview(
      obj,
      "Retry or check Codex CLI auth/config.",
    );

    return makeResult(agent.name, ok, verdict, norm, raw || result.stdout, err);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      logDebug(agent.name, `Failed to cleanup temp dir ${tmpDir}: ${e}`);
    }
  }
}
