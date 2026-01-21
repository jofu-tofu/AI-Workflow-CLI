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
 * Merge hook commands for a single event type
 * Deduplicates based on command configuration
 *
 * @param existing - Existing hook commands
 * @param template - Template hook commands to merge
 * @returns Merged array of hook commands
 */
function mergeHookCommands(
  existing: WindsurfHookCommand[],
  template: WindsurfHookCommand[],
): WindsurfHookCommand[] {
  const merged = [...existing]

  for (const templateCommand of template) {
    // Check if equivalent command already exists
    const isDuplicate = merged.some((existingCommand) => areHookCommandsEqual(existingCommand, templateCommand))

    if (!isDuplicate) {
      merged.push(templateCommand)
    }
  }

  return merged
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
  // If no template hooks, return existing (or empty object)
  if (!template || Object.keys(template).length === 0) {
    return existing || {}
  }

  // If no existing hooks, return template
  if (!existing || Object.keys(existing).length === 0) {
    return template
  }

  const merged: WindsurfHooksConfig = {}

  // Get all unique event types from both configurations
  const allEventTypes = new Set<WindsurfHookEventType>([
    ...(Object.keys(existing) as WindsurfHookEventType[]),
    ...(Object.keys(template) as WindsurfHookEventType[]),
  ])

  // Merge each event type
  for (const eventType of allEventTypes) {
    const existingCommands = existing[eventType] || []
    const templateCommands = template[eventType] || []

    merged[eventType] = mergeHookCommands(existingCommands, templateCommands)
  }

  return merged
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
