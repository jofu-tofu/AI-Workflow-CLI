import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {debug} from './debug.js'
import {getAiwDir as getAiwDirFromEnv} from './env-compat.js'
import {ConfigNotFoundError} from './errors.js'

/**
 * AI Workflow CLI configuration interface.
 * Contains all resolved paths for CLI operation.
 */
export interface AiwcliConfig {
  aiwDir: string
  claudeConfigPath: string
  settingsPath: string
}

/**
 * Resolve AI Workflow CLI home directory.
 * Priority: AIW_DIR env var > ~/.aiw default
 */
export function getAiwDir(): string {
  // Try env var first, then default
  const envHome = getAiwDirFromEnv()
  if (envHome) {
    return envHome
  }

  // Default to ~/.aiw
  return join(homedir(), '.aiw')
}

/**
 * Validate that AIW home directory exists.
 * @throws {ConfigNotFoundError} When directory does not exist
 */
export function validateAiwDir(aiwDir: string): void {
  if (!existsSync(aiwDir)) {
    throw new ConfigNotFoundError(
      `AIW_DIR not found at ${aiwDir}. Run 'aiw setup' or set AIW_DIR env var.`
    )
  }
}

/**
 * Load and validate AIW configuration.
 * @returns Fully resolved AiwcliConfig with all paths
 * @throws {ConfigNotFoundError} When AIW_DIR does not exist
 */
export function loadConfig(): AiwcliConfig {
  const aiwDir = getAiwDir()
  debug(`Resolved AIW_DIR: ${aiwDir}`)

  validateAiwDir(aiwDir)

  const config = {
    aiwDir,
    claudeConfigPath: join(homedir(), '.claude'),
    settingsPath: join(aiwDir, '.claude', 'settings.json'),
  }

  debug(`claudeConfigPath: ${config.claudeConfigPath}`)
  debug(`settingsPath: ${config.settingsPath}`)

  return config
}
