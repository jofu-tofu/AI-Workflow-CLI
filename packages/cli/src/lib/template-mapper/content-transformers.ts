/**
 * Content Transformers for Platform-Specific Content Rewriting
 *
 * Transforms semantic constructs in workflow content for each target platform.
 * The content parser (content-parser.ts) extracts constructs; transformers rewrite them.
 *
 * @module content-transformers
 */

import type {
  Platform,
  ContentTransformer,
  ContentAnalysis,
  TransformedContent,
  TransformationWarning,
  SemanticConstruct,
  SemanticConstructType,
} from './types.js'

// =============================================================================
// Tool Mapping Tables
// =============================================================================

/**
 * Maps Claude Code tool names to human-readable action descriptions for Windsurf
 */
const TOOL_TO_ACTION: Record<string, string> = {
  Glob: 'Find files using pattern search',
  Grep: 'Search file contents',
  Read: 'View file contents',
  Write: 'Create or overwrite file',
  Edit: 'Modify existing file',
  Bash: 'Execute shell command',
  Task: 'Delegate to separate execution',
  WebFetch: 'Retrieve web content',
  WebSearch: 'Search the web',
  AskUserQuestion: 'Ask user for input',
}

/**
 * Maps Claude Code tool names to generic recommendations for Copilot
 */
const TOOL_TO_RECOMMENDATION: Record<string, string> = {
  Glob: 'search for files matching patterns',
  Grep: 'search for content in files',
  Read: 'read file contents',
  Write: 'write to files',
  Edit: 'edit files',
  Bash: 'run shell commands as needed',
  Task: 'break down into smaller steps',
  WebFetch: 'access web resources if available',
  WebSearch: 'search online if needed',
  AskUserQuestion: 'ask user for clarification',
}

// =============================================================================
// Replacement Tracking
// =============================================================================

/**
 * Tracks replacements to avoid double-replacement
 */
interface Replacement {
  start: number
  end: number
  original: string
  replacement: string
}

/**
 * Apply replacements to content, handling position shifts
 * Processes replacements from end to start to maintain position accuracy
 */
function applyReplacements(content: string, replacements: Replacement[]): string {
  // Sort by start position descending to process from end
  const sorted = [...replacements].sort((a, b) => b.start - a.start)

  let result = content
  for (const r of sorted) {
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end)
  }

  return result
}

/**
 * Check if a position overlaps with any existing replacement
 */
function overlapsWithExisting(
  start: number,
  end: number,
  replacements: Replacement[],
): boolean {
  return replacements.some(
    (r) =>
      (start >= r.start && start < r.end) ||
      (end > r.start && end <= r.end) ||
      (start <= r.start && end >= r.end),
  )
}

// =============================================================================
// Claude Code Content Transformer
// =============================================================================

/**
 * Claude Code Content Transformer
 *
 * Claude Code is the reference platform with the most capabilities.
 * This transformer passes through most constructs but converts
 * Windsurf-specific syntax if present and warns on Windsurf-only constructs.
 */
export class ClaudeCodeContentTransformer implements ContentTransformer {
  platform: Platform = 'claude-code'

