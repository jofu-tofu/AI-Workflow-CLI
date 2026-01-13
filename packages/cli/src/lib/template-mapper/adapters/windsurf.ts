/**
 * Windsurf Platform Adapter
 *
 * Transforms templates from the standard superset format to Windsurf native format.
 * Windsurf has fewer native features than Claude Code, so this adapter uses
 * emulation patterns extensively from WORKAROUND-PATTERNS.md.
 *
 * Reference: PLATFORM-ADAPTERS.md Section 2 (Windsurf Adapter)
 */

import type {
  ParsedTemplate,
  PlatformAdapter,
  TransformationResult,
  TransformationWarning,
  TransformOptions,
  PLATFORM_LIMITS,
} from '../types.js'

/**
 * Fields that are Windsurf native and passed through directly
 */
const WINDSURF_NATIVE_FIELDS = [
  'description',
  'trigger',
  'globs',
  'labels',
  'alwaysApply',
  'author',
] as const

/**
 * Character limit for Windsurf workflow files
 */
const WINDSURF_CHAR_LIMIT = 12000

/**
 * Generate YAML frontmatter for Windsurf workflow format
 */
function generateFrontmatter(template: ParsedTemplate): string {
  const {metadata} = template
  const lines: string[] = ['---']

  // Description is the primary field (required)
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

  // Trigger type - default to model_decision if skills need activation
  if (metadata.trigger) {
    lines.push(`trigger: ${metadata.trigger}`)
  } else if (metadata.name) {
    // If it's a skill being converted, use model_decision
    lines.push('trigger: model_decision')
  }

  // Globs for file-triggered workflows
  if (metadata.globs && metadata.globs.length > 0) {
    lines.push('globs:')
    for (const glob of metadata.globs) {
      lines.push(`  - "${glob}"`)
    }
  }

  // Labels for categorization
  if (metadata.labels && metadata.labels.length > 0) {
    lines.push('labels:')
    for (const label of metadata.labels) {
      lines.push(`  - ${label}`)
    }
  }

  // Always apply flag
  if (metadata.alwaysApply !== undefined) {
    lines.push(`alwaysApply: ${metadata.alwaysApply}`)
  }

  // Author attribution
  if (metadata.author) {
    lines.push(`author: "${metadata.author}"`)
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Generate tool restrictions advisory section
 * Emulates Claude Code's allowed-tools feature
 */
function generateToolRestrictionsSection(template: ParsedTemplate): string | null {
  const tools = template.metadata['allowed-tools']
  if (!tools || tools.length === 0) {
    return null
  }

  const lines = [
    '## Tool Restrictions (Advisory)',
    '',
    '> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.',
    '',
    '**Allowed Operations:**',
  ]

  for (const tool of tools) {
    // Parse tool names like "Bash(git *)" to human-readable descriptions
    if (tool.startsWith('Bash(')) {
      const cmd = tool.slice(5, -1)
      lines.push(`- Shell commands: \`${cmd}\``)
    } else if (tool === 'Read') {
      lines.push('- Read files')
    } else if (tool === 'Write') {
      lines.push('- Write/create files')
    } else if (tool === 'Edit') {
      lines.push('- Edit existing files')
    } else if (tool === 'Grep') {
      lines.push('- Search file contents (grep)')
    } else if (tool === 'Glob') {
      lines.push('- Find files by pattern (glob)')
    } else if (tool === 'Task') {
      lines.push('- Spawn subagent tasks (see note below)')
    } else {
      lines.push(`- ${tool}`)
    }
  }

  lines.push('')
  lines.push('**Forbidden Operations:**')

  // Infer forbidden operations from what's not in allowed list
  const allTools = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Task']
  const forbidden: string[] = []

  if (!tools.includes('Write') && !tools.includes('Edit')) {
    forbidden.push('- Writing or editing files')
  }

  if (!tools.some((t) => t.startsWith('Bash'))) {
    forbidden.push('- Shell commands')
  }

  if (!tools.includes('Task')) {
    forbidden.push('- Spawning subagent tasks')
  }

  if (forbidden.length === 0) {
    lines.push('- (No explicit restrictions beyond allowed operations)')
  } else {
    lines.push(...forbidden)
  }

  lines.push('')
  lines.push('**IMPORTANT:** Before using tools outside this list, ask user for permission.')

  return lines.join('\n')
}

/**
 * Generate context isolation markers
 * Emulates Claude Code's context: fork feature
 */
function generateContextSection(template: ParsedTemplate): string | null {
  if (template.metadata.context !== 'fork') {
    return null
  }

  return [
    '## Execution Context',
    '',
    '[CONTEXT: Isolated Execution - Treat as fresh session]',
    '',
    'This workflow simulates isolated subagent execution. Complete ALL steps within this workflow before responding to other requests.',
    '',
  ].join('\n')
}

/**
 * Generate closing context marker
 */
function generateContextEndMarker(template: ParsedTemplate): string | null {
  if (template.metadata.context !== 'fork') {
    return null
  }

  return '\n\n[END CONTEXT: Return to normal session]'
}

/**
 * Generate permissions advisory section
 * Emulates Claude Code's permissions feature
 */
function generatePermissionsSection(template: ParsedTemplate): string | null {
  const perms = template.metadata.permissions
  if (!perms || (!perms.allow?.length && !perms.deny?.length)) {
    return null
  }

  const lines = [
    '## Access Permissions (Advisory)',
    '',
  ]

  if (perms.allow && perms.allow.length > 0) {
    lines.push('**Allowed:**')
    for (const pattern of perms.allow) {
      lines.push(`- \`${pattern}\``)
    }

    lines.push('')
  }

  if (perms.deny && perms.deny.length > 0) {
    lines.push('**Forbidden:**')
    for (const pattern of perms.deny) {
      lines.push(`- \`${pattern}\``)
    }

    lines.push('')
  }

  lines.push('> **WARNING:** These restrictions are advisory only and NOT enforced by Windsurf.')

  return lines.join('\n')
}

/**
 * Generate agent persona reference section
 */
function generateAgentSection(template: ParsedTemplate): string | null {
  const agent = template.metadata.agent
  if (!agent) {
    return null
  }

  return [
    '## Agent Persona',
    '',
    `This workflow uses the **${agent}** agent.`,
    `Activate with: \`@rules:agent-${agent}\` before running this workflow.`,
    '',
  ].join('\n')
}

/**
 * Generate agent persona rule file content
 */
function generateAgentRuleFile(template: ParsedTemplate): string | null {
  const agent = template.metadata.agent
  if (!agent) {
    return null
  }

  const agentName = agent.replace(/-/g, ' ').split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return `---
trigger: manual
description: Activate ${agent} persona with @rules:agent-${agent}
---

# ${agentName} Persona

When @rules:agent-${agent} is active, adopt this persona:

## Role
You are a specialized ${agentName.toLowerCase()} agent.

## Behavioral Guidelines
- Follow the workflow instructions precisely
- Maintain focus on the task at hand
- Ask for clarification if instructions are ambiguous

## Activation
User invokes with: \`@rules:agent-${agent}\`

## Deactivation
Returns to default Cascade behavior when user starts new topic.

> **NOTE:** Tool restrictions cannot be enforced in Windsurf. Rely on AI compliance.
`
}

/**
 * Generate permissions warning rule file content
 */
function generatePermissionsRuleFile(template: ParsedTemplate): string | null {
  const perms = template.metadata.permissions
  if (!perms?.deny?.length) {
    return null
  }

  const name = template.metadata.name || 'workflow'

  // Create glob patterns for the rule trigger
  const denyGlobs = perms.deny.map((pattern) => {
    // Extract file pattern from permission string like "Read(.env)"
    const match = pattern.match(/\w+\(([^)]+)\)/)
    return match ? match[1] : pattern
  })

  return `---
trigger: glob
globs:
${denyGlobs.map((g) => `  - "${g}"`).join('\n')}
description: Security warning for restricted files
---

# SECURITY WARNING - Restricted File Access

You are accessing a file that has ACCESS RESTRICTIONS.

## Restricted Patterns

**FORBIDDEN - Do NOT access these files:**
${perms.deny.map((p) => `- \`${p}\``).join('\n')}

