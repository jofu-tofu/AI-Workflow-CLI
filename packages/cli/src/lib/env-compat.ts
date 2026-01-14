/**
 * Environment Variable Layer
 *
 * Provides environment variable resolution for AIW CLI.
 *
 * Environment variables:
 * - AIW_DIR: Main installation directory
 * - AIW_CONFIG: Configuration file path
 */

/**
 * Load environment variables.
 * Call this early in application bootstrap.
 */
export function loadEnvWithCompatibility(): void {
  // DA (Assistant name) - Keep for backward compatibility, no warning
  // This is commonly used and doesn't need migration
}

/**
 * Get AIW_DIR environment variable
 */
export function getAiwDir(): string | undefined {
  return process.env['AIW_DIR']
}

/**
 * Get AIW_CONFIG environment variable
 */
export function getAiwConfig(): string | undefined {
  return process.env['AIW_CONFIG']
}

/**
 * Check if using legacy environment variables
 */
export function isUsingLegacyEnvVars(): boolean {
  return false
}
