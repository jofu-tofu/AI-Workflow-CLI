/**
 * Codex CLI plan reviewer.
 * Runs Codex in non-interactive mode with read-only sandbox.
 * See cc-native-plan-review-spec.md §4.11
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { logDebug, logError, logInfo as _logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { execFileAsync, findExecutable } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { coerceToReview, parseJsonMaybe } from "../json-parser.js";
import { REVIEW_PROMPT_PREFIX } from "../types.js";
import type { ReviewerResult, ReviewOptions } from "../types.js";
import { makeResult } from "./types.js";
import type { Reviewer } from "./types.js";

/**
 * Codex reviewer — runs codex exec --sandbox read-only.
 */
export class CodexReviewer implements Reviewer {
  private settings: Record<string, unknown>;

  constructor(settings: Record<string, unknown>) {
    this.settings = settings;
  }

  async review(
    plan: string,
    schema: Record<string, unknown>,
    _options: ReviewOptions,
  ): Promise<ReviewerResult> {
    return runCodexReview(plan, schema, this.settings);
  }
}

/**
 * Run Codex CLI to review the plan.
 * Never throws — returns error ReviewerResult on failure.
 */
export async function runCodexReview(
  plan: string,
  schema: Record<string, unknown>,
  settings: Record<string, unknown>,
): Promise<ReviewerResult> {
  const codexSettings =
    ((settings.reviewers as Record<string, unknown> | undefined)?.codex as
      | Record<string, unknown>
      | undefined) ?? {};
  const timeout = (codexSettings.timeout as number) ?? 120;
  const model = (codexSettings.model as string) ?? "";

  const codexPath = findExecutable("codex");
  if (!codexPath) {
    logWarn("codex", "CLI not found on PATH");
    return makeResult("codex", false, "skip", {}, "", "codex CLI not found on PATH");
  }

  logDebug("codex", `Found CLI at: ${codexPath}`);

  const prompt = `${REVIEW_PROMPT_PREFIX}
Return ONLY a JSON object that matches this JSON Schema:
${JSON.stringify(schema)}

PLAN:
<<<
${plan}
>>>
`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-review-"));

  try {
    const schemaPath = path.join(tmpDir, "schema.json");
    const outPath = path.join(tmpDir, "codex_review.json");

    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), "utf-8");

    const cmdArgs = ["exec", "--sandbox", "read-only"];

    if (model) {
      cmdArgs.push("--model", model);
    }

    cmdArgs.push("--output-schema", schemaPath, "-o", outPath, "-");

    logDebug("codex", `Running command: codex ${cmdArgs.join(" ")}`);

    const result = await execFileAsync(codexPath, cmdArgs, {
      input: prompt,
      timeout: timeout * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.killed || result.signal === "SIGTERM") {
      logWarn("codex", `TIMEOUT after ${timeout}s`);
      return makeResult("codex", false, "error", {}, "", `codex timed out after ${timeout}s`);
    }

    if (!result.stdout && !result.stderr && !fs.existsSync(outPath) && result.exitCode !== 0) {
      logError("codex", `Process exited with code ${result.exitCode} and no output`);
      return makeResult("codex", false, "error", {}, "", `codex failed to run (exit ${result.exitCode})`);
    }

    logDebug("codex", `Exit code: ${result.exitCode}`);

    let raw = "";
    if (fs.existsSync(outPath)) {
      raw = fs.readFileSync(outPath, "utf8");
    }

    const obj = parseJsonMaybe(raw) ?? parseJsonMaybe(result.stdout);
    const [ok, verdict, norm] = coerceToReview(
      obj,
      "Retry or check CLI auth/config.",
    );

    const err = result.stderr.trim();
    return makeResult("codex", ok, verdict, norm, raw || result.stdout, err);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

