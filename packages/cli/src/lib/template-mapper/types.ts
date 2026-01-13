/**
 * Template Mapper Types
 *
 * Core type definitions for the cross-platform template conversion system.
 * Implements the superset schema from STANDARD-SCHEMA.md and platform
 * adapter interfaces from PLATFORM-ADAPTERS.md.
 */

// =============================================================================
// Platform Identifiers
// =============================================================================

/**
 * Supported target platforms for template conversion
 */
export type Platform = 'claude-code' | 'windsurf' | 'github-copilot'

/**
 * All supported platforms as a constant array
 */
export const PLATFORMS: readonly Platform[] = ['claude-code', 'windsurf', 'github-copilot'] as const

// =============================================================================
// Core Schema Types (Superset)
// =============================================================================

/**
 * Compatibility status for a platform
 */
export type CompatibilityStatus = 'full' | 'partial' | 'unsupported'

/**
 * Per-platform compatibility information
 */
export interface PlatformCompatibility {
  status: CompatibilityStatus
  notes?: string
}

/**
 * Emulation pattern for a specific capability gap
 */
export interface EmulationPattern {
  pattern: string
  fallback: string
  limitations?: string[]
}

/**
 * Permissions structure for Claude Code
 */
export interface Permissions {
  allow?: string[]
  deny?: string[]
}

/**
 * Hook configuration for lifecycle events (Claude Code 2.1.0+)
 */
export interface HookConfig {
  matcher?: string
  once?: boolean
  hooks: Array<{
    type: string
    command: string
    timeout?: number
  }>
}

/**
 * Lifecycle hooks for skills
 */
export interface LifecycleHooks {
  PreToolUse?: HookConfig[]
  PostToolUse?: HookConfig[]
  Stop?: HookConfig[]
}

/**
 * Handoff configuration for GitHub Copilot agents
 */
export interface Handoff {
  target: string
  button_label: string
  prompt?: string
}

/**
 * Superset YAML frontmatter specification
 * Captures ALL fields from all three platforms (Claude Code, Windsurf, GitHub Copilot)
 */
export interface TemplateMetadata {
  // ================================
  // Core Fields (Universal)
  // ================================
  name?: string
  description?: string
  version?: string

  // ================================
  // Claude Code Fields
  // ================================
  'allowed-tools'?: string[]
  model?: string
  context?: 'inherit' | 'fork'
  agent?: string
  permissions?: Permissions
  'disable-model-invocation'?: boolean
  'argument-hint'?: string
  hooks?: LifecycleHooks
  language?: string

  // ================================
  // Windsurf Fields
  // ================================
  trigger?: 'manual' | 'always_on' | 'model_decision' | 'glob'
  globs?: string[]
  labels?: string[]
  alwaysApply?: boolean
  author?: string

  // ================================
  // GitHub Copilot Fields
  // ================================
  applyTo?: string | string[]
  excludeAgent?: string | string[]
  mode?: 'agent' | 'ask' | 'edit'
  tools?: string[]
  infer?: boolean
  target?: 'vscode' | 'github-copilot'
  metadata?: Record<string, string>
  handoffs?: Handoff[]
  'mcp-servers'?: Record<string, unknown>

  // ================================
  // Cross-Platform Fields
  // ================================
  platforms?: Platform[]
  compatibility?: Partial<Record<Platform, PlatformCompatibility>>
  emulation?: Record<string, EmulationPattern>
}

/**
 * Parsed template with frontmatter and body content
 */
export interface ParsedTemplate {
  /** Parsed YAML frontmatter */
  metadata: TemplateMetadata
  /** Raw markdown body content (after frontmatter) */
  content: string
  /** Original file path (if loaded from file) */
  sourcePath?: string
}

// =============================================================================
// Transformation Types
// =============================================================================

/**
 * Warning categories for transformation issues
 */
