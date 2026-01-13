/**
 * Content Parser with Semantic Construct Detection Engine
 *
 * Parses markdown workflow content to identify platform-specific semantic
 * constructs that require transformation between AI assistant platforms.
 *
 * @module content-parser
 */

import type {
  Platform,
  SemanticConstruct,
  SemanticConstructType,
  ContentAnalysis,
  ConstructLocation,
} from './types.js'

// =============================================================================
// Detection Patterns
// =============================================================================

/**
 * Regex patterns for detecting semantic constructs in content
 * Each pattern is designed to match platform-specific syntax
 */
const PATTERNS: Record<SemanticConstructType, RegExp> = {
  'agent-spawn':
    /(?:spawn\s+(?:a\s+)?(?:new\s+)?agent|subagent|Task\s+tool|parallel\s+agent|delegate\s+to\s+agent|separate\s+context)/gi,

  'tool-call':
    /(?:use\s+(?:the\s+)?(?:Read|Write|Edit|Grep|Glob|Bash|Task|WebFetch|WebSearch|AskUserQuestion)\s+tool|call\s+(?:the\s+)?(?:Read|Write|Edit|Grep|Glob|Bash|Task)\s+tool|(?:Read|Write|Edit|Grep|Glob|Bash)\s*\(|run\s+(?:Read|Grep|Glob))/gi,

  'context-switch':
    /(?:context:\s*(?:fork|inherit)|fork\s+context|inherit\s+context|isolated\s+context|context\s+isolation|context\s+window|fresh\s+context|clean\s+context|shared\s+context)/gi,

  'permission-reference':
    /(?:allowed[- ]?tools|forbidden\s+operations|tool\s+restrictions?|permission\s+restrictions?|not\s+allowed|allow(?:ed)?:\s*-|deny:\s*-|before\s+using\s+tools\s+outside|rely\s+on\s+AI\s+compliance|advisory\s+(?:only|restrictions?)|cannot\s+be\s+enforced)/gi,

  'model-decision-trigger':
    /(?:USE\s+WHEN|trigger:\s*model_decision|model\s+decision|AI\s+determines|AI\s+decides|automatically\s+activates?|activates?\s+automatically|auto-?activation|activate\s+when\s+user\s+mentions|Cascade['s]?\s+(?:model\s+decision|determines))/gi,

  'glob-pattern':
    /(?:globs?:\s*\[|globs?:\s*-\s*["']|matching\s+glob|glob\s+pattern|\*\*\/\*\.(?:ts|tsx|js|jsx|py|md)|src\/\*\*\/|files?\s+matching\s+["']?\*|applyTo:\s*\[)/gi,

  'persona-rule':
    /(?:@rules:agent-[a-z-]+|agent\s+persona|persona\s+rule|security[-\s]specialist|specialized\s+agent|adopt\s+this\s+persona|behavioral\s+guidelines|specialized\s+[a-z]+\s+agent|custom\s+agent)/gi,

  'skill-chaining':
    /(?:\/prompt\s+[a-z-]+|Part\s+\d+\s+(?:of|→)\s+\d+|Proceed\s+to\s+Part\s+\d+|Next\s+Steps.*Part\s+\d+|→\s*Part\s+\d+|skill\s+chaining|invoke.*skill|chain.*skills?|\/[a-z-]+\s*$|execute.*prompt)/gim,

  'context-gathering-protocol':
    /(?:Step\s+0|Context\s+Gathering\s+Protocol|Multi-?File\s+Context\s+Acquisition|Context\s+Checklist|gather.*context|context\s+gathering|before\s+beginning.*gather|comprehensive\s+context|Only\s+proceed.*context)/gi,

  'activation-instruction':
    /(?:Manual\s+invocation|Invocation.*command|\/[a-z-]+\s*$|When\s+to\s+invoke|invoke\s+this\s+skill|invoke\s+with|user\s+must.*invoke|explicitly\s+invoke|Activation\s+Instructions|Manual\s+Trigger)/gim,

  'working-set-limit':
    /(?:working\s+set|10[-\s]file\s+limit|file\s+limit|working\s+set\s+limit|≤?\s*10\s+files?|in\s+batch|batch\s+of\s+files?|file\s+prioritization|exceeds?.*limit|within.*limit)/gi,

  'checkpoint-commit':
    /(?:checkpoint|create\s+commit|Checkpoint\s*:|commit\s+after|Step\s+\d+:\s*Checkpoint|git\s+commit.*refactor|rollback\s+plan|checkpoint\s+commit)/gi,

  'progress-tracking':
    /(?:REFACTOR-PROGRESS\.md|Progress\s+Tracking|Completion\s+Checklist|\[\s*[xX ]?\s*\].*completed?|progress\s+file|track.*progress|current\s+part|Status:)/gi,

  'workspace-command':
    /(?:@workspace\s+(?:analyze|find|show)|@workspace|workspace\s+search|use\s+@workspace)/gi,

  'test-command':
    /(?:npm\s+test|npm\s+run\s+test|run\s+tests?|test\s+suite|verify.*tests?|tests?\s+pass|pytest|jest|mocha|vitest)/gi,

  'advisory-warning':
    /(?:NOTE:.*not\s+enforced|advisory\s+only|rely\s+on\s+AI\s+compliance|cannot\s+be\s+enforced|IMPORTANT:.*restrictions|WARNING:.*limitations?|emulated|simulated|not\s+supported)/gi,

  'version-comment':
    /<!--\s*Version:\s*[\d.]+\s*-->|<!--\s*Part\s+\d+\s+of\s+\d+|<!--\s*Adapted\s+from/g,

  'execution-flow-section':
    /(?:Execution\s+Flow|Step-by-Step\s+Execution|Manual\s+Traceability|Intermediate\s+State|Verification\s+Points)/gi,
}

/**
 * Mapping of construct types to their source platforms
 */
const SOURCE_PLATFORMS: Record<SemanticConstructType, Platform> = {
  'agent-spawn': 'claude-code',
  'tool-call': 'claude-code',
  'context-switch': 'claude-code',
  'permission-reference': 'claude-code',
  'model-decision-trigger': 'windsurf',
  'glob-pattern': 'windsurf',
  'persona-rule': 'windsurf',
  'skill-chaining': 'github-copilot',
  'context-gathering-protocol': 'claude-code',
  'activation-instruction': 'claude-code', // universal but claude-code is primary
  'working-set-limit': 'github-copilot',
  'checkpoint-commit': 'github-copilot',
  'progress-tracking': 'github-copilot',
  'workspace-command': 'github-copilot',
  'test-command': 'claude-code', // universal
  'advisory-warning': 'windsurf',
  'version-comment': 'windsurf',
  'execution-flow-section': 'claude-code', // universal
}

/**
 * Pattern for detecting code blocks that should be skipped
 * Matches fenced code blocks (```...```) and inline code (`...`)
 */
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]+`/g

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Represents a range that should be excluded from matching
 */
interface ExcludedRange {
  start: number
  end: number
}

/**
 * Find all code block ranges in content that should be skipped
 *
 * @param content - The content to scan for code blocks
 * @returns Array of excluded ranges
 */
function findCodeBlockRanges(content: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = []
  const regex = new RegExp(CODE_BLOCK_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return ranges
}

/**
 * Check if a position falls within any excluded range
 *
 * @param position - Character position to check
 * @param excludedRanges - Array of excluded ranges
 * @returns True if position is within an excluded range
 */
function isInExcludedRange(position: number, excludedRanges: ExcludedRange[]): boolean {
  return excludedRanges.some((range) => position >= range.start && position < range.end)
}

/**
 * Calculate the line number for a character position
 *
 * @param content - The full content
 * @param position - Character position
 * @returns Line number (1-indexed)
 */
function getLineNumber(content: string, position: number): number {
  const substring = content.slice(0, position)
  const lines = substring.split('\n')
  return lines.length
}

/**
 * Create a fresh copy of a regex pattern with reset state
 *
 * @param pattern - The regex pattern to copy
 * @returns A new RegExp with the same pattern and flags
 */
function createFreshRegex(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags)
}

/**
 * Parse additional data from matched text based on construct type
 *
 * @param type - The type of construct
 * @param rawText - The matched text
 * @returns Extracted data object
 */
function parseConstructData(
  type: SemanticConstructType,
  rawText: string,
): Record<string, unknown> {
  const parsed: Record<string, unknown> = {}

  switch (type) {
    case 'agent-spawn': {
      // Extract agent type if mentioned
      const hasTaskTool = /Task\s+tool/i.test(rawText)
      const hasFork = /context:\s*fork|fork\s+context/i.test(rawText)
      const hasSpawn = /spawn/i.test(rawText)
      parsed.mechanism = hasTaskTool ? 'task-tool' : hasFork ? 'context-fork' : hasSpawn ? 'spawn' : 'unknown'
      break
    }

    case 'tool-call': {
      // Extract tool name
      const toolMatch = rawText.match(/(?:Read|Write|Edit|Grep|Glob|Bash|Task|WebFetch|WebSearch|AskUserQuestion)/i)
      if (toolMatch) {
        parsed.toolName = toolMatch[0]
      }
      break
    }

    case 'context-switch': {
      // Extract context type
      const isFork = /fork/i.test(rawText)
      const isInherit = /inherit/i.test(rawText)
      parsed.contextType = isFork ? 'fork' : isInherit ? 'inherit' : 'isolation'
      break
    }

    case 'model-decision-trigger': {
      // Check for USE WHEN pattern
      parsed.hasUseWhen = /USE\s+WHEN/i.test(rawText)
      parsed.hasTriggerField = /trigger:\s*model_decision/i.test(rawText)
      break
    }

    case 'glob-pattern': {
      // Try to extract glob pattern
      const globMatch = rawText.match(/\*\*\/\*\.(?:ts|tsx|js|jsx|py|md)|src\/\*\*\/[^\s]*/i)
      if (globMatch) {
        parsed.pattern = globMatch[0]
      }
      break
    }

    case 'skill-chaining': {
      // Extract part number if present
      const partMatch = rawText.match(/Part\s+(\d+)\s+(?:of|→)\s+(\d+)/i)
      if (partMatch && partMatch[1] && partMatch[2]) {
        parsed.currentPart = Number.parseInt(partMatch[1], 10)
        parsed.totalParts = Number.parseInt(partMatch[2], 10)
      }
      // Extract skill/prompt name if present
      const skillMatch = rawText.match(/\/([a-z-]+)/i)
      if (skillMatch && skillMatch[1]) {
        parsed.skillName = skillMatch[1]
      }
      break
    }

    case 'working-set-limit': {
      // Check for specific limit mentioned
      const limitMatch = rawText.match(/(\d+)[-\s]?file/i)
      if (limitMatch && limitMatch[1]) {
        parsed.fileLimit = Number.parseInt(limitMatch[1], 10)
      }
      break
    }

    case 'version-comment': {
      // Extract version number
      const versionMatch = rawText.match(/Version:\s*([\d.]+)/i)
      if (versionMatch && versionMatch[1]) {
        parsed.version = versionMatch[1]
      }
      // Extract part info
      const partMatch = rawText.match(/Part\s+(\d+)\s+of\s+(\d+)/i)
      if (partMatch && partMatch[1] && partMatch[2]) {
        parsed.currentPart = Number.parseInt(partMatch[1], 10)
        parsed.totalParts = Number.parseInt(partMatch[2], 10)
      }
      break
    }

    case 'workspace-command': {
      // Extract workspace action
      const actionMatch = rawText.match(/@workspace\s+(analyze|find|show)/i)
      if (actionMatch && actionMatch[1]) {
        parsed.action = actionMatch[1].toLowerCase()
      }
      break
    }

    case 'test-command': {
      // Extract test framework
      if (/npm\s+(?:test|run\s+test)/i.test(rawText)) {
        parsed.framework = 'npm'
      } else if (/pytest/i.test(rawText)) {
        parsed.framework = 'pytest'
      } else if (/jest/i.test(rawText)) {
        parsed.framework = 'jest'
      } else if (/mocha/i.test(rawText)) {
        parsed.framework = 'mocha'
      } else if (/vitest/i.test(rawText)) {
        parsed.framework = 'vitest'
      }
      break
    }

    case 'checkpoint-commit': {
      // Check for specific patterns
      parsed.hasStepNumber = /Step\s+\d+/i.test(rawText)
      parsed.hasRollbackPlan = /rollback\s+plan/i.test(rawText)
      break
    }

    case 'progress-tracking': {
      // Check for checklist items
      parsed.hasChecklist = /\[\s*[xX ]?\s*\]/.test(rawText)
      parsed.hasProgressFile = /REFACTOR-PROGRESS\.md/i.test(rawText)
      break
    }

    case 'permission-reference': {
      // Identify permission type
      parsed.isAdvisory = /advisory|rely\s+on\s+AI\s+compliance|cannot\s+be\s+enforced/i.test(rawText)
      parsed.isAllow = /allowed?[- ]?tools|allow(?:ed)?:/i.test(rawText)
      parsed.isDeny = /forbidden|deny:|not\s+allowed/i.test(rawText)
      break
    }

    case 'persona-rule': {
      // Extract persona name if present
      const rulesMatch = rawText.match(/@rules:agent-([a-z-]+)/i)
      if (rulesMatch && rulesMatch[1]) {
        parsed.personaName = rulesMatch[1]
      } else {
        const agentMatch = rawText.match(/agent[:\s]+([a-z-]+)/i)
        if (agentMatch && agentMatch[1]) {
          parsed.personaName = agentMatch[1]
        }
      }
      break
    }

    case 'context-gathering-protocol': {
      // Check for Step 0
      parsed.hasStep0 = /Step\s+0/i.test(rawText)
      parsed.hasChecklist = /Checklist/i.test(rawText)
      break
    }

    case 'activation-instruction': {
      // Extract invocation command if present
      const commandMatch = rawText.match(/\/([a-z-]+)/i)
      if (commandMatch) {
        parsed.command = commandMatch[1]
      }
      parsed.isManual = /Manual/i.test(rawText)
      break
    }

    case 'advisory-warning': {
      // Classify warning type
      parsed.isEnforcementWarning = /not\s+enforced|cannot\s+be\s+enforced/i.test(rawText)
      parsed.isEmulationWarning = /emulated|simulated/i.test(rawText)
      parsed.isLimitationWarning = /not\s+supported|limitations?/i.test(rawText)
      break
    }

    case 'execution-flow-section': {
      // Identify section type
      if (/Execution\s+Flow/i.test(rawText)) {
        parsed.sectionType = 'execution-flow'
      } else if (/Step-by-Step/i.test(rawText)) {
        parsed.sectionType = 'step-by-step'
      } else if (/Intermediate\s+State/i.test(rawText)) {
        parsed.sectionType = 'intermediate-state'
      } else if (/Verification\s+Points/i.test(rawText)) {
        parsed.sectionType = 'verification-points'
      }
      break
    }
  }

  return parsed
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect agent spawning patterns in content
 */
export function detectAgentSpawning(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'agent-spawn', excludedRanges)
}

/**
 * Detect tool call patterns in content
 */
export function detectToolCalls(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'tool-call', excludedRanges)
}

/**
 * Detect context switch patterns in content
 */
export function detectContextSwitches(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'context-switch', excludedRanges)
}

/**
 * Detect permission reference patterns in content
 */
export function detectPermissionReferences(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'permission-reference', excludedRanges)
}

/**
 * Detect model decision trigger patterns in content
 */
export function detectModelDecisionTriggers(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'model-decision-trigger', excludedRanges)
}

/**
 * Detect glob patterns in content
 */
export function detectGlobPatterns(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'glob-pattern', excludedRanges)
}

/**
 * Detect persona rule patterns in content
 */
export function detectPersonaRules(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'persona-rule', excludedRanges)
}

/**
 * Detect skill chaining patterns in content
 */
export function detectSkillChaining(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'skill-chaining', excludedRanges)
}

/**
 * Detect context gathering protocol patterns in content
 */
export function detectContextGatheringProtocols(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'context-gathering-protocol', excludedRanges)
}

/**
 * Detect activation instruction patterns in content
 */
export function detectActivationInstructions(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'activation-instruction', excludedRanges)
}

/**
 * Detect working set limit patterns in content
 */
export function detectWorkingSetLimits(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'working-set-limit', excludedRanges)
}

/**
 * Detect checkpoint commit patterns in content
 */
export function detectCheckpointCommits(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'checkpoint-commit', excludedRanges)
}

/**
 * Detect progress tracking patterns in content
 */
export function detectProgressTracking(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'progress-tracking', excludedRanges)
}

/**
 * Detect workspace command patterns in content
 */
export function detectWorkspaceCommands(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'workspace-command', excludedRanges)
}

/**
 * Detect test command patterns in content
 */
export function detectTestCommands(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'test-command', excludedRanges)
}

/**
 * Detect advisory warning patterns in content
 */
export function detectAdvisoryWarnings(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'advisory-warning', excludedRanges)
}

/**
 * Detect version comment patterns in content
 */
export function detectVersionComments(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'version-comment', excludedRanges)
}

/**
 * Detect execution flow section patterns in content
 */
export function detectExecutionFlowSections(
  content: string,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  return detectPattern(content, 'execution-flow-section', excludedRanges)
}

/**
 * Generic pattern detection function
 *
 * @param content - The content to search
 * @param type - The construct type to detect
 * @param excludedRanges - Ranges to skip (code blocks)
 * @returns Array of detected semantic constructs
 */
function detectPattern(
  content: string,
  type: SemanticConstructType,
  excludedRanges: ExcludedRange[],
): SemanticConstruct[] {
  const constructs: SemanticConstruct[] = []
  const pattern = createFreshRegex(PATTERNS[type])
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const start = match.index
    const end = start + match[0].length

    // Skip if match is within a code block
    if (isInExcludedRange(start, excludedRanges)) {
      continue
    }

    const location: ConstructLocation = {
      start,
      end,
      line: getLineNumber(content, start),
    }

    constructs.push({
      type,
      platform: SOURCE_PLATFORMS[type],
      source: 'body',
      location,
      rawText: match[0],
      parsed: parseConstructData(type, match[0]),
    })
  }

  return constructs
}

// =============================================================================
// Overlap Handling
// =============================================================================

/**
 * Priority order for overlapping constructs (higher = more specific)
 * More specific patterns take precedence over generic ones
 */
const CONSTRUCT_PRIORITY: Record<SemanticConstructType, number> = {
  'tool-call': 90,              // Specific tool references
  'model-decision-trigger': 85, // USE WHEN is very specific
  'activation-instruction': 80, // Specific invocation patterns
  'workspace-command': 75,      // @workspace is specific
  'version-comment': 75,        // HTML comments are specific
  'glob-pattern': 70,           // File patterns
  'persona-rule': 70,           // @rules: patterns
  'skill-chaining': 70,         // Part X of Y patterns
  'agent-spawn': 65,            // Task tool references
  'context-switch': 65,         // Context fork/inherit
  'checkpoint-commit': 60,      // Checkpoint patterns
  'working-set-limit': 60,      // File limits
  'progress-tracking': 55,      // Progress tracking
  'context-gathering-protocol': 55,
  'test-command': 50,           // Test commands
  'permission-reference': 50,   // Permission references
  'advisory-warning': 45,       // Advisory notes
  'execution-flow-section': 40, // Generic section headers
}

/**
 * Check if two constructs overlap
 */
function constructsOverlap(a: SemanticConstruct, b: SemanticConstruct): boolean {
  return (
    (a.location.start >= b.location.start && a.location.start < b.location.end) ||
    (b.location.start >= a.location.start && b.location.start < a.location.end)
  )
}

/**
 * Filter overlapping constructs, keeping the higher priority (more specific) one
 * When priorities are equal, prefer the longer match
 */
function filterOverlappingConstructs(constructs: SemanticConstruct[]): SemanticConstruct[] {
  if (constructs.length <= 1) {
    return constructs
  }

  // Sort by start position, then by priority (descending), then by length (descending)
  const sorted = [...constructs].sort((a, b) => {
    if (a.location.start !== b.location.start) {
      return a.location.start - b.location.start
    }
    const priorityDiff = CONSTRUCT_PRIORITY[b.type] - CONSTRUCT_PRIORITY[a.type]
    if (priorityDiff !== 0) {
      return priorityDiff
    }
    return b.rawText.length - a.rawText.length
  })

  const result: SemanticConstruct[] = []
  const skipped = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (skipped.has(i)) {
      continue
    }

    const current = sorted[i]
    if (!current) {
      continue
    }

    let keepCurrent = true

    // Check against remaining constructs for overlaps
    for (let j = i + 1; j < sorted.length; j++) {
      if (skipped.has(j)) {
        continue
      }

      const other = sorted[j]
      if (!other) {
        continue
      }

      if (constructsOverlap(current, other)) {
        // Determine which one to keep based on priority and length
        const currentPriority = CONSTRUCT_PRIORITY[current.type]
        const otherPriority = CONSTRUCT_PRIORITY[other.type]

        if (otherPriority > currentPriority) {
          keepCurrent = false
          break
        } else if (otherPriority === currentPriority && other.rawText.length > current.rawText.length) {
          keepCurrent = false
          break
        } else {
          // Current wins, skip the other
          skipped.add(j)
        }
      }
    }

    if (keepCurrent) {
      result.push(current)
    }
  }

  return result
}

// =============================================================================
// Main Parser Function
// =============================================================================

/**
 * Parse content for semantic constructs
 *
 * Analyzes markdown workflow content to identify platform-specific semantic
 * constructs that may require transformation between AI assistant platforms.
 *
 * Features:
 * - Skips constructs inside code blocks (fenced and inline)
 * - Handles overlapping matches (prefers longer/more specific)
 * - Tracks location info (start, end, line number)
 * - Extracts parsed data from matched constructs
 *
 * @param content - The markdown content to parse
 * @returns ContentAnalysis with all detected constructs
 *
 * @example
 * ```typescript
 * const analysis = parseContent(`
 * Use the Glob tool to find files.
 * This activates automatically when user mentions "optimize".
 * `)
 *
 * // Returns:
 * // {
 * //   constructs: [
 * //     { type: 'tool-call', rawText: 'Use the Glob tool', ... },
 * //     { type: 'model-decision-trigger', rawText: 'activates automatically when user mentions', ... }
 * //   ],
 * //   rawContent: '...'
 * // }
 * ```
 */
export function parseContent(content: string): ContentAnalysis {
  // Find code block ranges to exclude
  const excludedRanges = findCodeBlockRanges(content)

  // Collect all constructs from all detection functions
  const allConstructs: SemanticConstruct[] = [
    ...detectAgentSpawning(content, excludedRanges),
    ...detectToolCalls(content, excludedRanges),
    ...detectContextSwitches(content, excludedRanges),
    ...detectPermissionReferences(content, excludedRanges),
    ...detectModelDecisionTriggers(content, excludedRanges),
    ...detectGlobPatterns(content, excludedRanges),
    ...detectPersonaRules(content, excludedRanges),
    ...detectSkillChaining(content, excludedRanges),
    ...detectContextGatheringProtocols(content, excludedRanges),
    ...detectActivationInstructions(content, excludedRanges),
    ...detectWorkingSetLimits(content, excludedRanges),
    ...detectCheckpointCommits(content, excludedRanges),
    ...detectProgressTracking(content, excludedRanges),
    ...detectWorkspaceCommands(content, excludedRanges),
    ...detectTestCommands(content, excludedRanges),
    ...detectAdvisoryWarnings(content, excludedRanges),
    ...detectVersionComments(content, excludedRanges),
    ...detectExecutionFlowSections(content, excludedRanges),
  ]

  // Filter overlapping constructs
  const filteredConstructs = filterOverlappingConstructs(allConstructs)

  // Sort by position for consistent output
  filteredConstructs.sort((a, b) => a.location.start - b.location.start)

  return {
    constructs: filteredConstructs,
    rawContent: content,
  }
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Get all construct types
 */
export function getConstructTypes(): SemanticConstructType[] {
  return Object.keys(PATTERNS) as SemanticConstructType[]
}

/**
 * Get the source platform for a construct type
 */
export function getSourcePlatform(type: SemanticConstructType): Platform {
  return SOURCE_PLATFORMS[type]
}

/**
 * Check if content contains any semantic constructs
 */
export function hasSemanticConstructs(content: string): boolean {
  const analysis = parseContent(content)
  return analysis.constructs.length > 0
}

/**
 * Get constructs filtered by platform
 */
export function getConstructsByPlatform(
  analysis: ContentAnalysis,
  platform: Platform,
): SemanticConstruct[] {
  return analysis.constructs.filter((c) => c.platform === platform)
}

/**
 * Get constructs filtered by type
 */
export function getConstructsByType(
  analysis: ContentAnalysis,
  type: SemanticConstructType,
): SemanticConstruct[] {
  return analysis.constructs.filter((c) => c.type === type)
}