## Required Actions

1. **STOP** - Do not read or modify this file
2. **WARN** - Alert the user about the attempted access
3. **ASK** - Request explicit permission if access is truly needed

> **WARNING:** These restrictions are NOT technically enforced.
> Violating them may expose secrets or corrupt critical configurations.
`
}

/**
 * Generate hooks as manual workflow steps
 */
function generateHooksSection(template: ParsedTemplate): string | null {
  const hooks = template.metadata.hooks
  if (!hooks) {
    return null
  }

  const lines: string[] = []

  // Pre-execution hooks
  if (hooks.PreToolUse) {
    lines.push('## Pre-Execution Checks')
    lines.push('')
    lines.push('**IMPORTANT:** Before making any file changes, run:')
    lines.push('')

    for (const hook of hooks.PreToolUse) {
      for (const h of hook.hooks) {
        lines.push('```bash')
        lines.push(h.command)
        lines.push('```')
        lines.push('')
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Generate post-execution hooks section
 */
function generatePostHooksSection(template: ParsedTemplate): string | null {
  const hooks = template.metadata.hooks
  if (!hooks?.Stop) {
    return null
  }

  const lines = [
    '## Post-Execution Validation',
    '',
    '**IMPORTANT:** After completing work, run:',
    '',
  ]

  for (const hook of hooks.Stop) {
    for (const h of hook.hooks) {
      lines.push('```bash')
      lines.push(h.command)
      lines.push('```')
      lines.push('')
    }
  }

  lines.push('Ensure all checks pass before considering the task complete.')

  return lines.join('\n')
}

