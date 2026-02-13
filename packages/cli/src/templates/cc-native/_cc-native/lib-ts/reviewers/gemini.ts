/**
 * Gemini CLI plan reviewer.
 * Runs Gemini CLI in YOLO mode (auto-approve).
 * See cc-native-plan-review-spec.md §4.12
 */

import { logDebug, logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable, execFileAsync } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";
import type { ReviewerResult, ReviewOptions } from "../types.js";
import { makeResult } from "./types.js";
import type { Reviewer } from "./types.js";

/**
 * Gemini reviewer — runs gemini -y -p <instruction>.
 */
export class GeminiReviewer implements Reviewer {
  private settings: Record<string, unknown>;

  constructor(settings: Record<string, unknown>) {
    this.settings = settings;
  }

  async review(
    plan: string,
    schema: Record<string, unknown>,
    options: ReviewOptions,
  ): Promise<ReviewerResult> {
    return runGeminiReview(plan, schema, this.settings);
  }
}

/**
 * Run Gemini CLI to review the plan.
 * Never throws — returns error ReviewerResult on failure.
 */
export async function runGeminiReview(
  plan: string,
  schema: Record<string, unknown>,
  settings: Record<string, unknown>,
): Promise<ReviewerResult> {
  const geminiSettings =
    ((settings.reviewers as Record<string, unknown> | undefined)?.gemini as
      | Record<string, unknown>
      | undefined) ?? {};
  const timeout = (geminiSettings.timeout as number) ?? 120;
  const model = (geminiSettings.model as string) ?? "";

  const geminiPath = findExecutable("gemini");
  if (!geminiPath) {
    logWarn("gemini", "CLI not found on PATH");
    return makeResult("gemini", false, "skip", {}, "", "gemini CLI not found on PATH");
  }

  logDebug("gemini", `Found CLI at: ${geminiPath}`);

  const instruction = `

Review the PLAN above as a senior staff software engineer. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Return ONLY a JSON object that matches this JSON Schema (no markdown, no code fences):
${JSON.stringify(schema)}
`;

  const cmdArgs = ["-y", "-p", instruction];

  if (model) {
    cmdArgs.push("--model", model);
  }

  logDebug("gemini", "Running command: gemini -y -p <instruction>");

  const result = await execFileAsync(geminiPath, cmdArgs, {
    input: plan,
    timeout: timeout * 1000,
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  if (result.killed || result.signal === "SIGTERM") {
    logWarn("gemini", `TIMEOUT after ${timeout}s`);
    return makeResult("gemini", false, "error", {}, "", `gemini timed out after ${timeout}s`);
  }

  if (!result.stdout && !result.stderr && result.exitCode !== 0) {
    logError("gemini", `Process exited with code ${result.exitCode}`);
    return makeResult("gemini", false, "error", {}, "", `gemini failed to run (exit ${result.exitCode})`);
  }

  logDebug("gemini", `Exit code: ${result.exitCode}`);

  const raw = result.stdout.trim();
  const err = result.stderr.trim();

  const obj = parseJsonMaybe(raw);
  const [ok, verdict, norm] = coerceToReview(
    obj,
    "Retry or check CLI auth/config.",
  );

  return makeResult("gemini", ok, verdict, norm, raw, err);
}

