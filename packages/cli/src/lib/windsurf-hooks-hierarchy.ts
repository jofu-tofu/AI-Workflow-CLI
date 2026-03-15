import {IdePathResolver} from './ide-path-resolver.js'
import {readJsonFile, writeJsonFile} from './json-io.js'
import type {WindsurfHooks} from './windsurf-hooks-types.js'

/**
 * Read Windsurf hooks from file
 *
 * @param path - Path to hooks.json file
 * @returns Parsed hooks or undefined if file doesn't exist or is invalid
 */
export async function readWindsurfHooks(path: string): Promise<undefined | WindsurfHooks> {
  return readJsonFile<WindsurfHooks>(path)
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
  return writeJsonFile(path, hooks, {backup: true})
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
  const resolver = new IdePathResolver(projectDir)
  return resolver.getWindsurfHooks()
}