  transform(analysis: ContentAnalysis, content: string): TransformedContent {
    const warnings: TransformationWarning[] = []
    const replacements: Replacement[] = []

    for (const construct of analysis.constructs) {
      switch (construct.type) {
        case 'model-decision-trigger':
          // Windsurf-specific - convert to description-based discovery
          if (construct.parsed?.hasTriggerField) {
            warnings.push({
              category: 'EMULATED',
              message: 'Windsurf trigger: model_decision converted to description-based activation',
              details: 'Claude Code uses skill descriptions for auto-invocation. Add activation keywords to description.',
              field: 'trigger',
            })
          }
          break

        case 'glob-pattern':
          // Windsurf-specific globs field
          if (construct.rawText.includes('globs:')) {
            warnings.push({
              category: 'UNSUPPORTED',
              message: 'Windsurf globs: field not supported',
              details: 'Claude Code does not support file-triggered activation. Use permissions patterns or description keywords.',
              field: 'globs',
            })
          }
          break

        case 'skill-chaining':
          // Convert Copilot /prompt format to Claude Code /skill-name
          if (construct.rawText.includes('/prompt ')) {
            const match = construct.rawText.match(/\/prompt\s+([a-z-]+)/i)
            if (match?.[1]) {
              const skillName = match[1]
              replacements.push({
                start: construct.location.start,
                end: construct.location.end,
                original: construct.rawText,
                replacement: `/${skillName}`,
              })
              warnings.push({
                category: 'EMULATED',
                message: `Copilot /prompt ${skillName} converted to /${skillName}`,
                details: 'Claude Code uses /skill-name format for skill invocation.',
              })
            }
          }
          break

        case 'workspace-command':
          // Convert @workspace to Claude Code search pattern
          if (construct.parsed?.action) {
            const action = construct.parsed.action as string
            let replacement = ''
            switch (action) {
              case 'find':
                replacement = 'Use Glob and Grep tools to search'
                break
              case 'analyze':
                replacement = 'Analyze the codebase using Read, Glob, and Grep tools'
                break
              case 'show':
                replacement = 'Use Read tool to display'
                break
              default:
                replacement = 'Search codebase using available tools'
            }
            replacements.push({
              start: construct.location.start,
              end: construct.location.end,
              original: construct.rawText,
              replacement,
            })
            warnings.push({
              category: 'EMULATED',
              message: `Copilot ${construct.rawText} converted to tool-based search`,
              details: 'Claude Code uses explicit tool calls instead of @workspace.',
            })
          } else if (construct.rawText.includes('@workspace')) {
            replacements.push({
              start: construct.location.start,
              end: construct.location.end,
              original: construct.rawText,
              replacement: 'Search the codebase using Glob and Grep tools',
            })
            warnings.push({
              category: 'EMULATED',
              message: '@workspace converted to tool-based search',
              details: 'Claude Code uses explicit tool calls instead of @workspace.',
            })
          }
          break

        case 'working-set-limit':
          // Copilot-specific - not needed on Claude Code
          warnings.push({
            category: 'UNSUPPORTED',
            message: 'Working set limit reference removed',
            details: 'Claude Code has 200k token context - working set limits do not apply.',
          })
          break

        // Pass through Claude Code native constructs
        case 'agent-spawn':
        case 'tool-call':
        case 'context-switch':
        case 'permission-reference':
        case 'context-gathering-protocol':
        case 'activation-instruction':
        case 'test-command':
        case 'execution-flow-section':
        case 'checkpoint-commit':
        case 'progress-tracking':
          // Native to Claude Code - no transformation needed
          break

        case 'persona-rule':
          // Windsurf @rules: syntax to Claude Code agent reference
          if (construct.rawText.includes('@rules:agent-')) {
            const match = construct.rawText.match(/@rules:agent-([a-z-]+)/i)
            if (match?.[1]) {
              const agentName = match[1]
              replacements.push({
                start: construct.location.start,
                end: construct.location.end,
                original: construct.rawText,
                replacement: `Use the ${agentName} agent`,
              })
              warnings.push({
                category: 'EMULATED',
                message: `Windsurf @rules:agent-${agentName} converted to agent reference`,
                details: 'Claude Code uses agent: field in frontmatter for persona activation.',
              })
            }
          }
          break

        case 'advisory-warning':
        case 'version-comment':
          // These are informational - pass through
          break
      }
    }

    const transformedContent = applyReplacements(content, replacements)

    return {
      content: transformedContent,
      warnings,
    }
  }
}

// =============================================================================
// Windsurf Content Transformer
// =============================================================================

/**
 * Windsurf Content Transformer
 *
 * Transforms constructs for Windsurf compatibility:
 * - agent-spawn: Sequential execution with advisory note
 * - tool-call: Rephrase as action descriptions
 * - context-switch: Replace with single-session note
 * - permission-reference: Add advisory compliance note
 * - skill-chaining: Convert to /workflow-name format
 * - context-gathering-protocol: Remove Step 0 (automatic via globs)
 * - activation-instruction: Convert to /workflow-name format
 * - workspace-command: Convert to natural language
 */
