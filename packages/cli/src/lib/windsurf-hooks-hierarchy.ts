import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import type {WindsurfHooks} from './windsurf-hooks-types.js'

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
 * Read Windsurf hooks from file
 *
 * @param path - Path to hooks.json file
 * @returns Parsed hooks or undefined if file doesn't exist or is invalid
 */
export async function readWindsurfHooks(path: string): Promise<undefined | WindsurfHooks> {
  try {
    const content = await fs.readFile(path, 'utf8')
    return JSON.parse(content) as WindsurfHooks
  } catch {
    // File doesn't exist or invalid JSON
    return undefined
  }
}

/**
 * Write Windsurf hooks to file
 *
 * Creates parent directories if they don't exist
 * Backs up existing file before writing
 *
 * @param path - Path to hooks.json file
 * @param hooks - Hooks to write
 * @throws Error if write fails
 */
export async function writeWindsurfHooks(path: string, hooks: WindsurfHooks): Promise<void> {
  // Create parent directory if it doesn't exist
  const dir = join(path, '..')
  await fs.mkdir(dir, {recursive: true})

  // Backup existing file if it exists
  if (await fileExists(path)) {
    const backupPath = `${path}.backup`
    await fs.copyFile(path, backupPath)
  }

  // Write hooks with pretty formatting
  const content = JSON.stringify(hooks, null, 2)
  await fs.writeFile(path, content, 'utf8')
}

/**
 * Get the target hooks file for template hook merging
 *
 * Strategy:
 * - If project hooks exist, merge into that file
 * - Otherwise, create project hooks with template hooks
 *
 * @param projectDir - Project directory path
 * @returns Path to target hooks file
 */
export function getTargetHooksFile(projectDir: string): string {
  return join(projectDir, '.windsurf', 'hooks.json')
}