export type WarningCategory =
  | 'UNSUPPORTED'  // Feature doesn't exist on target platform
  | 'EMULATED'     // Feature is approximated
  | 'LIMIT'        // Platform constraint exceeded
  | 'SECURITY'     // Advisory-only restriction
  | 'DEGRADED'     // Reduced functionality

/**
 * Warning generated during transformation
 */
export interface TransformationWarning {
  category: WarningCategory
  message: string
  details?: string
  field?: string
}

/**
 * Result of a platform transformation
 */
export interface TransformationResult {
  /** Target platform */
  platform: Platform
  /** Generated files (path -> content) */
  files: Map<string, string>
  /** Warnings generated during transformation */
  warnings: TransformationWarning[]
  /** Whether transformation succeeded */
  success: boolean
  /** Error message if transformation failed */
  error?: string
}

// =============================================================================
// Platform Adapter Interface
// =============================================================================

/**
 * Platform adapter interface
 *
 * Adapters transform templates from the standard format to platform-native formats.
 * Each adapter handles:
 * - Field mapping (superset -> platform native)
 * - Emulation patterns (for unsupported features)
 * - Output structure (platform-specific file locations)
 * - Validation (platform-specific constraints)
 * - Warning generation (for degraded features)
 */
export interface PlatformAdapter {
  /** The platform this adapter targets */
  readonly platform: Platform

  /**
   * Transform a parsed template to platform-native format
   * @param template Parsed template with metadata and content
   * @param options Transformation options
   * @returns Transformation result with generated files and warnings
   */
  transform(template: ParsedTemplate, options?: TransformOptions): TransformationResult

  /**
   * Validate a template for this platform
   * @param template Parsed template to validate
   * @returns Array of validation warnings/errors
   */
  validate(template: ParsedTemplate): TransformationWarning[]

  /**
   * Get the output path for the main generated file
   * @param template Parsed template
   * @returns Relative path where main file should be written
   */
  getOutputPath(template: ParsedTemplate): string
}

// =============================================================================
// Conversion Options
// =============================================================================

/**
 * Options for template transformation
 */
export interface TransformOptions {
  /** Target platform(s) for conversion. If not specified, uses template's `platforms` field or all platforms */
  targetPlatforms?: Platform[]

  /** Fail on any incompatibility (default: false, generates warnings instead) */
  strict?: boolean

  /** Output directory root (default: current directory) */
  outputDir?: string

  /** Include compatibility notes in output (default: true) */
  includeCompatibilityNotes?: boolean

  /** Include emulation pattern documentation (default: true) */
  includeEmulationDocs?: boolean

  /** Dry run - generate output but don't write files (default: false) */
  dryRun?: boolean
}

/**
 * Options for parsing templates
 */
export interface ParseOptions {
  /** Whether to validate required fields (default: true) */
  validateRequired?: boolean

  /** Custom base path for resolving relative paths */
  basePath?: string
}

// =============================================================================
// Mapping Engine Interface
// =============================================================================

/**
 * Overall conversion result for all platforms
 */
export interface ConversionResult {
  /** Source template path */
  sourcePath: string

  /** Parsed template */
  template: ParsedTemplate

  /** Results per platform */
  results: Map<Platform, TransformationResult>

  /** All warnings across all platforms */
  allWarnings: TransformationWarning[]

  /** Whether all transformations succeeded */
  success: boolean
}

/**
 * Mapping engine interface
 *
 * The mapping engine orchestrates the full conversion pipeline:
 * 1. Parse: YAML frontmatter + markdown -> ParsedTemplate
 * 2. Validate: Check schema compliance, compatibility markers
 * 3. Transform: Apply platform adapter rules
 * 4. Emulate: Apply workaround patterns for missing features
 * 5. Generate: Write platform-specific files
 */
export interface MappingEngine {
  /**
   * Parse a template file
   * @param filePath Path to template file
   * @param options Parse options
   * @returns Parsed template
   */
  parse(filePath: string, options?: ParseOptions): Promise<ParsedTemplate>