export class WindsurfContentTransformer implements ContentTransformer {
  platform: Platform = 'windsurf'

  transform(analysis: ContentAnalysis, content: string): TransformedContent {
    const warnings: TransformationWarning[] = []
    const replacements: Replacement[] = []

    for (const construct of analysis.constructs) {
      // Skip if already replaced at this position
      if (overlapsWithExisting(construct.location.start, construct.location.end, replacements)) {
        continue
      }

      switch (construct.type) {
        case 'agent-spawn':
          this.transformAgentSpawn(construct, replacements, warnings)
          break

        case 'tool-call':
          this.transformToolCall(construct, replacements, warnings)
          break

        case 'context-switch':
          this.transformContextSwitch(construct, replacements, warnings)
          break

        case 'permission-reference':
          this.transformPermissionReference(construct, replacements, warnings)
          break

        case 'skill-chaining':
          this.transformSkillChaining(construct, replacements, warnings)
          break

        case 'context-gathering-protocol':
          this.transformContextGatheringProtocol(construct, replacements, warnings)
          break

        case 'activation-instruction':
          this.transformActivationInstruction(construct, replacements, warnings)
          break

        case 'workspace-command':
          this.transformWorkspaceCommand(construct, replacements, warnings)
          break

        // Native Windsurf constructs - pass through
        case 'glob-pattern':
        case 'model-decision-trigger':
        case 'persona-rule':
        case 'advisory-warning':
        case 'version-comment':
          // Native to Windsurf - no transformation needed
          break

        // Universal constructs - pass through
        case 'test-command':
        case 'execution-flow-section':
        case 'checkpoint-commit':
        case 'progress-tracking':
          // Universal - no transformation needed
          break

        case 'working-set-limit':
          // Copilot-specific - not applicable to Windsurf
          warnings.push({
            category: 'UNSUPPORTED',
            message: 'Working set limit reference not applicable',
            details: 'Windsurf does not have working set limits like GitHub Copilot.',
          })
          break
      }
    }

    const transformedContent = applyReplacements(content, replacements)

    return {
      content: transformedContent,
      warnings,
    }
  }

