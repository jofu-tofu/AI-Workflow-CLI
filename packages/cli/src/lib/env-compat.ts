/**
 * Environment Variable Compatibility Layer
 *
 * Provides backward compatibility for legacy PAI environment variables
 * while transitioning to new AIWCLI naming convention.
 *
 * Migration path:
 * - AIWCLI_HOME -> AIWCLI_HOME
 * - PAI_CONFIG -> AIWCLI_CONFIG
 * - PAI_DIR -> AIWCLI_DIR
 *
 * Priority: New variables take precedence over legacy variables
 */

/**
 * Load environment variables with backward compatibility.
 * Call this early in application bootstrap.
 */
export function loadEnvWithCompatibility(): void {
  // AIWCLI_HOME: Main installation directory
  if (!process.env['AIWCLI_HOME'] && process.env['AIWCLI_HOME']) {
    process.env['AIWCLI_HOME'] = process.env['AIWCLI_HOME']
    console.warn('⚠️  AIWCLI_HOME is deprecated. Please use AIWCLI_HOME instead.')
    console.warn('   Migration guide: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/MIGRATION.md')
  }

  // AIWCLI_CONFIG: Configuration file path
  if (!process.env['AIWCLI_CONFIG'] && process.env['PAI_CONFIG']) {
    process.env['AIWCLI_CONFIG'] = process.env['PAI_CONFIG']
    console.warn('⚠️  PAI_CONFIG is deprecated. Please use AIWCLI_CONFIG instead.')
  }

  // AIWCLI_DIR: Root directory (for hooks and scripts)
  if (!process.env['AIWCLI_DIR'] && process.env['PAI_DIR']) {
    process.env['AIWCLI_DIR'] = process.env['PAI_DIR']
    console.warn('⚠️  PAI_DIR is deprecated. Please use AIWCLI_DIR instead.')
  }

  // DA (Assistant name) - Keep for backward compatibility, no warning
  // This is commonly used and doesn't need migration
}

/**
 * Get AIWCLI_HOME with fallback to legacy AIWCLI_HOME
 */
export function getAiwcliHome(): string | undefined {
  return process.env['AIWCLI_HOME'] ?? process.env['AIWCLI_HOME']
}

/**
 * Get AIWCLI_CONFIG with fallback to legacy PAI_CONFIG
 */
export function getAiwcliConfig(): string | undefined {
  return process.env['AIWCLI_CONFIG'] ?? process.env['PAI_CONFIG']
}

/**
 * Get AIWCLI_DIR with fallback to legacy PAI_DIR
 */
export function getAiwcliDir(): string | undefined {
  return process.env['AIWCLI_DIR'] ?? process.env['PAI_DIR']
}

/**
 * Check if using legacy environment variables
 */
export function isUsingLegacyEnvVars(): boolean {
  return Boolean(
    (process.env['AIWCLI_HOME'] && !process.env['AIWCLI_HOME']) ||
    (process.env['PAI_CONFIG'] && !process.env['AIWCLI_CONFIG']) ||
    (process.env['PAI_DIR'] && !process.env['AIWCLI_DIR'])
  )
}
