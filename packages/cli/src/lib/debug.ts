/**
 * Debug logging utilities for AI Workflow CLI.
 * Provides conditional debug output with [debug] prefix.
 */

let debugEnabled = false

/**
 * Check if debug mode is enabled.
 */
export function isDebugEnabled(): boolean {
  return debugEnabled
}

/**
 * Enable or disable debug mode.
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled
}

/**
 * Log a debug message if debug mode is enabled.
 * Messages are prefixed with [debug] and output to stderr.
 * @param message - The message to log
 */
export function debug(message: string): void {
  if (debugEnabled) {
    // Use dim color if terminal supports it, otherwise plain text
    const supportsColor = process.stderr.isTTY
    if (supportsColor) {
      // ANSI dim: \u001B[2m, reset: \u001B[0m
      process.stderr.write(`\u001B[2m[debug] ${message}\u001B[0m\n`)
    } else {
      process.stderr.write(`[debug] ${message}\n`)
    }
  }
}

/**
 * Log configuration details in debug mode.
 * Only logs AIWCLI_HOME path to avoid accidentally logging sensitive data.
 * @param config - Configuration object
 * @param config.aiwcliHome - AIWCLI_HOME path
 */
export function debugConfig(config: {[key: string]: unknown; paiHome: string}): void {
  debug(`AIWCLI_HOME resolved to ${config.aiwcliHome}`)
  // NOTE: Do NOT log full config - may contain API keys/tokens in future
}

/**
 * Log process spawn details in debug mode.
 * @param command - Command being spawned
 * @param args - Arguments passed to command
 */
export function debugSpawn(command: string, args: string[]): void {
  debug(`Spawning: ${command} ${args.join(' ')}`)
}

/**
 * Log version information in debug mode.
 * Displays AI Workflow CLI version and Node.js version.
 */
export function debugVersion(): void {
  // Read version from package.json
  // Note: process.env.npm_package_version only works during npm scripts
  // For production, we need to read package.json directly
  let version = 'unknown'
  try {
    // In ESM, we can use import.meta.url to resolve relative to this file
    // For now, use env var with fallback (will be 'unknown' in production until fixed properly)
    version = process.env.npm_package_version || '0.1.0'
  } catch {
    version = '0.1.0'
  }

  debug(`AI Workflow CLI v${version}`)
  debug(`Node.js ${process.version}`)
  debug(`Platform: ${process.platform} ${process.arch}`)
}