  private transformAgentSpawn(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Extract the task description from context
    const rawText = construct.rawText
    let taskDescription = 'this task'

    // Try to extract what the agent should handle
    const handleMatch = rawText.match(/(?:to\s+)?(?:handle|for)\s+(.+)/i)
    if (handleMatch?.[1]) {
      taskDescription = handleMatch[1].trim()
    }

    const replacement = `Execute the following ${taskDescription} steps sequentially:

> **NOTE:** Subagent spawning not available on Windsurf. Running in single Cascade session.`

    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: rawText,
      replacement,
    })

    warnings.push({
      category: 'EMULATED',
      message: 'Agent spawning converted to sequential execution',
      details: 'Windsurf does not support subagent spawning via Task tool. Work is inlined into single session.',
    })
  }

  private transformToolCall(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const toolName = construct.parsed?.toolName as string | undefined
    if (!toolName) return

    const action = TOOL_TO_ACTION[toolName] || `Perform ${toolName} operation`

    // Try to extract the context/target from the raw text
    const rawText = construct.rawText
    let contextPart = ''

    // Match patterns like "Use Glob tool to find files" -> extract "to find files"
    const toMatch = rawText.match(/tool\s+to\s+(.+)/i)
    if (toMatch?.[1]) {
      contextPart = ` to ${toMatch[1]}`
    }

    // Match patterns like "Grep: pattern=\"query\" path=\"src/\"" -> extract parameters
    const grepMatch = rawText.match(/pattern=["']([^"']+)["']\s*path=["']([^"']+)["']/i)
    if (grepMatch?.[1] && grepMatch?.[2]) {
      const pattern = grepMatch[1]
      const path = grepMatch[2]
      replacements.push({
        start: construct.location.start,
        end: construct.location.end,
        original: rawText,
        replacement: `Search for "${pattern}" in ${path}`,
      })
      warnings.push({
        category: 'EMULATED',
        message: `Tool call ${toolName} converted to action description`,
        details: 'Windsurf Cascade does not use explicit tool references.',
      })
      return
    }

    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: rawText,
      replacement: action + contextPart,
    })

    warnings.push({
      category: 'EMULATED',
      message: `Tool call ${toolName} converted to action description`,
      details: 'Windsurf Cascade does not use explicit tool references.',
    })
  }

  private transformContextSwitch(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: construct.rawText,
      replacement: 'Executes in current Cascade session (no isolation available)',
    })

    warnings.push({
      category: 'EMULATED',
      message: 'Context isolation not available',
      details: 'Windsurf does not support context: fork isolation. All work shares the same conversation context.',
    })
  }

  private transformPermissionReference(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Don't replace the content, but add an advisory note if it's already an advisory
    if (construct.parsed?.isAdvisory) {
      // Already has advisory language - no change needed
      return
    }

    // For non-advisory permission references, add the advisory note
    const advisoryNote = '\n\n> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.'

    // We'll add the note after the permission reference
    replacements.push({
      start: construct.location.end,
      end: construct.location.end,
      original: '',
      replacement: advisoryNote,
    })

    warnings.push({
      category: 'SECURITY',
      message: 'Permission restrictions are advisory only',
      details: 'Windsurf cannot enforce tool restrictions. Added compliance note.',
    })
  }

  private transformSkillChaining(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Convert /skill-name to /workflow-name format
    const skillMatch = rawText.match(/\/([a-z-]+)/i)
    if (skillMatch?.[1]) {
      const skillName = skillMatch[1]
      // Windsurf uses same /name format for workflows
      if (skillName === 'prompt') {
        // Copilot uses /prompt name, Windsurf uses /workflow-name
        const nameMatch = rawText.match(/\/prompt\s+([a-z-]+)/i)
        if (nameMatch?.[1]) {
          replacements.push({
            start: construct.location.start,
            end: construct.location.end,
            original: rawText,
            replacement: `/${nameMatch[1]}`,
          })
          warnings.push({
            category: 'EMULATED',
            message: 'Copilot /prompt format converted to /workflow-name',
            details: 'Windsurf uses /workflow-name for workflow invocation.',
          })
        }
      }
      // Regular /skill-name already compatible with Windsurf /workflow-name
    }

    // Handle "Part X of Y" and "Proceed to Part X" patterns - no change needed for Windsurf
  }

  private transformContextGatheringProtocol(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Remove Step 0 context gathering - Windsurf handles automatically via globs
    if (construct.parsed?.hasStep0) {
      // Find the extent of Step 0 section (until next heading or significant break)
      replacements.push({
        start: construct.location.start,
        end: construct.location.end,
        original: construct.rawText,
        replacement: '', // Remove entirely
      })

      warnings.push({
        category: 'EMULATED',
        message: 'Step 0 context gathering removed',
        details: 'Windsurf automatically gathers context via globs. Manual context acquisition not needed.',
      })
    }
  }

  private transformActivationInstruction(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Convert to /workflow-name format if it's a manual invocation
    const commandMatch = rawText.match(/\/([a-z-]+)/i)
    if (commandMatch?.[1] && construct.parsed?.isManual) {
      // Already in correct format for Windsurf
      return
    }

    // If it says "invoke this skill" convert to workflow terminology
    if (/invoke\s+this\s+skill/i.test(rawText)) {
      replacements.push({
        start: construct.location.start,
        end: construct.location.end,
        original: rawText,
        replacement: rawText.replace(/skill/gi, 'workflow'),
      })
    }
  }

  private transformWorkspaceCommand(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText
    let replacement = ''

    // Convert @workspace commands to natural language for Windsurf
    if (construct.parsed?.action) {
      const action = construct.parsed.action as string
      switch (action) {
        case 'find':
          replacement = 'Search across the codebase to find'
          break
        case 'analyze':
          replacement = 'Analyze the codebase'
          break
        case 'show':
          replacement = 'Display'
          break
        default:
          replacement = 'Search the codebase'
      }
    } else {
      replacement = 'Search the codebase'
    }

    // Preserve any text after @workspace
    const afterWorkspace = rawText.replace(/@workspace\s*/i, '')
    if (afterWorkspace && afterWorkspace !== rawText) {
      replacement = `${replacement} ${afterWorkspace}`
    }

    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: rawText,
      replacement,
    })

    warnings.push({
      category: 'EMULATED',
      message: '@workspace converted to natural language',
      details: 'Windsurf does not have @workspace command. Using natural language search instruction.',
    })
  }
}

