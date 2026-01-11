/**
 * stdin Detection and Reading Utilities
 *
 * Provides utilities for detecting and reading piped input from stdin.
 * Used by commands that need to accept piped data from other commands.
 *
 * @example Basic stdin detection
 * ```typescript
 * if (hasStdin()) {
 *   const input = await readStdin()
 *   // Process piped input
 * } else {
 *   // Interactive mode - prompt user
 * }
 * ```
 */

import {stdin} from 'node:process'

/**
 * Check if stdin has piped data available.
 * Returns true when data is piped into the command, false in interactive terminals.
 *
 * @returns True if stdin is piped (not a TTY), false if interactive terminal
 *
 * @example
 * ```typescript
 * // echo "data" | pai process
 * hasStdin() // Returns true
 *
 * // pai process (no pipe)
 * hasStdin() // Returns false
 * ```
 */
export function hasStdin(): boolean {
  return stdin.isTTY !== true
}

/**
 * Read all data from stdin.
 * Reads piped input data and returns as UTF-8 string.
 * Returns empty string if no stdin available.
 *
 * @returns Promise resolving to stdin content as string, or empty string if no stdin
 *
 * @example
 * ```typescript
 * const input = await readStdin()
 * if (input) {
 *   console.log(`Received: ${input}`)
 * }
 * ```
 */
export async function readStdin(): Promise<string> {
  if (!hasStdin()) {
    return ''
  }

  const chunks: Buffer[] = []
  for await (const chunk of stdin) {
    chunks.push(chunk as Buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}
