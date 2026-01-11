/**
 * @file Version detection and compatibility checking for Claude Code CLI.
 *
 * This module provides:
 * - Claude Code version detection via `claude --version`
 * - Semantic version compatibility checking
 * - Graceful degradation when version unavailable
 *
 * ## Usage Pattern
 *
 * ```typescript
 * import {getClaudeCodeVersion, checkVersionCompatibility} from '../lib/version.js'
 *
 * const version = await getClaudeCodeVersion()
 * const versionCheck = checkVersionCompatibility(version)
 *
 * if (versionCheck.warning) {
 *   this.warn(versionCheck.warning)
 * }
 *
 * if (this.debugEnabled) {
 *   this.debug(`Claude Code version: ${versionCheck.version || 'unknown'}`)
 * }
 * ```
 *
 * @module lib/version
 */

import {exec} from 'node:child_process'
import {promisify} from 'node:util'

const execAsync = promisify(exec)

/**
 * Minimum supported Claude Code version.
 * Versions below this will trigger a compatibility warning.
 */
export const MIN_CLAUDE_CODE_VERSION = '0.1.0'

/**
 * Known incompatible Claude Code versions.
 * These versions have confirmed issues with AI Workflow CLI.
 */
export const INCOMPATIBLE_VERSIONS = ['0.0.9']

/**
 * Result of version compatibility check.
 */
export interface VersionCheckResult {
  /**
   * Whether the version is compatible with AI Workflow CLI.
   * If version is unknown, assumes compatible (graceful degradation).
   */
  compatible: boolean

  /**
   * Detected version string (e.g., "0.1.0") or null if unavailable.
   */
  version: null | string

  /**
   * Warning message if incompatible or version unavailable.
   * Undefined if version is compatible.
   */
  warning?: string
}

/**
 * Detects Claude Code version by executing `claude --version`.
 *
 * Parses version output formats:
 * - "claude 0.1.0"
 * - "claude version 0.1.0"
 *
 * Returns null on any failure (command not found, invalid output, etc.)
 * to support graceful degradation.
 *
 * @returns Version string (e.g., "0.1.0") or null if unavailable
 *
 * @example
 * ```typescript
 * const version = await getClaudeCodeVersion()
 * if (version) {
 *   console.log(`Claude Code version: ${version}`)
 * } else {
 *   console.log('Claude Code version unavailable')
 * }
 * ```
 */
export async function getClaudeCodeVersion(): Promise<null | string> {
  try {
    // Set 5 second timeout to prevent hanging
    const {stdout} = await execAsync('claude --version', {timeout: 5000})

    // Parse version from output formats:
    // - New format: "2.1.3 (Claude Code)"
    // - Old format: "claude 0.1.0" or "claude version 0.1.0"
    const newFormatMatch = stdout.match(/^(\d+\.\d+\.\d+)\s+\(Claude Code\)/i)
    if (newFormatMatch?.[1]) {
      return newFormatMatch[1]
    }

    const oldFormatMatch = stdout.match(/claude\s+(?:version\s+)?(\d+\.\d+\.\d+)/i)
    return oldFormatMatch?.[1] ?? null
  } catch {
    // Command not found, execution failed, timeout, or other error
    // Gracefully return null to allow launch to continue
    return null
  }
}

/**
 * Checks if a Claude Code version is compatible with AI Workflow CLI.
 *
 * Compatibility rules:
 * 1. Version must be >= MIN_CLAUDE_CODE_VERSION
 * 2. Version must not be in INCOMPATIBLE_VERSIONS list
 * 3. If version is null/unknown, assumes compatible (graceful degradation)
 *
 * @param version - Version string (e.g., "0.1.0") or null if unavailable
 * @returns Compatibility check result with version, compatible flag, and optional warning
 *
 * @example
 * ```typescript
 * const result = checkVersionCompatibility('0.1.0')
 * if (result.warning) {
 *   this.warn(result.warning)
 * }
 * ```
 */
export function checkVersionCompatibility(version: null | string | undefined): VersionCheckResult {
  // Handle null/undefined version (graceful degradation)
  if (!version) {
    return {
      compatible: true, // Assume compatible if unknown
      version: null,
      warning: 'Claude Code version could not be determined. Proceeding with caution.',
    }
  }

  // Check known incompatible versions first
  if (INCOMPATIBLE_VERSIONS.includes(version)) {
    return {
      compatible: false,
      version,
      warning: `Claude Code version ${version} has known issues with AI Workflow CLI. Please upgrade to ${MIN_CLAUDE_CODE_VERSION} or later.`,
    }
  }

  // Parse version numbers for semantic comparison
  const versionParts = version.split('.').map(Number)
  const minVersionParts = MIN_CLAUDE_CODE_VERSION.split('.').map(Number)

  const major = versionParts[0] ?? 0
  const minor = versionParts[1] ?? 0
  const patch = versionParts[2] ?? 0

  const minMajor = minVersionParts[0] ?? 0
  const minMinor = minVersionParts[1] ?? 0
  const minPatch = minVersionParts[2] ?? 0

  // Check if version meets minimum requirement
  const isBelowMinimum =
    major < minMajor ||
    (major === minMajor && minor < minMinor) ||
    (major === minMajor && minor === minMinor && patch < minPatch)

  if (isBelowMinimum) {
    return {
      compatible: false,
      version,
      warning: `Claude Code version ${version} is below minimum ${MIN_CLAUDE_CODE_VERSION}. Some features may not work correctly. Please upgrade Claude Code.`,
    }
  }

  // Version is compatible
  return {
    compatible: true,
    version,
  }
}
