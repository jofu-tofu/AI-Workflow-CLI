/**
 * Codex CLI plan reviewer.
 * Runs Codex in non-interactive mode with read-only sandbox.
 * See cc-native-plan-review-spec.md §4.11
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logDebug, logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable, execFileAsync, getInternalSubprocessEnv } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";
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
    options: ReviewOptions,
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

    const env = getInternalSubprocessEnv();

    const result = await execFileAsync(codexPath, cmdArgs, {
      input: prompt,
      timeout: timeout * 1000,
      env: env as Record<string, string>,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32",
    });

    if (result.killed || result.signal === "SIGTERM") {
      logWarn("codex", `TIMEOUT after ${timeout}s`);
      return makeResult("codex", false, "error", {}, "", `codex timed out after ${timeout}s`);
    }

    const stderrText = result.stderr.trim();

    // Log exit code and stderr tail for ALL non-zero exits (aids diagnosis of intermittent failures)
    if (result.exitCode !== 0) {
      const stderrTail = stderrText.slice(-500);
      logWarn("codex", `Exited with code ${result.exitCode}, stderr_len=${stderrText.length}, stderr_tail: ${stderrTail}`);
    }

    if (!result.stdout && !stderrText && !fs.existsSync(outPath) && result.exitCode !== 0) {
      logError("codex", `Process exited with code ${result.exitCode} and no output`);
      return makeResult("codex", false, "error", {}, "", `codex failed to run (exit ${result.exitCode})`);
    }

    let raw = "";
    const outExists = fs.existsSync(outPath);
    if (outExists) {
      raw = fs.readFileSync(outPath, "utf-8");
    }

    logDebug("codex", `Exit code: ${result.exitCode}, outFile=${outExists} (${raw.length} chars), stdout=${result.stdout.length} chars`);

    const obj = parseJsonMaybe(raw) ?? parseJsonMaybe(result.stdout);
    const [ok, verdict, norm] = coerceToReview(
      obj,
      "Retry or check CLI auth/config.",
    );

    return makeResult("codex", ok, verdict, norm, raw || result.stdout, stderrText);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

