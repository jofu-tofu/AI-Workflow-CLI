/**
 * Environment Variable Compatibility Layer
 *
 * Provides backward compatibility for legacy PAI and AIWCLI environment variables
 * while transitioning to new AIW naming convention.
 *
 * Migration path:
 * - PAI_HOME/AIWCLI_HOME -> AIW_DIR
 * - PAI_CONFIG/AIWCLI_CONFIG -> AIW_CONFIG
 * - PAI_DIR/AIWCLI_DIR -> AIW_DIR
 *
 * Priority: New variables take precedence over legacy variables
 */

/**
 * Load environment variables with backward compatibility.
 * Call this early in application bootstrap.
 */
export function loadEnvWithCompatibility(): void {
  // AIW_DIR: Main installation directory
  if (!process.env['AIW_DIR'] && (process.env['AIWCLI_HOME'] || process.env['PAI_HOME'])) {
    process.env['AIW_DIR'] = process.env['AIWCLI_HOME'] ?? process.env['PAI_HOME']
    console.warn('⚠️  AIWCLI_HOME/PAI_HOME is deprecated. Please use AIW_DIR instead.')
    console.warn('   Migration guide: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/MIGRATION.md')
  }

  // AIW_CONFIG: Configuration file path
  if (!process.env['AIW_CONFIG'] && (process.env['AIWCLI_CONFIG'] || process.env['PAI_CONFIG'])) {
    process.env['AIW_CONFIG'] = process.env['AIWCLI_CONFIG'] ?? process.env['PAI_CONFIG']
    console.warn('⚠️  AIWCLI_CONFIG/PAI_CONFIG is deprecated. Please use AIW_CONFIG instead.')
  }

  // AIW_DIR: Root directory (for hooks and scripts) - same as main dir
  if (!process.env['AIW_DIR'] && (process.env['AIWCLI_DIR'] || process.env['PAI_DIR'])) {
    process.env['AIW_DIR'] = process.env['AIWCLI_DIR'] ?? process.env['PAI_DIR']
    console.warn('⚠️  AIWCLI_DIR/PAI_DIR is deprecated. Please use AIW_DIR instead.')
  }

  // DA (Assistant name) - Keep for backward compatibility, no warning
  // This is commonly used and doesn't need migration
}

/**
 * Get AIW_DIR with fallback to legacy AIWCLI_HOME/PAI_HOME
 */
export function getAiwDir(): string | undefined {
  return process.env['AIW_DIR'] ?? process.env['AIWCLI_HOME'] ?? process.env['PAI_HOME']
}

/**
 * Get AIW_CONFIG with fallback to legacy AIWCLI_CONFIG/PAI_CONFIG
 */
export function getAiwConfig(): string | undefined {
  return process.env['AIW_CONFIG'] ?? process.env['AIWCLI_CONFIG'] ?? process.env['PAI_CONFIG']
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getAiwDir() instead
 */
export function getAiwcliHome(): string | undefined {
  return getAiwDir()
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getAiwConfig() instead
 */
export function getAiwcliConfig(): string | undefined {
  return getAiwConfig()
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getAiwDir() instead
 */
export function getAiwcliDir(): string | undefined {
  return getAiwDir()
}

/**
 * Check if using legacy environment variables
 */
export function isUsingLegacyEnvVars(): boolean {
  return Boolean(
    (process.env['AIWCLI_HOME'] && !process.env['AIW_DIR']) ||
    (process.env['PAI_HOME'] && !process.env['AIW_DIR']) ||
    (process.env['PAI_CONFIG'] && !process.env['AIW_CONFIG']) ||
    (process.env['AIWCLI_CONFIG'] && !process.env['AIW_CONFIG']) ||
    (process.env['PAI_DIR'] && !process.env['AIW_DIR']) ||
    (process.env['AIWCLI_DIR'] && !process.env['AIW_DIR'])
  )
}
