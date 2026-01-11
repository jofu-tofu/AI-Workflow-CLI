import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {debug} from './debug.js'
import {getAiwcliHome} from './env-compat.js'
import {ConfigNotFoundError} from './errors.js'

/**
 * AI Workflow CLI configuration interface.
 * Contains all resolved paths for CLI operation.
 */
export interface AiwcliConfig {
  claudeConfigPath: string
  aiwcliHome: string
  settingsPath: string
}

/**
 * Resolve AI Workflow CLI home directory.
 * Priority: AIWCLI_HOME env var > AIWCLI_HOME env var (legacy) > ~/.aiwcli default
 */
export function getAiwcliHomeDir(): string {
  // Try new env var first, then legacy, then default
  const envHome = getAiwcliHome()
  if (envHome) {
    return envHome
  }
  
  // Default to ~/.aiwcli (new convention)
  return join(homedir(), '.aiwcli')
}

/**
 * Validate that AIWCLI home directory exists.
 * @throws {ConfigNotFoundError} When directory does not exist
 */
export function validateAiwcliHome(aiwcliHome: string): void {
  if (!existsSync(aiwcliHome)) {
    throw new ConfigNotFoundError(
      `AIWCLI_HOME not found at ${aiwcliHome}. Run 'aiwcli setup' or set AIWCLI_HOME env var.`
    )
  }
}

/**
 * Load and validate AIWCLI configuration.
 * @returns Fully resolved AiwcliConfig with all paths
 * @throws {ConfigNotFoundError} When AIWCLI_HOME does not exist
 */
export function loadConfig(): AiwcliConfig {
  const aiwcliHome = getAiwcliHomeDir()
  debug(`Resolved AIWCLI_HOME: ${aiwcliHome}`)

  validateAiwcliHome(aiwcliHome)

  const config = {
    aiwcliHome,
    claudeConfigPath: join(homedir(), '.claude'),
    settingsPath: join(aiwcliHome, '.claude', 'settings.json'),
  }

  debug(`claudeConfigPath: ${config.claudeConfigPath}`)
  debug(`settingsPath: ${config.settingsPath}`)

  return config
}

// Legacy exports for backward compatibility
/**
 * @deprecated Use getAiwcliHomeDir() instead
 */
export function getPaiHome(): string {
  return getAiwcliHomeDir()
}

/**
 * @deprecated Use validateAiwcliHome() instead
 */
export function validatePaiHome(paiHome: string): void {
  validateAiwcliHome(paiHome)
}

/**
 * @deprecated Use AiwcliConfig instead
 */
export type PaiConfig = AiwcliConfig
