import {homedir} from 'node:os'
import {join} from 'node:path'

import type {ClaudeSettings, SettingsLocation} from './claude-settings-types.js'
import {IdePathResolver} from './ide-path-resolver.js'
import {readJsonFile, writeJsonFile} from './json-io.js'
import {pathExists} from './paths.js'

/**
 * Discover Claude settings files in the hierarchy
 *
 * Settings hierarchy (in order of precedence):
 * 1. Local Project Settings: `.claude/settings.local.json` (gitignored)
 * 2. Project Settings: `.claude/settings.json` (shared with team)
 * 3. User Settings: `~/.claude/settings.json` (global)
 *
 * @param projectDir - Project directory path
 * @returns Array of settings locations in order of precedence
 */
export async function discoverSettingsFiles(projectDir: string): Promise<SettingsLocation[]> {
  const locations: SettingsLocation[] = []

  // User settings (global)
  const userSettingsPath = join(homedir(), '.claude', 'settings.json')
  locations.push({
    type: 'user',
    path: userSettingsPath,
    exists: await pathExists(userSettingsPath),
  })

  // Project settings (shared)
  const projectSettingsPath = join(projectDir, '.claude', 'settings.json')
  locations.push({
    type: 'project',
    path: projectSettingsPath,
    exists: await pathExists(projectSettingsPath),
  })

  // Local project settings (gitignored)
  const localSettingsPath = join(projectDir, '.claude', 'settings.local.json')
  locations.push({
    type: 'local',
    path: localSettingsPath,
    exists: await pathExists(localSettingsPath),
  })

  return locations
}

/**
 * Read Claude settings from file
 *
 * @param path - Path to settings.json file
 * @returns Parsed settings or undefined if file doesn't exist or is invalid
 */
export async function readClaudeSettings(path: string): Promise<ClaudeSettings | undefined> {
  return readJsonFile<ClaudeSettings>(path)
}

/**
 * Write Claude settings to file
 *
 * Creates parent directories if they don't exist
 * Backs up existing file before writing
 *
 * @param path - Path to settings.json file
 * @param settings - Settings to write
 * @throws Error if write fails
 */
export async function writeClaudeSettings(path: string, settings: ClaudeSettings): Promise<void> {
  return writeJsonFile(path, settings, {backup: true})
}

/**
 * Get the target settings file for template hook merging
 *
 * Strategy:
 * - If project settings exist, merge into that file
 * - Otherwise, create project settings with template hooks
 *
 * @param projectDir - Project directory path
 * @returns Path to target settings file
 */
export function getTargetSettingsFile(projectDir: string): string {
  const resolver = new IdePathResolver(projectDir)
  return resolver.getClaudeSettings()
}
