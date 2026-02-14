/**
 * Codex CLI agent reviewer implementation.
 * Uses codex exec with temp files for schema and output.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { logDebug, logWarn } from "../../../../_shared/lib-ts/base/logger.js";
import { getInternalSubprocessEnv, execFileAsync } from "../../../../_shared/lib-ts/base/subprocess-utils.js";
import { debugLog, debugRaw } from "../../debug.js";
import { parseJsonMaybe, coerceToReview } from "../../json-parser.js";
import type { ReviewerResult } from "../../types.js";
import { BaseCliAgent, type ExecResult } from "../base/base-agent.js";
import { AGENT_REVIEW_PROMPT_PREFIX } from "../schemas.js";
import { makeResult } from "../types.js";

/** Temp directory for Codex schema/output files */
const tmpDir: string | null = null;

/**
 * Codex CLI-based agent reviewer.
 * Codex has no --system-prompt flag, so we embed schema and persona in stdin.
 * Uses temp files for schema and output.
 */
export class CodexAgent extends BaseCliAgent<ReviewerResult> {
  private tempDir: string | null = null;

  protected buildCliArgs(): string[] {
    // Create temp directory for schema and output files
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `codex-agent-${this.agent.name}-`));

    const schemaPath = path.join(this.tempDir, "schema.json");
    const outPath = path.join(this.tempDir, "output.json");
    fs.writeFileSync(schemaPath, JSON.stringify(this.schema, null, 2), "utf-8");

    const cmdArgs = ["exec", "--sandbox", "read-only"];
    if (this.agent.model) cmdArgs.push("--model", this.agent.model);
    cmdArgs.push("--output-schema", schemaPath, "-o", outPath, "-");

    return cmdArgs;
  }

  protected buildPrompt(plan: string): string {
    // Codex has no --system-prompt flag, so we prepend the agent persona to stdin.
    return [
      AGENT_REVIEW_PROMPT_PREFIX,
      "---",
      this.agent.system_prompt || "",
      "---",
      `Return ONLY a JSON object matching this schema:\n${JSON.stringify(this.schema)}`,
      "",
      "PLAN:",
      "<<<",
      plan,
      ">>>",
    ].join("\n\n");
  }

  protected async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        logDebug(this.agent.name, `Failed to cleanup temp dir ${this.tempDir}: ${error}`);
      }
      this.tempDir = null;
    }
  }

  protected coerceResult(obj: Record<string, unknown> | null, raw: string, err: string): ReviewerResult {
    const [ok, verdict, norm] = coerceToReview(obj, this.getDefaultErrorMessage());
    return makeResult(this.agent.name, ok, verdict, norm, raw, err);
  }

  protected extractOutput(result: ExecResult): { raw: string; err: string } {
    const outPath = this.getOutputPath();
    let raw = "";
    const outExists = fs.existsSync(outPath);

    if (outExists) {
      raw = fs.readFileSync(outPath, "utf-8");
    }

    logDebug(this.agent.name, `Codex output: exit=${result.exitCode}, outFile=${outExists} (${raw.length} chars), stdout=${result.stdout.length} chars`);

    // Debug logging (override to include out_file_exists)
    if (this.contextPath) {
      debugRaw(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "stdout", raw || result.stdout);
      if (result.stderr) {
        debugRaw(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "stderr", result.stderr);
      }
      debugLog(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "subprocess_info", {
        exit_code: result.exitCode,
        stdout_len: (raw || result.stdout).length,
        stderr_len: result.stderr.length,
        out_file_exists: outExists,
        model: this.agent.model,
        provider: "codex",
        timeout: this.timeout,
      });
    }

    return {
      raw: raw || result.stdout,
      err: result.stderr.trim(),
    };
  }

  protected getCliName(): string {
    return "codex";
  }

  protected makeErrorResult(type: "skip" | "error", message: string): ReviewerResult {
    return makeResult(this.agent.name, false, type, {}, "", message);
  }

  protected parseOutput(raw: string, result: ExecResult): Record<string, unknown> | null {
    return parseJsonMaybe(raw) ?? parseJsonMaybe(result.stdout);
  }

  /**
   * Override review() to handle temp file creation in try block.
   * Codex writes output to a temp file instead of stdout.
   */
  async review(plan: string): Promise<ReviewerResult> {
    const cliPath = this.findCli();
    if (!cliPath) {
      return this.makeSkipResult(`${this.getCliName()} CLI not found on PATH`);
    }

    logDebug(this.agent.name, `Found ${this.getCliName()} CLI at: ${cliPath}`);

    const prompt = this.buildPrompt(plan);
    const args = this.buildCliArgs();

    logDebug(this.agent.name, `Running ${this.getCliName()} with model: ${this.agent.model}, timeout: ${this.timeout}s`);

    try {
      const env = getInternalSubprocessEnv();
      const result = await execFileAsync(cliPath, args, {
        input: prompt,
        timeout: this.timeout * 1000,
        env: env as Record<string, string>,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32",
      });

      if (result.killed || result.signal === "SIGTERM") {
        return this.handleTimeout();
      }

      // Extract from temp file if exists, fallback to stdout
      const { raw, err } = this.extractOutput(result);

      // Log exit code and stderr tail for ALL non-zero exits
      if (result.exitCode !== 0) {
        const stderrTail = err.slice(-500);
        logWarn(this.agent.name, `Codex exited with code ${result.exitCode}, stderr_len=${err.length}, stderr_tail: ${stderrTail}`);
      }

      if (!raw && !err && !this.outputFileExists() && result.exitCode !== 0) {
        return this.handleExitError(result);
      }

      this.logSubprocessResult(result, raw, err);

      const obj = this.parseOutput(raw, result);
      this.logParsedResult(obj);

      return this.coerceResult(obj, raw, err);
    } finally {
      await this.cleanup();
    }
  }

  private getOutputPath(): string {
    return path.join(this.tempDir!, "output.json");
  }

  private outputFileExists(): boolean {
    return this.tempDir ? fs.existsSync(this.getOutputPath()) : false;
  }
}