/**
 * Windsurf platform adapter
 */
export class WindsurfAdapter implements PlatformAdapter {
  readonly platform = 'windsurf' as const

  /**
   * Get the output path for the main workflow file
   */
  getOutputPath(template: ParsedTemplate): string {
    const name = template.metadata.name || 'unnamed-workflow'
    return `.windsurf/workflows/${name}.md`
  }

  /**
   * Validate a template for Windsurf compatibility
   */
  validate(template: ParsedTemplate): TransformationWarning[] {
    const warnings: TransformationWarning[] = []
    const {metadata} = template

    // Check required fields
    if (!metadata.description) {
      warnings.push({
        category: 'UNSUPPORTED',
        message: 'Missing recommended field: description',
        details: 'Windsurf workflows should have a description for model_decision activation',
        field: 'description',
      })
    }

    // Warn about emulated features
    if (metadata['allowed-tools'] && metadata['allowed-tools'].length > 0) {
      warnings.push({
        category: 'EMULATED',
        message: 'allowed-tools converted to advisory instructions',
        details:
          'Tool restrictions are NOT enforced by Windsurf. ' +
          'AI must voluntarily comply with documented restrictions.',
        field: 'allowed-tools',
      })
    }

    if (metadata.context === 'fork') {
      warnings.push({
        category: 'EMULATED',
        message: 'context: fork emulated with markers',
        details:
          'Windsurf does not support true context isolation. ' +
          'Markers are added but previous conversation history is still accessible.',
        field: 'context',
      })
    }

    if (metadata.agent) {
      warnings.push({
        category: 'EMULATED',
        message: `agent: ${metadata.agent} converted to persona rule`,
        details:
          'Custom agent requires manual activation with @rules:agent-' + metadata.agent + '. ' +
          'User must invoke persona before running workflow.',
        field: 'agent',
      })
    }

    if (metadata.permissions) {
      warnings.push({
        category: 'SECURITY',
        message: 'Permissions converted to advisory warnings',
        details:
          'Windsurf does not enforce permissions. ' +
          'A glob-triggered warning rule will be created, but access is not blocked.',
        field: 'permissions',
      })
    }

    if (metadata.hooks) {
      warnings.push({
        category: 'EMULATED',
        message: 'Hooks converted to manual workflow steps',
        details:
          'Windsurf does not have lifecycle hooks. ' +
          'Hook commands are documented as manual pre/post execution steps.',
        field: 'hooks',
      })
    }

    // Warn about dropped Claude Code-only fields
    if (metadata.model) {
      warnings.push({
        category: 'UNSUPPORTED',
        message: 'model field dropped',
        details: 'Windsurf model selection is configured separately in IDE settings.',
        field: 'model',
      })
    }

    return warnings
  }

