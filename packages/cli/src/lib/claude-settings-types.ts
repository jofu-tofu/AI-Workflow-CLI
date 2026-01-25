/**
 * TypeScript interfaces for Claude Code settings.json structure
 * Based on Claude Code documentation and research
 */

/**
 * Hook command configuration
 */
export interface HookCommand {
  /** Command to execute */
  command: string
  /** Optional timeout in seconds */
  timeout?: number
  /** Type of hook action */
  type: 'command'
}

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  /** Array of hook commands to execute */
  hooks: HookCommand[]
  /** Tool name pattern to match (regex supported) */
  matcher: string
  /** Execute only once per session */
  once?: boolean
}

/**
 * Hook event types supported by Claude Code
 */
export type HookEventType =
  | 'Notification'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PreCompact'
  | 'PreToolUse'
  | 'SessionEnd'
  | 'SessionStart'
  | 'Stop'
  | 'SubagentStop'
  | 'UserPromptSubmit'

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
 * Method installation tracking metadata
 */
export interface MethodTracking {
  /** IDEs configured for this method */
  ides?: string[]
  /** ISO timestamp when method was installed */
  installedAt: string
}

/**
 * Methods tracking object
 * Maps method names to their installation metadata
 */
export type MethodsConfig = Record<string, MethodTracking>

/**
 * Complete Claude Code settings.json structure
 */
export interface ClaudeSettings {
  /** Cleanup period in days */
  cleanupPeriodDays?: number
  /** Enabled plugins */
  enabledPlugins?: EnabledPlugins
  /** Environment variables */
  env?: EnvConfig
  /** Hook configurations */
  hooks?: HooksConfig
  /** Installed methods tracking */
  methods?: MethodsConfig
  /** Default model to use */
  model?: string
  /** Tool permissions */
  permissions?: Permissions
  /** Spinner tips enabled */
  spinnerTipsEnabled?: boolean
}

/**
 * Settings file types in hierarchy
 */
export type SettingsFileType = 'local' | 'project' | 'user'

/**
 * Settings file location
 */
export interface SettingsLocation {
  /** Whether file exists */
  exists: boolean
  /** Absolute path to settings file */
  path: string
  /** Type of settings file */
  type: SettingsFileType
}
