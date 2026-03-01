/**
 * Shared structured output parsing utilities for CLI-based agents.
 * Supports Claude/Codex-style envelopes and heuristic JSON extraction.
 */

import { logDebug, logError, logWarn } from "../base/logger.js";

export interface StructuredOutputParseOptions {
  requireFields?: string[];
  loggerTag?: string;
}

const DEFAULT_LOG_TAG = "structured_output";

function getTag(options?: StructuredOutputParseOptions): string {
  return options?.loggerTag ?? DEFAULT_LOG_TAG;
}

function validateRequiredFields(
  obj: Record<string, unknown>,
  parseMethod: "strict" | "heuristic",
  options?: StructuredOutputParseOptions,
): Record<string, unknown> | null {
  const required = options?.requireFields;
  if (!required || required.length === 0) return obj;

  const missing = required.filter((field) => !(field in obj) || obj[field] === undefined || obj[field] === null);
  if (missing.length === 0) return obj;

  const tag = getTag(options);
  logWarn(tag, `Parsed JSON (${parseMethod}) missing required fields: ${JSON.stringify(missing)}`);
  logDebug(tag, `Parsed keys: ${JSON.stringify(Object.keys(obj))}`);

  // Heuristic extraction often grabs the wrong JSON blob. Reject in that case.
  if (parseMethod === "heuristic") {
    return null;
  }
  return obj;
}

/**
 * Parse a JSON object from text using strict parse first, then heuristic
 * extraction of the first object-like block.
 */
export function parseJsonObjectMaybe(
  text: string,
  options?: StructuredOutputParseOptions,
): Record<string, unknown> | null {
  const tag = getTag(options);
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strict parse first.
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return validateRequiredFields(parsed as Record<string, unknown>, "strict", options);
    }
  } catch {
    // Fall through to heuristic extraction.
  }

  // Heuristic parse: extract the first object-like block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = trimmed.slice(start, end + 1);
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      logDebug(tag, `Used heuristic JSON extraction (chars ${start}-${end})`);
      return validateRequiredFields(parsed as Record<string, unknown>, "heuristic", options);
    }
  } catch {
    logDebug(tag, `Heuristic JSON extraction failed (chars ${start}-${end})`);
  }

  return null;
}

function parseAssistantEnvelope(
  envelope: Record<string, unknown>,
  options?: StructuredOutputParseOptions,
): Record<string, unknown> | null {
  const tag = getTag(options);
  const message = envelope.message;
  if (!message || typeof message !== "object") return null;

  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const toolUse = item as Record<string, unknown>;
    if (toolUse.name !== "StructuredOutput") continue;
    if (toolUse.input && typeof toolUse.input === "object" && !Array.isArray(toolUse.input)) {
      logDebug(tag, "Found StructuredOutput in assistant envelope");
      return toolUse.input as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Parse structured output across known CLI envelope formats.
 * Falls back to generic JSON extraction when no recognized envelope exists.
 */
export function parseStructuredOutput(
  raw: string,
  options?: StructuredOutputParseOptions,
): Record<string, unknown> | null {
  const tag = getTag(options);

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      if (obj.structured_output && typeof obj.structured_output === "object" && !Array.isArray(obj.structured_output)) {
        logDebug(tag, "Found structured_output in root object");
        return validateRequiredFields(obj.structured_output as Record<string, unknown>, "strict", options);
      }

      const assistantResult = parseAssistantEnvelope(obj, options);
      if (assistantResult) return assistantResult;

      // Session result envelope (no structured output tool call).
      if (obj.type === "result" || ("duration_ms" in obj && "session_id" in obj)) {
        if (obj.is_error === true || (Array.isArray(obj.errors) && obj.errors.length > 0)) {
          logWarn(tag, `CLI returned error envelope: ${JSON.stringify(obj.errors ?? "is_error=true")}`);
          return null;
        }

        if (typeof obj.result === "string" && obj.result.trim().length > 0) {
          logDebug(tag, "Found text result in session envelope, attempting JSON extraction");
          const extracted = parseJsonObjectMaybe(obj.result, options);
          if (extracted) return extracted;
          logWarn(tag, "Session envelope result contained no extractable JSON object");
        }
        return null;
      }
    } else if (Array.isArray(parsed)) {
      for (let i = 0; i < parsed.length; i++) {
        const event = parsed[i];
        if (!event || typeof event !== "object") continue;
        const eventObj = event as Record<string, unknown>;
        const assistantResult = parseAssistantEnvelope(eventObj, options);
        if (assistantResult) {
          logDebug(tag, `Found StructuredOutput in event[${i}]`);
          return assistantResult;
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      logWarn(tag, `JSON decode error: ${error.message}`);
    } else {
      logError(tag, `Unexpected parse error: ${error}`);
    }
  }

  logDebug(tag, "No structured envelope found, falling back to generic JSON extraction");
  return parseJsonObjectMaybe(raw, options);
}