// =============================================================================
// GitHub Copilot Content Transformer
// =============================================================================

/**
 * GitHub Copilot Content Transformer
 *
 * Transforms constructs for GitHub Copilot compatibility:
 * - agent-spawn: Replace with manual handoff instructions
 * - tool-call: Generalize to recommendations
 * - context-switch: Remove entirely
 * - glob-pattern: Add working set notes and applyTo pattern
 * - skill-chaining: Convert to /prompt name format
 * - Large context refs: Add batch instructions
 */
export class CopilotContentTransformer implements ContentTransformer {
  platform: Platform = 'github-copilot'

  transform(analysis: ContentAnalysis, content: string): TransformedContent {
    const warnings: TransformationWarning[] = []
    const replacements: Replacement[] = []

    for (const construct of analysis.constructs) {
      // Skip if already replaced at this position
      if (overlapsWithExisting(construct.location.start, construct.location.end, replacements)) {
        continue
      }

      switch (construct.type) {
        case 'agent-spawn':
          this.transformAgentSpawn(construct, replacements, warnings)
          break

        case 'tool-call':
          this.transformToolCall(construct, replacements, warnings)
          break

        case 'context-switch':
          this.transformContextSwitch(construct, replacements, warnings)
          break

        case 'glob-pattern':
          this.transformGlobPattern(construct, replacements, warnings)
          break

        case 'skill-chaining':
          this.transformSkillChaining(construct, replacements, warnings)
          break

        case 'permission-reference':
          this.transformPermissionReference(construct, replacements, warnings)
          break

        case 'context-gathering-protocol':
          this.transformContextGatheringProtocol(construct, replacements, warnings)
          break

        case 'model-decision-trigger':
          this.transformModelDecisionTrigger(construct, replacements, warnings)
          break

        case 'persona-rule':
          this.transformPersonaRule(construct, replacements, warnings)
          break

        // Native Copilot constructs - pass through
        case 'workspace-command':
        case 'working-set-limit':
          // Native to Copilot - no transformation needed
          break

        // Universal constructs - pass through with potential batch notes
        case 'test-command':
        case 'execution-flow-section':
        case 'checkpoint-commit':
        case 'progress-tracking':
          // May need batch instructions for large operations
          this.addBatchNotesIfNeeded(construct, replacements, warnings)
          break

        case 'activation-instruction':
          this.transformActivationInstruction(construct, replacements, warnings)
          break

        case 'advisory-warning':
        case 'version-comment':
          // Informational - pass through
          break
      }
    }

    const transformedContent = applyReplacements(content, replacements)

    return {
      content: transformedContent,
      warnings,
    }
  }

