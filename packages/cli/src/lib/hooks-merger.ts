import type {ClaudeSettings, HookCommand, HookEventType, HookMatcher, HooksConfig} from './claude-settings-types.js'

/**
 * Check if two hook commands are equivalent
 */
function areHookCommandsEqual(a: HookCommand, b: HookCommand): boolean {
  return a.type === b.type && a.command === b.command && a.timeout === b.timeout
}

/**
 * Check if two hook matchers are equivalent
 */
function areHookMatchersEqual(a: HookMatcher, b: HookMatcher): boolean {
  if (a.matcher !== b.matcher || a.once !== b.once) {
    return false
  }

  if (a.hooks.length !== b.hooks.length) {
    return false
  }

  // Check if all hooks are equivalent (order-independent)
  return a.hooks.every((hookA) => b.hooks.some((hookB) => areHookCommandsEqual(hookA, hookB)))
}

/**
 * Merge hook matchers for a single event type
 * Deduplicates based on matcher configuration
 *
 * @param existing - Existing hook matchers
 * @param template - Template hook matchers to merge
 * @returns Merged array of hook matchers
 */
function mergeHookMatchers(existing: HookMatcher[], template: HookMatcher[]): HookMatcher[] {
  const merged = [...existing]

  for (const templateMatcher of template) {
    // Check if equivalent matcher already exists
    const isDuplicate = merged.some((existingMatcher) => areHookMatchersEqual(existingMatcher, templateMatcher))

    if (!isDuplicate) {
      merged.push(templateMatcher)
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
 * - Deduplicate based on matcher configuration
 * - Maintain order: existing hooks first, then template hooks
 *
 * @param existing - Existing hooks configuration (will not be modified)
 * @param template - Template hooks configuration to merge
 * @returns New merged hooks configuration
 */
export function mergeHooks(existing: HooksConfig | undefined, template: HooksConfig | undefined): HooksConfig {
  // If no template hooks, return existing (or empty object)
  if (!template || Object.keys(template).length === 0) {
    return existing || {}
  }

  // If no existing hooks, return template
  if (!existing || Object.keys(existing).length === 0) {
    return template
  }

  const merged: HooksConfig = {}

  // Get all unique event types from both configurations
  const allEventTypes = new Set<HookEventType>([
    ...(Object.keys(existing) as HookEventType[]),
    ...(Object.keys(template) as HookEventType[]),
  ])

  // Merge each event type
  for (const eventType of allEventTypes) {
    const existingMatchers = existing[eventType] || []
    const templateMatchers = template[eventType] || []

    merged[eventType] = mergeHookMatchers(existingMatchers, templateMatchers)
  }

  return merged
}

/**
 * Merge complete Claude settings configurations
 *
 * Strategy:
 * - Shallow merge most properties (template overrides existing)
 * - Deep merge hooks using mergeHooks function
 * - Deep merge permissions by concatenating arrays
 *
 * @param existing - Existing settings (will not be modified)
 * @param template - Template settings to merge
 * @returns New merged settings configuration
 */
export function mergeClaudeSettings(
  existing: ClaudeSettings | undefined,
  template: ClaudeSettings | undefined,
): ClaudeSettings {
  // If no template settings, return existing (or empty object)
  if (!template || Object.keys(template).length === 0) {
    return existing || {}
  }

  // If no existing settings, return template
  if (!existing || Object.keys(existing).length === 0) {
    return template
  }

  // Merge permissions by concatenating arrays (no duplicates)
  const mergedPermissions = {
    allow: [...new Set([...(existing.permissions?.allow || []), ...(template.permissions?.allow || [])])],
    deny: [...new Set([...(existing.permissions?.deny || []), ...(template.permissions?.deny || [])])],
  }

  // Merge environment variables (template values override)
  const mergedEnv = {
    ...existing.env,
    ...template.env,
  }

  // Merge enabled plugins (template values override)
  const mergedEnabledPlugins = {
    ...existing.enabledPlugins,
    ...template.enabledPlugins,
  }

  // Merge hooks using dedicated function
  const mergedHooks = mergeHooks(existing.hooks, template.hooks)

  // Create merged settings
  const merged: ClaudeSettings = {
    ...existing,
    ...template,
    permissions: mergedPermissions,
    env: mergedEnv,
    enabledPlugins: mergedEnabledPlugins,
    hooks: mergedHooks,
  }

  return merged
}
