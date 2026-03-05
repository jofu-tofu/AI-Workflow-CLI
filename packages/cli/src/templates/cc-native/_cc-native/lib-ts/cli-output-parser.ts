/**
 * CC-native wrapper around shared structured-output parsing.
 * Keeps existing import surface stable for provider implementations.
 */

import { parseStructuredOutput } from "../../_shared/lib-ts/agent-exec/structured-output.js";

/**
 * Parse CLI JSON output into a structured object.
 * Delegates to shared parser with cc-native logging tag.
 */
export function parseCliOutput(
  raw: string,
  requireFields?: string[],
): null | Record<string, unknown> {
  return parseStructuredOutput(raw, {
    requireFields,
    loggerTag: "cli_parser",
  });
}
