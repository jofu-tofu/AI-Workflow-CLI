/**
 * Claude Code Platform Adapter
 *
 * Transforms templates from the standard superset format to Claude Code native format.
 * Claude Code is the most feature-complete platform, so this adapter primarily
 * strips unused fields and restructures output for Claude Code's directory conventions.
 *
 * Reference: PLATFORM-ADAPTERS.md Section 1 (Claude Code Adapter)
 */

import type {
  ParsedTemplate,
  PlatformAdapter,
  TransformationResult,
  TransformationWarning,
  TransformOptions,
} from '../types.js'
import {parseContent} from '../content-parser.js'
import {ClaudeCodeContentTransformer} from '../content-transformers.js'

/**
 * Fields that are Claude Code native and passed through directly
 */
const CLAUDE_CODE_NATIVE_FIELDS = [
  'name',
  'description',
  'version',
  'allowed-tools',
  'model',
  'context',
  'agent',
  'disable-model-invocation',
  'argument-hint',
  'hooks',
  'language',
] as const

/**
 * Fields from other platforms that are dropped for Claude Code
 */
const DROPPED_FIELDS = {
  // Windsurf-only fields
  trigger: 'Windsurf-only: Claude Code uses description for auto-invocation',
  globs: 'Windsurf-only: Use permissions patterns instead',
  labels: 'Windsurf-only: No categorization system in Claude Code',
  alwaysApply: 'Windsurf-only: Use CLAUDE.md for always-on content',
  author: 'Windsurf-only: No attribution field in Claude Code',

  // GitHub Copilot-only fields
  applyTo: 'Copilot-only: Use permissions patterns instead',
  excludeAgent: 'Copilot-only: No agent exclusion in Claude Code',
  mode: 'Copilot-only: All Claude Code skills are implicitly agent mode',
  tools: 'Copilot-only: Use allowed-tools instead',
  infer: 'Copilot-only: Use description for auto-invocation',
  target: 'Copilot-only: Not applicable',
  handoffs: 'Copilot-only: Not applicable',
  'mcp-servers': 'Copilot-only: Configure MCP in settings.json',

  // Meta-fields (processed, not passed through)
  platforms: 'Meta-field: Used by adapter routing',
  compatibility: 'Meta-field: Documentation only',
  emulation: 'Meta-field: Used by other adapters',
} as const

/**
 * Generate YAML frontmatter for Claude Code SKILL.md format
 */
