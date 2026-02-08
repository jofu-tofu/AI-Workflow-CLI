/**
 * Unified reconstruction of shared IDE settings files.
 *
 * Both `aiw init` and `aiw clear` use the same operation: reconstruct shared
 * settings from the union of all active templates. Install adds a template to
 * the list; clear removes one. The reconstruction logic is identical.
 *
 * Template files fall into two categories:
 * 1. **Method-owned** — lives in method-namespaced paths (e.g., `.claude/commands/cc-native/`),
 *    owned exclusively by one template. Handled by copy/delete, not by this module.
 * 2. **Shared** — lives in common locations (e.g., `settings.json`), multiple templates
 *    contribute. Handled by this module via reconstruction from source.
 *
 * @module lib/template-settings-reconstructor
 */

import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import type {ClaudeSettings} from './claude-settings-types.js'
import {mergeClaudeSettings} from './hooks-merger.js'
import {IdePathResolver} from './ide-path-resolver.js'
import {readClaudeSettings, writeClaudeSettings} from './settings-hierarchy.js'
import {getTemplatePath} from './template-resolver.js'
import {getTargetHooksFile, readWindsurfHooks, writeWindsurfHooks} from './windsurf-hooks-hierarchy.js'
import {mergeWindsurfHooks} from './windsurf-hooks-merger.js'
import type {WindsurfHooks} from './windsurf-hooks-types.js'

/**
 * Get the path to the _shared template directory.
 *
 * @returns Absolute path to the _shared template
 */
function getSharedTemplatePath(): string {
  const currentFilePath = fileURLToPath(import.meta.url)
  const currentDir = dirname(currentFilePath)
  return join(currentDir, '..', 'templates', '_shared')
}

/**
 * Reconstruct .claude/settings.json and .windsurf/hooks.json from the union
 * of all specified templates.
 *
 * The function:
 * 1. Starts with empty settings
 * 2. Merges _shared template settings (always included)
 * 3. For each active template, merges its template-source settings
 * 4. Writes the result to the IDE settings file
 *
 * Uses mergeClaudeSettings() from hooks-merger.ts for dedup-aware merging.
 *
 * Install calls: reconstructIdeSettings(targetDir, [...existingTemplates, newTemplate], ides)
 * Clear calls:   reconstructIdeSettings(targetDir, existingTemplates.filter(t => t !== removed), ides)
 *
 * @param targetDir - Project root directory
 * @param activeTemplates - Template names to include (e.g., ['cc-native', 'bmad'])
 * @param ides - IDEs to reconstruct for (e.g., ['claude', 'windsurf'])
 */
export async function reconstructIdeSettings(
  targetDir: string,
  activeTemplates: string[],
  ides: string[],
): Promise<void> {
  const sharedTemplatePath = getSharedTemplatePath()

  if (ides.includes('claude')) {
    await reconstructClaudeSettings(targetDir, activeTemplates, sharedTemplatePath)
  }

  if (ides.includes('windsurf')) {
    await reconstructWindsurfHooks(targetDir, activeTemplates, sharedTemplatePath)
  }
}

/**
 * Reconstruct .claude/settings.json from scratch using template sources.
 */
async function reconstructClaudeSettings(
  targetDir: string,
  activeTemplates: string[],
  sharedTemplatePath: string,
): Promise<void> {
  const resolver = new IdePathResolver(targetDir)
  const settingsPath = resolver.getClaudeSettings()

  // Read existing settings to preserve non-template fields (methods tracking, etc.)
  const existingSettings = await readClaudeSettings(settingsPath)

  // Preserve the methods tracking from existing settings
  const methodsTracking = existingSettings?.methods

  // Start from empty and merge all template settings
  let reconstructed: ClaudeSettings = {}

  // 1. Merge _shared template settings
  const sharedSettingsPath = join(sharedTemplatePath, '.claude', 'settings.json')
  const sharedSettings = await readClaudeSettings(sharedSettingsPath)
  if (sharedSettings) {
    reconstructed = mergeClaudeSettings(reconstructed, sharedSettings)
  }

  // 2. Merge each active template's settings (sequential for deterministic merge order)
   
  for (const template of activeTemplates) {
    try {
      const templatePath = await getTemplatePath(template) // eslint-disable-line no-await-in-loop
      const templateSettingsPath = join(templatePath, '.claude', 'settings.json')
      const templateSettings = await readClaudeSettings(templateSettingsPath) // eslint-disable-line no-await-in-loop
      if (templateSettings) {
        reconstructed = mergeClaudeSettings(reconstructed, templateSettings)
      }
    } catch {
      // Template not found — skip
    }
  }

  // 3. Restore methods tracking
  if (methodsTracking && Object.keys(methodsTracking).length > 0) {
    reconstructed.methods = methodsTracking
  }

  // 4. Write reconstructed settings
  await writeClaudeSettings(settingsPath, reconstructed)
}

/**
 * Reconstruct .windsurf/hooks.json from scratch using template sources.
 */
async function reconstructWindsurfHooks(
  targetDir: string,
  activeTemplates: string[],
  sharedTemplatePath: string,
): Promise<void> {
  const hooksPath = getTargetHooksFile(targetDir)

  // Start from empty
  let reconstructed: WindsurfHooks = {hooks: {}}

  // 1. Merge _shared template hooks
  const sharedHooksPath = join(sharedTemplatePath, '.windsurf', 'hooks.json')
  const sharedHooks = await readWindsurfHooks(sharedHooksPath)
  if (sharedHooks) {
    reconstructed = mergeWindsurfHooks(reconstructed, sharedHooks)
  }

  // 2. Merge each active template's hooks (sequential for deterministic merge order)
   
  for (const template of activeTemplates) {
    try {
      const templatePath = await getTemplatePath(template) // eslint-disable-line no-await-in-loop
      const templateHooksPath = join(templatePath, '.windsurf', 'hooks.json')
      const templateHooks = await readWindsurfHooks(templateHooksPath) // eslint-disable-line no-await-in-loop
      if (templateHooks) {
        reconstructed = mergeWindsurfHooks(reconstructed, templateHooks)
      }
    } catch {
      // Template not found — skip
    }
  }

  // 3. Write reconstructed hooks
  await writeWindsurfHooks(hooksPath, reconstructed)
}