  /**
   * Transform a template to Windsurf format
   */
  transform(
    template: ParsedTemplate,
    _options: TransformOptions = {},
  ): TransformationResult {
    const warnings = this.validate(template)
    const files = new Map<string, string>()

    // Build the main workflow content
    const sections: string[] = []

    // Frontmatter
    sections.push(generateFrontmatter(template))

    // Version comment
    if (template.metadata.version) {
      sections.push(`\n<!-- Version: ${template.metadata.version} -->`)
    }

    // Compatibility note if specified
    const compat = template.metadata.compatibility?.windsurf
    if (compat) {
      sections.push('\n## Platform Compatibility Note')
      sections.push('')
      sections.push(`> **NOTE [COMPATIBILITY]:** This template has ${compat.status} support on Windsurf.`)
      if (compat.notes) {
        sections.push(`> ${compat.notes}`)
      }

      sections.push('')
    }

    // Agent persona section
    const agentSection = generateAgentSection(template)
    if (agentSection) {
      sections.push('\n' + agentSection)
    }

    // Tool restrictions (emulated)
    const toolsSection = generateToolRestrictionsSection(template)
    if (toolsSection) {
      sections.push('\n' + toolsSection)
    }

    // Permissions (emulated)
    const permsSection = generatePermissionsSection(template)
    if (permsSection) {
      sections.push('\n' + permsSection)
    }

    // Pre-execution hooks
    const preHooksSection = generateHooksSection(template)
    if (preHooksSection) {
      sections.push('\n---\n\n' + preHooksSection)
    }

    // Context isolation markers
    const contextSection = generateContextSection(template)
    if (contextSection) {
      sections.push('\n---\n\n' + contextSection)
    }

    // Main content
    if (template.content) {
      sections.push('\n' + template.content)
    }

    // Context end marker
    const contextEnd = generateContextEndMarker(template)
    if (contextEnd) {
      sections.push(contextEnd)
    }

    // Post-execution hooks
    const postHooksSection = generatePostHooksSection(template)
    if (postHooksSection) {
      sections.push('\n\n---\n\n' + postHooksSection)
    }

    const workflowContent = sections.join('')

    // Check character limit
    if (workflowContent.length > WINDSURF_CHAR_LIMIT) {
      warnings.push({
        category: 'LIMIT',
        message: `Workflow exceeds ${WINDSURF_CHAR_LIMIT} character limit`,
        details:
          `Content is ${workflowContent.length} characters. ` +
          'Consider splitting into multiple workflow files.',
      })
    }

    // Main workflow file
    const outputPath = this.getOutputPath(template)
    files.set(outputPath, workflowContent)

    // Generate agent persona rule file if needed
    const agentRule = generateAgentRuleFile(template)
    if (agentRule) {
      const agentRulePath = `.windsurf/rules/agent-${template.metadata.agent}.md`
      files.set(agentRulePath, agentRule)
    }

    // Generate permissions warning rule file if needed
    const permsRule = generatePermissionsRuleFile(template)
    if (permsRule) {
      const name = template.metadata.name || 'workflow'
      const permsRulePath = `.windsurf/rules/permissions-${name}.md`
      files.set(permsRulePath, permsRule)
    }

    return {
      platform: 'windsurf',
      files,
      warnings,
      success: true,
    }
  }
}
