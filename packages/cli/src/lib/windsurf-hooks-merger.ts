import {mergeArraysWithDedup, mergeConfigByEventType} from './generic-merge.js'
import type {WindsurfHookCommand, WindsurfHookEventType, WindsurfHooks, WindsurfHooksConfig} from './windsurf-hooks-types.js'

/**
 * Check if two hook commands are equivalent
 */
function areHookCommandsEqual(a: WindsurfHookCommand, b: WindsurfHookCommand): boolean {
  return (
    a.command === b.command &&
    a.timeout === b.timeout &&
    a.show_output === b.show_output &&
    a.once === b.once
  )
}

/**
 * Merge hooks configurations from template into existing
 *
 * Strategy:
 * - For each event type in template hooks
 * - Concatenate with existing hooks for that event
 * - Deduplicate based on command configuration
 * - Maintain order: existing hooks first, then template hooks
 *
 * @param existing - Existing hooks configuration (will not be modified)
 * @param template - Template hooks configuration to merge
 * @returns New merged hooks configuration
 */
export function mergeWindsurfHooksConfig(
  existing: undefined | WindsurfHooksConfig,
  template: undefined | WindsurfHooksConfig,
): WindsurfHooksConfig {
  return mergeConfigByEventType<WindsurfHookEventType, WindsurfHookCommand, WindsurfHooksConfig>(
    existing,
    template,
    (existingCommands, templateCommands) =>
      mergeArraysWithDedup(existingCommands, templateCommands, areHookCommandsEqual),
  )
}

/**
 * Merge complete Windsurf hooks configurations
 *
 * Strategy:
 * - Deep merge hooks using mergeWindsurfHooksConfig function
 *
 * @param existing - Existing hooks (will not be modified)
 * @param template - Template hooks to merge
 * @returns New merged hooks configuration
 */
export function mergeWindsurfHooks(
  existing: undefined | WindsurfHooks,
  template: undefined | WindsurfHooks,
): WindsurfHooks {
  // If no template hooks, return existing (or empty hooks)
  if (!template || !template.hooks || Object.keys(template.hooks).length === 0) {
    return existing || {hooks: {}}
  }

  // If no existing hooks, return template
  if (!existing || !existing.hooks || Object.keys(existing.hooks).length === 0) {
    return template
  }

  // Merge hooks using dedicated function
  const mergedHooksConfig = mergeWindsurfHooksConfig(existing.hooks, template.hooks)

  // Create merged hooks
  const merged: WindsurfHooks = {
    hooks: mergedHooksConfig,
  }

  return merged
}
