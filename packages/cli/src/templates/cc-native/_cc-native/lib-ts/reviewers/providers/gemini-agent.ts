/**
 * Gemini CLI agent reviewer implementation (stub).
 * Placeholder for future implementation.
 */

import type { ReviewerResult } from "../../types.js";
import { makeResult } from "../types.js";
import { BaseCliAgent } from "../base/base-agent.js";

/**
 * Gemini CLI-based agent reviewer (NOT IMPLEMENTED).
 * All methods throw "not implemented" errors.
 * This is a placeholder for future development.
 */
export class GeminiAgent extends BaseCliAgent<ReviewerResult> {
  protected getCliName(): string {
    throw new Error("GeminiAgent not implemented");
  }

  protected buildPrompt(_plan: string): string {
    throw new Error("GeminiAgent not implemented");
  }

  protected buildCliArgs(): string[] {
    throw new Error("GeminiAgent not implemented");
  }

  protected parseOutput(_raw: string, _result: unknown): Record<string, unknown> | null {
    throw new Error("GeminiAgent not implemented");
  }

  protected coerceResult(_obj: Record<string, unknown> | null, _raw: string, _err: string): ReviewerResult {
    throw new Error("GeminiAgent not implemented");
  }

  protected makeErrorResult(type: "skip" | "error", message: string): ReviewerResult {
    return makeResult(this.agent.name, false, type, {}, "", message);
  }
}
