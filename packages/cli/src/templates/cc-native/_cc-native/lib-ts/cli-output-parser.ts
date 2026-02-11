/**
 * Unified Claude CLI output parser.
 * Deduplicates identical logic from orchestrator.py and reviewers/agent.py.
 * See cc-native-plan-review-spec.md §4.6
 */

import { logDebug, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { parseJsonMaybe } from "./json-parser.js";

/**
 * Parse Claude CLI JSON output, handling various formats.
 *
 * Claude CLI can output in several formats:
 * - Direct structured_output dict
 * - Assistant message with StructuredOutput tool use
 * - List of events with assistant messages
 * - Raw text with embedded JSON (heuristic fallback)
 *
 * @param raw - Raw stdout from Claude CLI
 * @param requireFields - Optional fields to validate in heuristic fallback
 * @returns Parsed JSON dict or null if parsing failed
 */
export function parseCliOutput(
  raw: string,
  requireFields?: string[],
): Record<string, unknown> | null {
  try {
    const result: unknown = JSON.parse(raw);

    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      const dict = result as Record<string, unknown>;

      // Strategy 1: Direct structured_output key
      if ("structured_output" in dict) {
        logDebug("cli_parser", "Found structured_output in root dict");
        return dict.structured_output as Record<string, unknown>;
      }

      // Strategy 2: Assistant message with StructuredOutput tool use
      if (dict.type === "assistant") {
        const message = dict.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item !== null &&
              typeof item === "object" &&
              (item as Record<string, unknown>).name === "StructuredOutput"
            ) {
              logDebug(
                "cli_parser",
                "Found StructuredOutput in assistant message content",
              );
              return (item as Record<string, unknown>).input as Record<
                string,
                unknown
              >;
            }
          }
        }
        logDebug(
          "cli_parser",
          "Assistant message found but no StructuredOutput tool use in content",
        );
      }
    } else if (Array.isArray(result)) {
      // Strategy 3: List of events with assistant messages
      logDebug(
        "cli_parser",
        `Received list of ${(result as unknown[]).length} events, searching for assistant message`,
      );
      for (let i = 0; i < (result as unknown[]).length; i++) {
        const event = (result as unknown[])[i];
        if (event === null || typeof event !== "object") continue;

        const dict = event as Record<string, unknown>;
        if (dict.type === "assistant") {
          const message = dict.message as Record<string, unknown> | undefined;
          const content = message?.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (
                item !== null &&
                typeof item === "object" &&
                (item as Record<string, unknown>).name === "StructuredOutput"
              ) {
                logDebug(
                  "cli_parser",
                  `Found StructuredOutput in event[${i}] assistant message`,
                );
                return (item as Record<string, unknown>).input as Record<
                  string,
                  unknown
                >;
              }
            }
          }
        }
      }
      logDebug(
        "cli_parser",
        "No StructuredOutput found in any assistant message in event list",
      );
    }
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      logWarn("cli_parser", `JSON decode error: ${e.message}`);
    } else {
      logError(
        "cli_parser",
        `Unexpected error during structured parsing: ${e}`,
      );
    }
  }

  // Strategy 4: Heuristic {…} extraction fallback
  logDebug(
    "cli_parser",
    "No structured output found, falling back to heuristic JSON extraction",
  );
  return parseJsonMaybe(raw, requireFields);
}
