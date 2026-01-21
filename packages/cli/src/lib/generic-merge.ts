/**
 * @file Generic merge utilities for configuration merging.
 *
 * This module provides reusable utilities for merging arrays with deduplication
 * and merging configuration objects by event type. Used by hook merger modules
 * to eliminate code duplication.
 *
 * ## Usage
 * ```typescript
 * import { mergeArraysWithDedup, mergeConfigByEventType } from '../lib/generic-merge.js'
 *
 * // Merge arrays with custom equality
 * const merged = mergeArraysWithDedup(existing, template, (a, b) => a.id === b.id)
 *
 * // Merge config objects by event type
 * const mergedConfig = mergeConfigByEventType(
 *   existingConfig,
 *   templateConfig,
 *   (existing, template) => mergeArraysWithDedup(existing, template, areEqual)
 * )
 * ```
 *
 * @module lib/generic-merge
 */

/**
 * Merge two arrays with deduplication based on custom equality function.
 *
 * Items from the template array are appended to the existing array only if
 * no equivalent item exists. Order is preserved: existing items first.
 *
 * @template T - Type of array elements
 * @param existing - Existing array (preserved in order)
 * @param template - Template array to merge (items appended if not duplicate)
 * @param areEqual - Function to check if two items are equivalent
 * @returns New merged array with duplicates removed
 *
 * @example
 * ```typescript
 * const merged = mergeArraysWithDedup(
 *   [{id: 1, name: 'a'}],
 *   [{id: 1, name: 'b'}, {id: 2, name: 'c'}],
 *   (a, b) => a.id === b.id
 * )
 * // Result: [{id: 1, name: 'a'}, {id: 2, name: 'c'}]
 * ```
 */
export function mergeArraysWithDedup<T>(
  existing: T[],
  template: T[],
  areEqual: (a: T, b: T) => boolean,
): T[] {
  const merged = [...existing]

  for (const templateItem of template) {
    const isDuplicate = merged.some((existingItem) => areEqual(existingItem, templateItem))

    if (!isDuplicate) {
      merged.push(templateItem)
    }
  }

  return merged
}

/**
 * Merge configuration objects organized by event type.
 *
 * Each configuration maps event types to arrays of items. This function
 * merges configurations by:
 * 1. Collecting all event types from both configurations
 * 2. For each event type, merging the arrays using the provided merge function
 *
 * @template TEventType - Type of event type keys (typically string union)
 * @template TItem - Type of items in the arrays
 * @template TConfig - Type of the configuration object
 * @param existing - Existing configuration (may be undefined)
 * @param template - Template configuration to merge (may be undefined)
 * @param mergeArrays - Function to merge arrays for a single event type
 * @returns New merged configuration
 *
 * @example
 * ```typescript
 * const mergedConfig = mergeConfigByEventType(
 *   {click: [handler1], hover: [handler2]},
 *   {click: [handler3], focus: [handler4]},
 *   (existing, template) => mergeArraysWithDedup(existing, template, areEqual)
 * )
 * // Result: {click: [handler1, handler3], hover: [handler2], focus: [handler4]}
 * ```
 */
export function mergeConfigByEventType<
  TEventType extends string,
  TItem,
  TConfig extends Partial<Record<TEventType, TItem[]>>,
>(
  existing: TConfig | undefined,
  template: TConfig | undefined,
  mergeArrays: (existing: TItem[], template: TItem[]) => TItem[],
): TConfig {
  // If no template, return existing (or empty object)
  if (!template || Object.keys(template).length === 0) {
    return (existing || {}) as TConfig
  }

  // If no existing, return template
  if (!existing || Object.keys(existing).length === 0) {
    return template
  }

  const merged: Partial<Record<TEventType, TItem[]>> = {}

  // Get all unique event types from both configurations
  const allEventTypes = new Set<TEventType>([
    ...(Object.keys(existing) as TEventType[]),
    ...(Object.keys(template) as TEventType[]),
  ])

  // Merge each event type
  for (const eventType of allEventTypes) {
    const existingItems = existing[eventType] || []
    const templateItems = template[eventType] || []

    merged[eventType] = mergeArrays(existingItems, templateItems)
  }

  return merged as TConfig
}
