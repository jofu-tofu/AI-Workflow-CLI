/**
 * Template Mapper Module
 *
 * Cross-platform template conversion system for transforming templates
 * between Claude Code, Windsurf, and GitHub Copilot formats.
 *
 * @module template-mapper
 */

// Re-export all types
export type {
  // Platform types
  Platform,
  CompatibilityStatus,

  // Schema types
  PlatformCompatibility,
  EmulationPattern,
  Permissions,
  HookConfig,
  LifecycleHooks,
  Handoff,
  TemplateMetadata,
  ParsedTemplate,

  // Transformation types
  WarningCategory,
  TransformationWarning,
  TransformationResult,

  // Adapter interface
  PlatformAdapter,

  // Options
  TransformOptions,
  ParseOptions,

  // Engine types
  ConversionResult,
  MappingEngine,

  // Validation types
  ValidationSeverity,
  ValidationIssue,
  SchemaValidator,

  // Platform-specific output types
  ClaudeCodeOutput,
  WindsurfOutput,
  GitHubCopilotOutput,

  // Phase 5: Semantic content types
  SemanticConstructType,
  ConstructLocation,
  SemanticConstruct,
  ContentAnalysis,

  // Phase 5: Content transformer types
  ContentTransformer,
  TransformedContent,
} from './types.js'

// Re-export constants
export {
  PLATFORMS,
  PLATFORM_LIMITS,
  CLAUDE_CODE_TOOLS,
  WINDSURF_TRIGGERS,
  COPILOT_MODES,
} from './types.js'

// Parser exports
export {
  parseTemplate,
  parseTemplateString,
  isValidTemplate,
  extractFrontmatter,
  ParseError,
} from './parser.js'

// Validator exports will be added when implemented
// export { validateSchema, validateForPlatform } from './validator.js'

// Engine exports will be added when implemented
// export { createMappingEngine } from './engine.js'

// Adapter exports
export {ClaudeCodeAdapter} from './adapters/claude-code.js'
export {WindsurfAdapter} from './adapters/windsurf.js'

// GitHub Copilot adapter will be added in future phase
// export { GitHubCopilotAdapter } from './adapters/github-copilot.js'

// Content parser exports (Phase 5)
export {
  parseContent,
  hasSemanticConstructs,
  getConstructsByPlatform,
  getConstructsByType,
  getConstructTypes,
  getSourcePlatform,
  // Individual detection functions
  detectAgentSpawning,
  detectToolCalls,
  detectContextSwitches,
  detectPermissionReferences,
  detectModelDecisionTriggers,
  detectGlobPatterns,
  detectPersonaRules,
  detectSkillChaining,
  detectContextGatheringProtocols,
  detectActivationInstructions,
  detectWorkingSetLimits,
  detectCheckpointCommits,
  detectProgressTracking,
  detectWorkspaceCommands,
  detectTestCommands,
  detectAdvisoryWarnings,
  detectVersionComments,
  detectExecutionFlowSections,
} from './content-parser.js'

// Content transformer exports (Phase 5)
export {
  ClaudeCodeContentTransformer,
  WindsurfContentTransformer,
  CopilotContentTransformer,
  createContentTransformer,
} from './content-transformers.js'
