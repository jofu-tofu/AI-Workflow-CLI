import {promises as fs} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import type {ClaudeSettings, SettingsLocation} from './claude-settings-types.js'
import {IdePathResolver} from './ide-path-resolver.js'

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
    exists: await fileExists(userSettingsPath),
  })

  // Project settings (shared)
  const projectSettingsPath = join(projectDir, '.claude', 'settings.json')
  locations.push({
    type: 'project',
    path: projectSettingsPath,
    exists: await fileExists(projectSettingsPath),
  })

  // Local project settings (gitignored)
  const localSettingsPath = join(projectDir, '.claude', 'settings.local.json')
  locations.push({
    type: 'local',
    path: localSettingsPath,
    exists: await fileExists(localSettingsPath),
  })

  return locations
}

/**
 * Check if file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Read Claude settings from file
 *
 * @param path - Path to settings.json file
 * @returns Parsed settings or undefined if file doesn't exist or is invalid
 */
export async function readClaudeSettings(path: string): Promise<ClaudeSettings | undefined> {
  try {
    const content = await fs.readFile(path, 'utf8')
    return JSON.parse(content) as ClaudeSettings
  } catch {
    // File doesn't exist or invalid JSON
    return undefined
  }
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
  // Create parent directory if it doesn't exist
  const dir = join(path, '..')
  await fs.mkdir(dir, {recursive: true})

  // Backup existing file if it exists
  if (await fileExists(path)) {
    const backupPath = `${path}.backup`
    await fs.copyFile(path, backupPath)
  }

  // Write settings with pretty formatting
  const content = JSON.stringify(settings, null, 2)
  await fs.writeFile(path, content, 'utf8')
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
