/**
 * TypeScript interfaces for Claude Code settings.json structure
 * Based on Claude Code documentation and research
 */

/**
 * Hook command configuration
 */
export interface HookCommand {
  /** Type of hook action */
  type: 'command'
  /** Command to execute */
  command: string
  /** Optional timeout in seconds */
  timeout?: number
}

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  /** Tool name pattern to match (regex supported) */
  matcher: string
  /** Execute only once per session */
  once?: boolean
  /** Array of hook commands to execute */
  hooks: HookCommand[]
}

/**
 * Hook event types supported by Claude Code
 */
export type HookEventType =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PermissionRequest'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionEnd'
  | 'PreCompact'
  | 'Notification'

/**
 * Hooks configuration
 * Maps event types to arrays of hook matchers
 */
export type HooksConfig = Partial<Record<HookEventType, HookMatcher[]>>

/**
 * Permission patterns for tool access
 */
export interface Permissions {
  /** Allowed tool patterns */
  allow?: string[]
  /** Denied tool patterns */
  deny?: string[]
}

/**
 * Enabled plugins configuration
 */
export type EnabledPlugins = Record<string, boolean>

/**
 * Environment variables configuration
 */
export type EnvConfig = Record<string, string>

/**
 * Complete Claude Code settings.json structure
 */
export interface ClaudeSettings {
  /** Default model to use */
  model?: string
  /** Tool permissions */
  permissions?: Permissions
  /** Environment variables */
  env?: EnvConfig
  /** Enabled plugins */
  enabledPlugins?: EnabledPlugins
  /** Hook configurations */
  hooks?: HooksConfig
  /** Spinner tips enabled */
  spinnerTipsEnabled?: boolean
  /** Cleanup period in days */
  cleanupPeriodDays?: number
}

/**
 * Settings file types in hierarchy
 */
export type SettingsFileType = 'user' | 'project' | 'local'

/**
 * Settings file location
 */
export interface SettingsLocation {
  /** Type of settings file */
  type: SettingsFileType
  /** Absolute path to settings file */
  path: string
  /** Whether file exists */
  exists: boolean
}
