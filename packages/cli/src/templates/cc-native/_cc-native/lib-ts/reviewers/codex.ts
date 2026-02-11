/**
 * Codex CLI plan reviewer.
 * Runs Codex in full-auto mode with read-only sandbox.
 * See cc-native-plan-review-spec.md §4.11
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logDebug, logInfo, logWarn, logError } from "../../../../_shared/lib-ts/base/logger.js";
import { findExecutable, isExecSyncError } from "../../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";
import { REVIEW_PROMPT_PREFIX } from "../types.js";
import type { ReviewerResult, ReviewOptions } from "../types.js";
import { makeResult } from "./types.js";
import type { Reviewer } from "./types.js";

/**
 * Codex reviewer — runs codex exec --full-auto --sandbox read-only.
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
export function runCodexReview(
  plan: string,
  schema: Record<string, unknown>,
  settings: Record<string, unknown>,
): ReviewerResult {
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

    const cmdArgs = [codexPath, "exec", "--full-auto", "--sandbox", "read-only"];

    if (model) {
      cmdArgs.push("--model", model);
    }

    cmdArgs.push("--output-schema", schemaPath, "-o", outPath, "-");

    logDebug("codex", `Running command: ${cmdArgs.join(" ")}`);

    let stdout = "";
    let stderr = "";

    try {
      stdout = execSync(cmdArgs.join("\x00"), {
        input: prompt,
        encoding: "utf-8",
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    } catch (e: unknown) {
      if (isExecSyncError(e)) {
        if (e.killed || e.signal === "SIGTERM") {
          logWarn("codex", `TIMEOUT after ${timeout}s`);
          return makeResult("codex", false, "error", {}, "", `codex timed out after ${timeout}s`);
        }
        stdout = (e.stdout ?? "").toString();
        stderr = (e.stderr ?? "").toString();

        if (!stdout && !stderr && !fs.existsSync(outPath)) {
          logError("codex", `Exception: ${e.message}`);
          return makeResult("codex", false, "error", {}, "", `codex failed to run: ${e.message}`);
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        logError("codex", `Exception: ${msg}`);
        return makeResult("codex", false, "error", {}, "", `codex failed to run: ${msg}`);
      }
    }

    logDebug("codex", `Exit code: 0`);

    let raw = "";
    if (fs.existsSync(outPath)) {
      raw = fs.readFileSync(outPath, "utf-8");
    }

    const obj = parseJsonMaybe(raw) ?? parseJsonMaybe(stdout);
    const [ok, verdict, norm] = coerceToReview(
      obj,
      "Retry or check CLI auth/config.",
    );

    const err = stderr.trim();
    return makeResult("codex", ok, verdict, norm, raw || stdout, err);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