  private transformAgentSpawn(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Extract the task description from context
    const rawText = construct.rawText
    let taskDescription = 'the specified task'

    // Try to extract what the agent should handle
    const handleMatch = rawText.match(/(?:to\s+)?(?:handle|for)\s+(.+)/i)
    if (handleMatch?.[1]) {
      taskDescription = handleMatch[1].trim()
    }

    const replacement = `## Manual Handoff

Create a separate chat session to handle: ${taskDescription}

> **NOTE:** GitHub Copilot does not support subagent execution.`

    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: rawText,
      replacement,
    })

    warnings.push({
      category: 'EMULATED',
      message: 'Agent spawning converted to manual handoff',
      details: 'GitHub Copilot does not support Task tool. User must manually create separate chat session.',
    })
  }

  private transformToolCall(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const toolName = construct.parsed?.toolName as string | undefined
    if (!toolName) return

    const recommendation = TOOL_TO_RECOMMENDATION[toolName] || `perform ${toolName.toLowerCase()} operations`

    // Extract context from the raw text
    const rawText = construct.rawText
    let contextPart = ''

    const toMatch = rawText.match(/tool\s+to\s+(.+)/i)
    if (toMatch?.[1]) {
      contextPart = ` to ${toMatch[1]}`
    }

    // Convert to generic recommendation
    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: rawText,
      replacement: recommendation.charAt(0).toUpperCase() + recommendation.slice(1) + contextPart,
    })

    warnings.push({
      category: 'EMULATED',
      message: `Tool reference ${toolName} converted to recommendation`,
      details: 'GitHub Copilot does not expose specific tool names. Using generic action description.',
    })
  }

  private transformContextSwitch(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Remove context switch references entirely - Copilot doesn't support this
    replacements.push({
      start: construct.location.start,
      end: construct.location.end,
      original: construct.rawText,
      replacement: '', // Remove entirely
    })

    warnings.push({
      category: 'UNSUPPORTED',
      message: 'Context isolation removed',
      details: 'GitHub Copilot does not support context isolation. Reference removed.',
    })
  }

  private transformGlobPattern(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Check if this is a Windsurf globs: field or inline pattern
    if (rawText.includes('globs:')) {
      // Add working set note
      const note = `

> **Working Set Note:** GitHub Copilot has a 10-file limit. Prioritize most relevant files.
> Use applyTo: patterns in frontmatter instead of globs:.`

      replacements.push({
        start: construct.location.end,
        end: construct.location.end,
        original: '',
        replacement: note,
      })

      warnings.push({
        category: 'LIMIT',
        message: 'Glob patterns may exceed working set limit',
        details: 'GitHub Copilot limits context to 10 files. Consider using applyTo: for file filtering.',
      })
    } else if (construct.parsed?.pattern) {
      // Inline glob pattern - add batch instruction
      const note = '\n\n> Process files matching this pattern in batches of 10 to stay within working set limits.'

      replacements.push({
        start: construct.location.end,
        end: construct.location.end,
        original: '',
        replacement: note,
      })
    }
  }

  private transformSkillChaining(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Convert /skill-name to /prompt name format
    const skillMatch = rawText.match(/\/([a-z-]+)/i)
    if (skillMatch?.[1]) {
      const skillName = skillMatch[1]
      if (skillName !== 'prompt') {
        replacements.push({
          start: construct.location.start,
          end: construct.location.end,
          original: rawText,
          replacement: `/prompt ${skillName}`,
        })
        warnings.push({
          category: 'EMULATED',
          message: `/${skillName} converted to /prompt ${skillName}`,
          details: 'GitHub Copilot uses /prompt name format for prompt invocation.',
        })
      }
    }

    // Handle "Part X of Y" patterns - add batch processing note
    if (construct.parsed?.totalParts && (construct.parsed.totalParts as number) > 1) {
      const totalParts = construct.parsed.totalParts as number
      if (totalParts > 3) {
        const note = '\n\n> Consider processing in smaller batches due to context limitations.'
        replacements.push({
          start: construct.location.end,
          end: construct.location.end,
          original: '',
          replacement: note,
        })
      }
    }
  }

  private transformPermissionReference(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Copilot doesn't have permission enforcement either
    if (!construct.parsed?.isAdvisory) {
      const advisoryNote = '\n\n> **NOTE:** These restrictions are advisory and rely on AI compliance.'
      replacements.push({
        start: construct.location.end,
        end: construct.location.end,
        original: '',
        replacement: advisoryNote,
      })

      warnings.push({
        category: 'SECURITY',
        message: 'Permission restrictions are advisory only',
        details: 'GitHub Copilot cannot enforce tool or file restrictions.',
      })
    }
  }

  private transformContextGatheringProtocol(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Add batch processing note for context gathering
    const batchNote = `

> **Context Limit:** GitHub Copilot has limited context. Process files in groups of 10.
> Prioritize: 1) Entry points 2) Core logic 3) Related utilities`

    replacements.push({
      start: construct.location.end,
      end: construct.location.end,
      original: '',
      replacement: batchNote,
    })

    warnings.push({
      category: 'LIMIT',
      message: 'Context gathering needs batching',
      details: 'GitHub Copilot 10-file limit requires processing context in batches.',
    })
  }

  private transformModelDecisionTrigger(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // Copilot uses infer: true instead of trigger: model_decision
    if (construct.parsed?.hasTriggerField) {
      warnings.push({
        category: 'EMULATED',
        message: 'trigger: model_decision converted to infer: true',
        details: 'GitHub Copilot uses infer field for automatic activation.',
      })
    }
  }

  private transformPersonaRule(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Convert @rules:agent-name to natural language
    if (rawText.includes('@rules:agent-')) {
      const match = rawText.match(/@rules:agent-([a-z-]+)/i)
      if (match?.[1]) {
        const agentName = match[1].replace(/-/g, ' ')
        replacements.push({
          start: construct.location.start,
          end: construct.location.end,
          original: rawText,
          replacement: `Act as a ${agentName}`,
        })
        warnings.push({
          category: 'EMULATED',
          message: 'Persona rule converted to natural language',
          details: 'GitHub Copilot does not have @rules: directive. Using natural language persona instruction.',
        })
      }
    }
  }

  private transformActivationInstruction(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    const rawText = construct.rawText

    // Convert /skill-name to /prompt name format
    const commandMatch = rawText.match(/\/([a-z-]+)/i)
    if (commandMatch?.[1]) {
      const skillName = commandMatch[1]
      if (skillName !== 'prompt') {
        const newInstruction = rawText.replace(`/${skillName}`, `/prompt ${skillName}`)
        replacements.push({
          start: construct.location.start,
          end: construct.location.end,
          original: rawText,
          replacement: newInstruction,
        })
      }
    }

    // Convert "skill" terminology to "prompt"
    if (/invoke\s+this\s+skill/i.test(rawText) && !rawText.includes('prompt')) {
      replacements.push({
        start: construct.location.start,
        end: construct.location.end,
        original: rawText,
        replacement: rawText.replace(/skill/gi, 'prompt'),
      })
    }
  }

  private addBatchNotesIfNeeded(
    construct: SemanticConstruct,
    replacements: Replacement[],
    warnings: TransformationWarning[],
  ): void {
    // For progress tracking with many items, add batch note
    if (construct.type === 'progress-tracking' && construct.parsed?.hasChecklist) {
      // Check if content suggests large number of items
      const rawText = construct.rawText
      const checkboxCount = (rawText.match(/\[\s*[xX ]?\s*\]/g) || []).length

      if (checkboxCount > 10) {
        const batchNote = '\n\n> Process checklist items in batches of 10 due to context limitations.'
        replacements.push({
          start: construct.location.end,
          end: construct.location.end,
          original: '',
          replacement: batchNote,
        })

        warnings.push({
          category: 'LIMIT',
          message: 'Large checklist may exceed context',
          details: 'Consider breaking into smaller segments.',
        })
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a content transformer for the specified platform
 *
 * @param platform - Target platform
 * @returns Content transformer instance
 */
export function createContentTransformer(platform: Platform): ContentTransformer {
  switch (platform) {
    case 'claude-code':
      return new ClaudeCodeContentTransformer()
    case 'windsurf':
      return new WindsurfContentTransformer()
    case 'github-copilot':
      return new CopilotContentTransformer()
    default:
      throw new Error(`Unknown platform: ${platform}`)
  }
}
