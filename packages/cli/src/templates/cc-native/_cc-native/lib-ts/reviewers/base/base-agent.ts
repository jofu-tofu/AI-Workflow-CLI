/**
 * Abstract base class for CLI-based agent reviewers.
 * Implements template method pattern for subprocess execution flow.
 * Provider-specific implementations (Claude, Codex, Gemini) extend this class.
 */

import { logDebug, logInfo, logWarn, logError } from "../../../../_core/lib-ts/runtime/logger.js";
import { getInternalSubprocessEnv, findExecutable, execFileAsync } from "../../../../_core/lib-ts/runtime/subprocess-utils.js";
import { debugLog, debugRaw } from "../../debug.js";
import type { AgentConfig } from "../../types.js";

/** Result from execFileAsync */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  killed: boolean;
}

/**
 * Abstract base class for all CLI agent subprocess invocations.
 * Parameterized over return type T — ReviewerResult for reviewers,
 * OrchestratorResult for the orchestrator.
 * Subclasses implement provider-specific details.
 */
export abstract class BaseCliAgent<T> {
  protected agent: AgentConfig;
  protected schema: Record<string, unknown>;
  protected timeout: number;
  protected contextPath?: string;
  protected sessionName: string;

  constructor(
    agent: AgentConfig,
    schema: Record<string, unknown>,
    timeout: number,
    contextPath?: string,
    sessionName = "unknown",
  ) {
    this.agent = agent;
    this.schema = schema;
    this.timeout = timeout;
    this.contextPath = contextPath;
    this.sessionName = sessionName;
  }

  /**
   * Template method - orchestrates the review flow.
   * Subclasses override abstract methods to customize behavior.
   */
  async review(plan: string): Promise<T> {
    // 1. Find CLI executable
    const cliPath = this.findCli();
    if (!cliPath) {
      return this.makeSkipResult(`${this.getCliName()} CLI not found on PATH`);
    }

    logDebug(this.agent.name, `Found ${this.getCliName()} CLI at: ${cliPath}`);

    // 2. Build prompt and args (provider-specific)
    const prompt = this.buildPrompt(plan);
    const args = this.buildCliArgs();

    logInfo(this.agent.name, `Running ${this.getCliName()} with model: ${this.agent.model}, timeout: ${this.timeout}s`);

    // 3. Execute subprocess
    const env = getInternalSubprocessEnv();
    const result = await execFileAsync(cliPath, args, {
      input: prompt,
      timeout: this.timeout * 1000,
      env: env as Record<string, string>,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32",
    });

    // 4. Handle timeout
    if (result.killed || result.signal === "SIGTERM") {
      return this.handleTimeout();
    }

    // 5. Extract output (provider-specific)
    const { raw, err } = this.extractOutput(result);

    // 6. Handle exit errors
    if (!raw && !err && result.exitCode !== 0) {
      return this.handleExitError(result);
    }

    // 7. Log subprocess results
    this.logSubprocessResult(result, raw, err);

    // 8. Parse JSON output (provider-specific)
    const obj = this.parseOutput(raw, result);

    // 9. Log parsed result
    this.logParsedResult(obj);

    // 10. Coerce to result type T (provider-specific)
    const coerced = this.coerceResult(obj, raw, err);

    // 11. Cleanup (optional override)
    await this.cleanup();

    return coerced;
  }

  // ─── Abstract Methods (Subclass Implements) ────────────────────────────

  /** Get the CLI executable name (e.g., "claude", "codex") */
  protected abstract getCliName(): string;

  /** Build the stdin prompt for the CLI */
  protected abstract buildPrompt(plan: string): string;

  /** Build the command-line arguments for the CLI */
  protected abstract buildCliArgs(): string[];

  /** Parse JSON from CLI output */
  protected abstract parseOutput(raw: string, result: ExecResult): Record<string, unknown> | null;

  /** Coerce parsed JSON into the result type T */
  protected abstract coerceResult(obj: Record<string, unknown> | null, raw: string, err: string): T;

  // ─── Template Methods (Subclass Can Override) ──────────────────────────

  /** Find the CLI executable. Override for custom search logic. */
  protected findCli(): string | null {
    return findExecutable(this.getCliName());
  }

  /** Extract stdout/stderr from subprocess result. Override for file-based output (Codex). */
  protected extractOutput(result: ExecResult): { raw: string; err: string } {
    return {
      raw: result.stdout.trim(),
      err: result.stderr.trim(),
    };
  }

  /** Get default error message for coerceToReview */
  protected getDefaultErrorMessage(): string {
    return `Retry or check ${this.getCliName()} configuration.`;
  }

  /** Optional cleanup after subprocess execution */
  protected async cleanup(): Promise<void> {
    // Default: no-op. Subclasses override if needed (e.g., Codex temp files).
  }

  // ─── Shared Infrastructure ──────────────────────────────────────────────

  /** Create skip result when CLI not found */
  protected makeSkipResult(reason: string): T {
    logWarn(this.agent.name, reason);
    return this.makeErrorResult("skip", reason);
  }

  /** Handle timeout scenario */
  protected handleTimeout(): T {
    const msg = `${this.getCliName()} TIMEOUT after ${this.timeout}s`;
    logWarn(this.agent.name, msg);
    return this.makeErrorResult("error", `${this.agent.name} timed out after ${this.timeout}s`);
  }

  /** Handle non-zero exit with no output */
  protected handleExitError(result: ExecResult): T {
    const msg = `${this.agent.name} failed to run (exit ${result.exitCode})`;
    logError(this.agent.name, `Process exited with code ${result.exitCode} and no output`);
    return this.makeErrorResult("error", msg);
  }

  /** Construct a T for error/skip/timeout scenarios. Subclasses define shape. */
  protected abstract makeErrorResult(type: "skip" | "error", message: string): T;

  /** Log subprocess execution results */
  protected logSubprocessResult(result: ExecResult, raw: string, err: string): void {
    logDebug(this.agent.name, `Exit code: ${result.exitCode}`);
    logDebug(this.agent.name, `stdout length: ${raw.length} chars`);
    if (err) logDebug(this.agent.name, `stderr: ${err.slice(0, 500)}`);

    // Debug logging
    if (this.contextPath) {
      debugRaw(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "stdout", raw);
      if (err) {
        debugRaw(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "stderr", err);
      }
      debugLog(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "subprocess_info", {
        exit_code: result.exitCode,
        stdout_len: raw.length,
        stderr_len: err.length,
        model: this.agent.model,
        provider: this.agent.provider,
        timeout: this.timeout,
      });
    }

    if (raw) logDebug(this.agent.name, `stdout preview: ${raw.slice(0, 500)}`);
  }

  /** Log parsed JSON result */
  protected logParsedResult(obj: Record<string, unknown> | null): void {
    if (this.contextPath && obj) {
      debugLog(this.contextPath, this.sessionName, `agent:${this.agent.name}`, "parsed_result", {
        parsed_keys: Object.keys(obj),
        verdict: obj.verdict ?? null,
        has_summary: Boolean(obj.summary),
        issues_count: Array.isArray(obj.issues) ? (obj.issues as unknown[]).length : 0,
      });
    }

    if (obj) {
      logInfo(this.agent.name, `Parsed JSON successfully, verdict: ${obj.verdict ?? "N/A"}`);
    } else {
      logWarn(this.agent.name, "Failed to parse JSON from output");
    }
  }
}