function generateFrontmatter(template: ParsedTemplate): string {
  const {metadata} = template
  const lines: string[] = ['---']

  // Required/recommended fields
  if (metadata.name) {
    lines.push(`name: ${metadata.name}`)
  }

  if (metadata.description) {
    // Use block scalar for multi-line descriptions
    if (metadata.description.includes('\n')) {
      lines.push('description: |')
      for (const line of metadata.description.split('\n')) {
        lines.push(`  ${line}`)
      }
    } else {
      lines.push(`description: ${metadata.description}`)
    }
  }

  if (metadata.version) {
    lines.push(`version: "${metadata.version}"`)
  }

  // Claude Code specific fields
  if (metadata['allowed-tools'] && metadata['allowed-tools'].length > 0) {
    lines.push('allowed-tools:')
    for (const tool of metadata['allowed-tools']) {
      lines.push(`  - ${tool}`)
    }
  }

  if (metadata.model) {
    lines.push(`model: ${metadata.model}`)
  }

  if (metadata.context) {
    lines.push(`context: ${metadata.context}`)
  }

  if (metadata.agent) {
    lines.push(`agent: ${metadata.agent}`)
  }

  if (metadata['disable-model-invocation'] !== undefined) {
    lines.push(`disable-model-invocation: ${metadata['disable-model-invocation']}`)
  }

  if (metadata['argument-hint']) {
    lines.push(`argument-hint: "${metadata['argument-hint']}"`)
  }

  if (metadata.language) {
    lines.push(`language: ${metadata.language}`)
  }

  // Hooks are complex - serialize them properly
  if (metadata.hooks) {
    lines.push('hooks:')
    if (metadata.hooks.PreToolUse) {
      lines.push('  PreToolUse:')
      for (const hook of metadata.hooks.PreToolUse) {
        lines.push(`    - matcher: "${hook.matcher || '*'}"`)
        if (hook.once !== undefined) {
          lines.push(`      once: ${hook.once}`)
        }

        lines.push('      hooks:')
        for (const h of hook.hooks) {
          lines.push(`        - type: ${h.type}`)
          lines.push(`          command: "${h.command}"`)
          if (h.timeout !== undefined) {
            lines.push(`          timeout: ${h.timeout}`)
          }
        }
      }
    }

    if (metadata.hooks.PostToolUse) {
      lines.push('  PostToolUse:')
      for (const hook of metadata.hooks.PostToolUse) {
        lines.push(`    - matcher: "${hook.matcher || '*'}"`)
        if (hook.once !== undefined) {
          lines.push(`      once: ${hook.once}`)
        }

        lines.push('      hooks:')
        for (const h of hook.hooks) {
          lines.push(`        - type: ${h.type}`)
          lines.push(`          command: "${h.command}"`)
        }
      }
    }

    if (metadata.hooks.Stop) {
      lines.push('  Stop:')
      for (const hook of metadata.hooks.Stop) {
        lines.push('    - hooks:')
        for (const h of hook.hooks) {
          lines.push(`        - type: ${h.type}`)
          lines.push(`          command: "${h.command}"`)
        }
      }
    }
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Generate settings.json content for permissions
 * Note: This should be MERGED with existing settings.json, not replace it
 */
function generateSettingsJson(template: ParsedTemplate): string | null {
  const {permissions} = template.metadata
  if (!permissions || (!permissions.allow?.length && !permissions.deny?.length)) {
    return null
  }

  const settings: {permissions: {allow?: string[]; deny?: string[]}} = {
    permissions: {},
  }

  if (permissions.allow && permissions.allow.length > 0) {
    settings.permissions.allow = permissions.allow
  }

  if (permissions.deny && permissions.deny.length > 0) {
    settings.permissions.deny = permissions.deny
  }

  return JSON.stringify(settings, null, 2)
}

/**
 * Claude Code platform adapter
 */
export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly platform = 'claude-code' as const

  /**
   * Get the output path for the main skill file
   */
  getOutputPath(template: ParsedTemplate): string {
    const name = template.metadata.name || 'unnamed-skill'
    return `.claude/skills/${name}/SKILL.md`
  }

  /**
   * Validate a template for Claude Code compatibility
   */
  validate(template: ParsedTemplate): TransformationWarning[] {
    const warnings: TransformationWarning[] = []
    const {metadata} = template

    // Check required fields
    if (!metadata.name) {
      warnings.push({
        category: 'UNSUPPORTED',
        message: 'Missing required field: name',
        details: 'Claude Code skills require a name field for identification',
        field: 'name',
      })
    }

    // Check for dropped fields and warn
    for (const [field, reason] of Object.entries(DROPPED_FIELDS)) {
      if (metadata[field as keyof typeof metadata] !== undefined) {
        warnings.push({
          category: 'UNSUPPORTED',
          message: `Field '${field}' will be dropped`,
          details: reason,
          field,
        })
      }
    }

    // Validate model field if present
    if (metadata.model) {
      const validModels = [
        'sonnet', 'opus', 'haiku',
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-5-20251101',
        'claude-haiku-4-20250107',
      ]
      if (!validModels.includes(metadata.model)) {
        warnings.push({
          category: 'DEGRADED',
          message: `Unknown model: ${metadata.model}`,
          details: 'Model may not be supported. Valid models: ' + validModels.join(', '),
          field: 'model',
        })
      }
    }

    // Validate context field if present
    if (metadata.context && !['inherit', 'fork'].includes(metadata.context)) {
      warnings.push({
        category: 'UNSUPPORTED',
        message: `Invalid context value: ${metadata.context}`,
        details: 'Context must be "inherit" or "fork"',
        field: 'context',
      })
    }

    // Warn about permissions being project-scoped
    if (metadata.permissions) {
      warnings.push({
        category: 'SECURITY',
        message: 'Permissions are project-scoped, not skill-scoped',
        details:
          'Permissions in skill frontmatter are merged into .claude/settings.json ' +
          'and apply to the entire project, not just this skill. ' +
          'Review accumulated permissions periodically.',
        field: 'permissions',
      })
    }

    return warnings
  }

  /**
   * Transform a template to Claude Code format
   */
  transform(
    template: ParsedTemplate,
    _options: TransformOptions = {},
  ): TransformationResult {
    const warnings = this.validate(template)
    const files = new Map<string, string>()

    // Check if we should proceed despite validation issues
    const hasErrors = warnings.some((w) =>
      w.category === 'UNSUPPORTED' && w.field === 'name',
    )
    if (hasErrors) {
      return {
        platform: 'claude-code',
        files,
        warnings,
        success: false,
        error: 'Template missing required fields for Claude Code',
      }
    }

    // Phase 5: Transform content using semantic analysis
    const contentAnalysis = template.contentAnalysis || parseContent(template.content)
    const transformer = new ClaudeCodeContentTransformer()
    const contentResult = transformer.transform(contentAnalysis, template.content)
    const transformedContent = contentResult.content
    warnings.push(...contentResult.warnings)

    // Generate main SKILL.md file
    const frontmatter = generateFrontmatter(template)
    const skillContent = `${frontmatter}\n\n${transformedContent}`
    const outputPath = this.getOutputPath(template)
    files.set(outputPath, skillContent)

    // Generate settings.json if permissions are specified
    const settingsJson = generateSettingsJson(template)
    if (settingsJson) {
      files.set('.claude/settings.json', settingsJson)
      warnings.push({
        category: 'SECURITY',
        message: 'settings.json generated with permissions',
        details:
          'If .claude/settings.json already exists, you must manually merge ' +
          'the permissions. The generated file will overwrite existing settings.',
      })
    }

    // Note: Agent files are not generated here - they would need to be
    // defined separately. We just reference them.
    if (template.metadata.agent) {
      warnings.push({
        category: 'EMULATED',
        message: `Skill references agent: ${template.metadata.agent}`,
        details:
          'Ensure .claude/agents/' + template.metadata.agent + '.md exists. ' +
          'Agent definitions must be created separately.',
        field: 'agent',
      })
    }

    return {
      platform: 'claude-code',
      files,
      warnings,
      success: true,
    }
  }
}
