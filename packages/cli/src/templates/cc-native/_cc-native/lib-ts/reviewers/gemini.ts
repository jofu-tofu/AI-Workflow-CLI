/**
 * Gemini CLI plan reviewer.
 * Runs Gemini CLI in YOLO mode (auto-approve).
 * See cc-native-plan-review-spec.md §4.12
 */

import { execSync } from "node:child_process";
import { logDebug, logInfo, logWarn, logError } from "../../../../_shared/lib-ts/base/logger.js";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";
import type { ReviewerResult, ReviewOptions } from "../types.js";
import type { Reviewer } from "./types.js";

/**
 * Gemini reviewer — runs gemini -y -p <instruction>.
 */
export class GeminiReviewer implements Reviewer {
  private settings: Record<string, any>;

  constructor(settings: Record<string, any>) {
    this.settings = settings;
  }

  async review(
    plan: string,
    schema: Record<string, any>,
    options: ReviewOptions,
  ): Promise<ReviewerResult> {
    return runGeminiReview(plan, schema, this.settings);
  }
}

/**
 * Run Gemini CLI to review the plan.
 * Never throws — returns error ReviewerResult on failure.
 */
export function runGeminiReview(
  plan: string,
  schema: Record<string, any>,
  settings: Record<string, any>,
): ReviewerResult {
  const geminiSettings =
    ((settings.reviewers as Record<string, any> | undefined)?.gemini as
      | Record<string, any>
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

  const cmdArgs = [geminiPath, "-y", "-p", instruction];

  if (model) {
    cmdArgs.push("--model", model);
  }

  logDebug("gemini", "Running command: gemini -y -p <instruction>");

  let stdout = "";
  let stderr = "";

  try {
    stdout = execSync(cmdArgs.join("\x00"), {
      input: plan,
      encoding: "utf-8",
      timeout: timeout * 1000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();
  } catch (e: any) {
    if (e.killed || e.signal === "SIGTERM") {
      logWarn("gemini", `TIMEOUT after ${timeout}s`);
      return makeResult("gemini", false, "error", {}, "", `gemini timed out after ${timeout}s`);
    }
    stdout = (e.stdout ?? "").toString();
    stderr = (e.stderr ?? "").toString();

    if (!stdout && !stderr) {
      logError("gemini", `Exception: ${e.message ?? e}`);
      return makeResult("gemini", false, "error", {}, "", `gemini failed to run: ${e.message ?? e}`);
    }
  }

  logDebug("gemini", `Exit code: 0`);

  const raw = stdout.trim();
  const err = stderr.trim();

  const obj = parseJsonMaybe(raw);
  const [ok, verdict, norm] = coerceToReview(
    obj,
    "Retry or check CLI auth/config.",
  );

  return makeResult("gemini", ok, verdict, norm, raw, err);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findExecutable(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
      .trim()
      .split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

function makeResult(
  name: string,
  ok: boolean,
  verdict: string,
  data: Record<string, any>,
  raw: string,
  err: string,
): ReviewerResult {
  return { name, ok, verdict, data, raw, err };
}
