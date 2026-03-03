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

import {join} from 'node:path'

import type {ClaudeSettings, HookEventType} from './claude-settings-types.js'
import {getCoreClaudeSettingsBase, getCoreWindsurfHooksBase} from './core-ide-base.js'
import {mergeClaudeSettings} from './hooks-merger.js'
import {IdePathResolver} from './ide-path-resolver.js'
import {adaptHookCommand, validateCommandsForPlatform} from './platform-commands.js'
import {readClaudeSettings, writeClaudeSettings} from './settings-hierarchy.js'
import {getTemplatePath} from './template-resolver.js'
import {getTargetHooksFile, readWindsurfHooks, writeWindsurfHooks} from './windsurf-hooks-hierarchy.js'
import {mergeWindsurfHooks} from './windsurf-hooks-merger.js'
import type {WindsurfHooks} from './windsurf-hooks-types.js'


/**
 * Reconstruct .claude/settings.json and .windsurf/hooks.json from the union
 * of all specified templates.
 *
 * Note: Codex content is file-based today (`.codex/workflows/*`) and does not
 * have a merged settings artifact, so it is intentionally ignored here.
 *
 * The function:
 * 1. Starts with empty settings
 * 2. Merges _shared template settings (when active templates exist)
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
 * @param ides - IDEs to reconstruct for (currently claude/windsurf)
 */
export async function reconstructIdeSettings(
  targetDir: string,
  activeTemplates: string[],
  ides: string[],
): Promise<void> {
  if (ides.includes('claude')) {
    await reconstructClaudeSettings(targetDir, activeTemplates)
  }

  if (ides.includes('windsurf')) {
    await reconstructWindsurfHooks(targetDir, activeTemplates)
  }
}

/**
 * Reconstruct .claude/settings.json from scratch using template sources.
 */
async function reconstructClaudeSettings(
  targetDir: string,
  activeTemplates: string[],
): Promise<void> {
  const resolver = new IdePathResolver(targetDir)
  const settingsPath = resolver.getClaudeSettings()

  // Read existing settings to preserve non-template fields (methods tracking, etc.)
  const existingSettings = await readClaudeSettings(settingsPath)

  // Preserve the methods tracking from existing settings
  const methodsTracking = existingSettings?.methods

  // Start from core-owned base settings, then merge method templates.
  let reconstructed: ClaudeSettings = getCoreClaudeSettingsBase()

  // Merge each active template's settings (sequential for deterministic merge order)
   
  for (const template of activeTemplates) {
    try {
      const templatePath = await getTemplatePath(template) // eslint-disable-line no-await-in-loop
      const templateSettingsPath = join(templatePath, '.claude', 'settings.json')
      const templateSettings = await readClaudeSettings(templateSettingsPath) // eslint-disable-line no-await-in-loop
      if (templateSettings) {
        reconstructed = mergeClaudeSettings(reconstructed, normalizeTemplateSettingsPaths(templateSettings))
      }
    } catch {
      // Template not found — skip
    }
  }

  // 3. Restore methods tracking
  if (methodsTracking && Object.keys(methodsTracking).length > 0) {
    reconstructed.methods = methodsTracking
  }

  // 4. Platform-adapt hook commands (Windows cmd.exe compatibility)
  reconstructed = adaptSettingsForPlatform(reconstructed)

  // 5. Write reconstructed settings
  await writeClaudeSettings(settingsPath, reconstructed)
}

/**
 * Reconstruct .windsurf/hooks.json from scratch using template sources.
 */
async function reconstructWindsurfHooks(
  targetDir: string,
  activeTemplates: string[],
): Promise<void> {
  const hooksPath = getTargetHooksFile(targetDir)

  // Start from core-owned base hooks.
  let reconstructed: WindsurfHooks = getCoreWindsurfHooksBase()

  // Merge each active template's hooks (sequential for deterministic merge order)
   
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

/**
 * Adapt all command strings in settings for the current platform.
 * On Windows: rewrites commands for cmd.exe compatibility.
 * Validates adapted commands and fails fast if unknown remain non-portable.
 */
function adaptSettingsForPlatform(settings: ClaudeSettings): ClaudeSettings {
  const result = {...settings}
  const allCommands: string[] = []

  // Adapt top-level command configs
  if (result.statusLine && 'command' in result.statusLine) {
    result.statusLine = {...result.statusLine, command: adaptHookCommand(result.statusLine.command)}
    allCommands.push(result.statusLine.command)
  }

  if (result.fileSuggestion && 'command' in result.fileSuggestion) {
    result.fileSuggestion = {...result.fileSuggestion, command: adaptHookCommand(result.fileSuggestion.command)}
    allCommands.push(result.fileSuggestion.command)
  }

  // Adapt all hook commands
  if (result.hooks) {
    const adapted: typeof result.hooks = {}
    for (const [event, matchers] of Object.entries(result.hooks)) {
      if (!matchers) continue
      adapted[event as HookEventType] = matchers.map((matcher) => ({
        ...matcher,
        hooks: matcher.hooks.map((hook) => {
          if (hook.type !== 'command') return hook
          const adaptedCmd = adaptHookCommand(hook.command)
          allCommands.push(adaptedCmd)
          return {...hook, command: adaptedCmd}
        }),
      }))
    }

    result.hooks = adapted
  }

  // Validate: fail fast if unknown command still contains bash-only syntax on Windows
  validateCommandsForPlatform(allCommands)

  return result
}

function normalizeTemplateSettingsPaths(settings: ClaudeSettings): ClaudeSettings {
  const normalized: ClaudeSettings = structuredClone(settings)

  if (normalized.statusLine?.command) {
    normalized.statusLine.command = normalizeTemplateCommandPath(normalized.statusLine.command)
  }

  if (normalized.fileSuggestion?.command) {
    normalized.fileSuggestion.command = normalizeTemplateCommandPath(normalized.fileSuggestion.command)
  }

  if (normalized.hooks) {
    for (const event of Object.keys(normalized.hooks) as HookEventType[]) {
      const matchers = normalized.hooks[event]
      if (!matchers) continue
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          hook.command = normalizeTemplateCommandPath(hook.command)
        }
      }
    }
  }

  return normalized
}

function normalizeTemplateCommandPath(value: string): string {
  return value.replaceAll('.aiwcli/_shared/', '.aiwcli/_core/')
}

