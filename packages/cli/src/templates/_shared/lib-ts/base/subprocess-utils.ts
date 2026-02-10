/**
 * Subprocess environment utilities.
 * See SPEC.md §5.10
 */

/**
 * Check if this is an internal subprocess call.
 * All hooks should check this and return early to prevent recursion.
 */
export function isInternalCall(): boolean {
  return process.env.AIWCLI_INTERNAL_CALL === "true";
}

/**
 * Get environment for internal subprocess calls.
 * Returns a copy of process.env with AIWCLI_INTERNAL_CALL=true.
 */
export function getInternalSubprocessEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    AIWCLI_INTERNAL_CALL: "true",
  };
}