  /**
   * Parse template from string content
   * @param content Template content (YAML frontmatter + markdown)
   * @param options Parse options
   * @returns Parsed template
   */
  parseString(content: string, options?: ParseOptions): ParsedTemplate

  /**
   * Convert a template to all target platforms
   * @param template Parsed template or path to template file
   * @param options Conversion options
   * @returns Conversion result with all platform outputs
   */
  convert(
    template: ParsedTemplate | string,
    options?: TransformOptions
  ): Promise<ConversionResult>

  /**
   * Get the adapter for a specific platform
   * @param platform Target platform
   * @returns Platform adapter instance
   */
  getAdapter(platform: Platform): PlatformAdapter

  /**
   * Register a custom platform adapter
   * @param adapter Platform adapter to register
   */
  registerAdapter(adapter: PlatformAdapter): void
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity
  message: string
  field?: string
  suggestion?: string
}

/**
 * Schema validator interface
 */
export interface SchemaValidator {
  /**
   * Validate template metadata against the superset schema
   * @param metadata Template metadata to validate
   * @returns Array of validation issues
   */
  validate(metadata: TemplateMetadata): ValidationIssue[]

  /**
   * Check if metadata has all required fields for a platform
   * @param metadata Template metadata
   * @param platform Target platform
   * @returns Array of missing required fields
   */
  checkRequired(metadata: TemplateMetadata, platform: Platform): string[]
}

// =============================================================================
// Platform-Specific Output Types
// =============================================================================

/**
 * Claude Code skill output structure
 */
export interface ClaudeCodeOutput {
  skillPath: string            // .claude/skills/{name}/SKILL.md
  settingsPath?: string        // .claude/settings.json (if permissions specified)
  agentPath?: string          // .claude/agents/{name}.md (if agent specified)
}

/**
 * Windsurf output structure
 */
export interface WindsurfOutput {
  workflowPath: string         // .windsurf/workflows/{name}.md
  personaRulePath?: string     // .windsurf/rules/agent-{name}.md (if agent specified)
  permissionRulePath?: string  // .windsurf/rules/permissions-{name}.md (if permissions specified)
}

/**
 * GitHub Copilot output structure
 */
export interface GitHubCopilotOutput {
  promptPath: string           // .github/prompts/{name}.prompt.md
  instructionsPath?: string    // .github/instructions/{name}.instructions.md (if applyTo specified)
  copilotInstructionsPath?: string  // .github/copilot-instructions.md (if alwaysApply)
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Platform-specific file size limits
 */
export const PLATFORM_LIMITS = {
  windsurf: {
    maxFileSize: 12000,        // 12,000 characters per file
    maxWorkflowCount: 100,     // Practical limit
  },
  'github-copilot': {
    maxWorkingSetFiles: 10,    // 10 files in working set
    maxContextFiles: 20,       // 20 files in context
    maxContextChars: 6000,     // ~6,000 character context window
    maxLinesPerFile: 782,      // Quality degrades above this
    maxLinesAbsolute: 6000,    // Absolute max lines per file
  },
  'claude-code': {
    // Claude Code has generous limits
    maxContextTokens: 200000,  // 200k token context
  },
} as const

/**
 * Valid tool names for Claude Code
 */
export const CLAUDE_CODE_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'Task',
  'Skill',
  'LSP',
  'LS',
  'WebFetch',
  'WebSearch',
  'NotebookRead',
  'NotebookEdit',
  'TodoRead',
  'TodoWrite',
  'MCPSearch',
  'Computer',
  'EnterPlanMode',
  'ExitPlanMode',
  'AskUserQuestion',
] as const

/**
 * Valid trigger types for Windsurf
 */
export const WINDSURF_TRIGGERS = ['manual', 'always_on', 'model_decision', 'glob'] as const

/**
 * Valid modes for GitHub Copilot
 */
export const COPILOT_MODES = ['agent', 'ask', 'edit'] as const
