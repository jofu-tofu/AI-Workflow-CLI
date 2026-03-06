/**
 * Gemini CLI agent reviewer implementation (stub).
 * Placeholder for future implementation.
 */

import type { ExecutionResult } from "../../../../../_shared/lib-ts/agent-exec/execution-backend.js";
import type { ReviewerResult } from "../../../../lib-ts/types.js";
import { BaseCliAgent } from "../base/base-agent.js";
import { makeResult } from "../types.js";

/**
 * Gemini CLI-based agent reviewer (NOT IMPLEMENTED).
 * All methods throw "not implemented" errors.
 * This is a placeholder for future development.
 */
export class GeminiAgent extends BaseCliAgent<ReviewerResult> {
  protected buildCliArgs(): string[] {
    throw new Error("GeminiAgent not implemented");
  }

  protected buildPrompt(_plan: string): string {
    throw new Error("GeminiAgent not implemented");
  }

  protected coerceResult(_obj: Record<string, unknown> | null, _raw: string, _err: string): ReviewerResult {
    throw new Error("GeminiAgent not implemented");
  }

  protected getCliName(): string {
    throw new Error("GeminiAgent not implemented");
  }

  protected makeErrorResult(type: "skip" | "error", message: string): ReviewerResult {
    return makeResult(this.agent.name, false, type, {}, "", message);
  }

  protected parseOutput(_raw: string, _result: ExecutionResult): Record<string, unknown> | null {
    throw new Error("GeminiAgent not implemented");
  }
}
