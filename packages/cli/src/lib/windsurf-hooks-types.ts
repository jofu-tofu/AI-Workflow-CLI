/**
 * TypeScript interfaces for Windsurf Cascade hooks.json structure
 * Based on Windsurf Cascade Hooks documentation
 */

/**
 * Hook command configuration
 */
export interface WindsurfHookCommand {
  /** Command to execute (bash, python, node, etc.) */
  command: string
  /** Optional timeout in milliseconds */
  timeout?: number
  /** Show output in Cascade UI */
  show_output?: boolean
  /** Execute only once (for session-level hooks) */
  once?: boolean
}

/**
 * Hook event types supported by Windsurf Cascade
 */
export type WindsurfHookEventType =
  | 'pre_read_code'
  | 'post_read_code'
  | 'pre_write_code'
  | 'post_write_code'
  | 'pre_execute_command'
  | 'post_execute_command'
  | 'pre_user_prompt'
  | 'post_user_prompt'
  | 'pre_model_response'
  | 'post_model_response'

/**
 * Hooks configuration
 * Maps event types to arrays of hook commands
 */
export type WindsurfHooksConfig = Partial<Record<WindsurfHookEventType, WindsurfHookCommand[]>>

/**
 * Complete Windsurf hooks.json structure
 */
export interface WindsurfHooks {
  /** Hook configurations */
  hooks: WindsurfHooksConfig
}
