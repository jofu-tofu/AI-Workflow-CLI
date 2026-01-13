/**
 * Template Parser
 *
 * Parses template files with YAML frontmatter and markdown content.
 * Uses gray-matter for frontmatter extraction.
 */

import matter from 'gray-matter'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import type {ParsedTemplate, ParseOptions, TemplateMetadata, ValidationIssue} from './types.js'

/**
 * Error thrown when parsing fails
 */
export class ParseError extends Error {
  sourcePath: string | undefined
  line: number | undefined
  column: number | undefined

  constructor(
    message: string,
    sourcePath?: string,
    line?: number,
    column?: number,
  ) {
    super(message)
    this.name = 'ParseError'
    if (sourcePath !== undefined) {
      this.sourcePath = sourcePath
    }

    if (line !== undefined) {
      this.line = line
    }

    if (column !== undefined) {
      this.column = column
    }
  }
}

/**
 * Normalize array fields that can be string or string[]
 * Converts comma-separated strings to arrays
 */
function normalizeArrayField(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map(String)
  }

  if (typeof value === 'string') {
    // Split by comma if contains commas, otherwise return single-item array
    if (value.includes(',')) {
      return value.split(',').map((s) => s.trim()).filter(Boolean)
    }

    return [value]
  }

  return undefined
}

/**
 * Normalize metadata fields for consistent processing
 */
function normalizeMetadata(raw: Record<string, unknown>): TemplateMetadata {
  const metadata: TemplateMetadata = {}

  // Core fields - direct copy
  if (raw.name !== undefined) metadata.name = String(raw.name)
  if (raw.description !== undefined) metadata.description = String(raw.description)
  if (raw.version !== undefined) metadata.version = String(raw.version)

  // Claude Code fields
  const allowedTools = normalizeArrayField(raw['allowed-tools'])
  if (allowedTools !== undefined) {
    metadata['allowed-tools'] = allowedTools
  }

  if (raw.model !== undefined) metadata.model = String(raw.model)
  if (raw.context !== undefined) {
    const ctx = String(raw.context)
    if (ctx === 'inherit' || ctx === 'fork') {
      metadata.context = ctx
    }
  }

  if (raw.agent !== undefined) metadata.agent = String(raw.agent)
  if (raw.permissions !== undefined && typeof raw.permissions === 'object') {
    const perms = raw.permissions as Record<string, unknown>
    metadata.permissions = {}
    const allowPerms = normalizeArrayField(perms.allow)
    if (allowPerms !== undefined) {
      metadata.permissions.allow = allowPerms
    }

    const denyPerms = normalizeArrayField(perms.deny)
    if (denyPerms !== undefined) {
      metadata.permissions.deny = denyPerms
    }
  }

  if (raw['disable-model-invocation'] !== undefined) {
    metadata['disable-model-invocation'] = Boolean(raw['disable-model-invocation'])
  }

  if (raw['argument-hint'] !== undefined) {
    metadata['argument-hint'] = String(raw['argument-hint'])
  }

  if (raw.hooks !== undefined && typeof raw.hooks === 'object') {
    metadata.hooks = raw.hooks as NonNullable<TemplateMetadata['hooks']>
  }

  if (raw.language !== undefined) metadata.language = String(raw.language)

  // Windsurf fields
  if (raw.trigger !== undefined) {
    const trigger = String(raw.trigger)
    if (['manual', 'always_on', 'model_decision', 'glob'].includes(trigger)) {
      metadata.trigger = trigger as NonNullable<TemplateMetadata['trigger']>
    }
  }

  const globs = normalizeArrayField(raw.globs)
  if (globs !== undefined) {
    metadata.globs = globs
  }

  const labels = normalizeArrayField(raw.labels)
  if (labels !== undefined) {
    metadata.labels = labels
  }

  if (raw.alwaysApply !== undefined) metadata.alwaysApply = Boolean(raw.alwaysApply)
  if (raw.author !== undefined) metadata.author = String(raw.author)

  // GitHub Copilot fields
  const applyTo = normalizeArrayField(raw.applyTo)
  if (applyTo !== undefined) {
    metadata.applyTo = applyTo
  }

  const excludeAgent = normalizeArrayField(raw.excludeAgent)
  if (excludeAgent !== undefined) {
    metadata.excludeAgent = excludeAgent
  }

  if (raw.mode !== undefined) {
    const mode = String(raw.mode)
    if (['agent', 'ask', 'edit'].includes(mode)) {
      metadata.mode = mode as NonNullable<TemplateMetadata['mode']>
    }
  }

  const tools = normalizeArrayField(raw.tools)
  if (tools !== undefined) {
    metadata.tools = tools
  }

  if (raw.infer !== undefined) metadata.infer = Boolean(raw.infer)
  if (raw.target !== undefined) {
    const target = String(raw.target)
    if (target === 'vscode' || target === 'github-copilot') {
      metadata.target = target
    }
  }

  if (raw.metadata !== undefined && typeof raw.metadata === 'object') {
    metadata.metadata = raw.metadata as Record<string, string>
  }

  if (raw.handoffs !== undefined && Array.isArray(raw.handoffs)) {
    metadata.handoffs = raw.handoffs as NonNullable<TemplateMetadata['handoffs']>
  }

  if (raw['mcp-servers'] !== undefined && typeof raw['mcp-servers'] === 'object') {
    metadata['mcp-servers'] = raw['mcp-servers'] as Record<string, unknown>
  }

  // Cross-platform fields
  if (raw.platforms !== undefined) {
    const platforms = normalizeArrayField(raw.platforms)
    if (platforms !== undefined) {
      const filteredPlatforms = platforms.filter(
        (p) => ['claude-code', 'windsurf', 'github-copilot'].includes(p),
      ) as NonNullable<TemplateMetadata['platforms']>
      if (filteredPlatforms.length > 0) {
        metadata.platforms = filteredPlatforms
      }
    }
  }

  if (raw.compatibility !== undefined && typeof raw.compatibility === 'object') {
    metadata.compatibility = raw.compatibility as NonNullable<TemplateMetadata['compatibility']>
  }

  if (raw.emulation !== undefined && typeof raw.emulation === 'object') {
    metadata.emulation = raw.emulation as NonNullable<TemplateMetadata['emulation']>
  }

  return metadata
}

/**
 * Parse a template file from disk
 *
 * @param filePath Path to the template file
 * @param options Parse options
 * @returns Parsed template with metadata and content
 * @throws ParseError if file cannot be read or parsed
 */
export async function parseTemplate(
  filePath: string,
  options: ParseOptions = {},
): Promise<ParsedTemplate> {
  const {basePath} = options
  const resolvedPath = basePath ? resolve(basePath, filePath) : resolve(filePath)

  let content: string
  try {
    content = await readFile(resolvedPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ParseError(`File not found: ${resolvedPath}`, resolvedPath)
    }

    throw new ParseError(
      `Failed to read file: ${(error as Error).message}`,
      resolvedPath,
    )
  }

  try {
    const result = parseTemplateString(content, options)
    return {
      ...result,
      sourcePath: resolvedPath,
    }
  } catch (error) {
    if (error instanceof ParseError) {
      error.sourcePath = resolvedPath
      throw error
    }

    throw new ParseError(
      `Failed to parse file: ${(error as Error).message}`,
      resolvedPath,
    )
  }
}

/**
 * Parse a template from string content
 *
 * @param content Template content (YAML frontmatter + markdown)
 * @param options Parse options
 * @returns Parsed template with metadata and content
 * @throws ParseError if content cannot be parsed
 */
export function parseTemplateString(
  content: string,
  options: ParseOptions = {},
): ParsedTemplate {
  // Check for frontmatter delimiters
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) {
    throw new ParseError(
      'Template must start with YAML frontmatter (---). ' +
      'Ensure your template begins with --- followed by YAML metadata.',
    )
  }

  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(content)
  } catch (error) {
    const message = (error as Error).message
    // Try to extract line number from YAML error
    const lineMatch = message.match(/at line (\d+)/)
    const parseError = new ParseError(`Invalid YAML frontmatter: ${message}`)

    if (lineMatch && lineMatch[1]) {
      parseError.line = Number.parseInt(lineMatch[1], 10)
    }

    throw parseError
  }

  // Normalize the raw metadata
  const metadata = normalizeMetadata(parsed.data)

  // Validate required fields if requested
  if (options.validateRequired !== false) {
    const issues = validateRequiredFields(metadata)
    const errors = issues.filter((i) => i.severity === 'error')
    if (errors.length > 0) {
      const fieldNames = errors.map((e) => e.field).filter((f): f is string => f !== undefined)
      throw new ParseError(
        `Missing required fields: ${fieldNames.join(', ')}. ` +
        errors.map((e) => e.message).join(' '),
      )
    }
  }

  return {
    metadata,
    content: parsed.content.trim(),
  }
}

/**
 * Validate that required fields are present
 */
function validateRequiredFields(metadata: TemplateMetadata): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Description is strongly recommended for all platforms
  if (!metadata.description) {
    issues.push({
      severity: 'warning',
      field: 'description',
      message: 'Description field is strongly recommended for all platforms',
      suggestion: 'Add a description explaining what this template does',
    })
  }

  // Note: We don't require 'name' here because it's only required for Claude Code,
  // and Windsurf uses filename. Platform-specific validation happens in adapters.

  return issues
}

/**
 * Check if a file appears to be a valid template (has frontmatter)
 *
 * @param content File content to check
 * @returns True if content appears to be a template
 */
export function isValidTemplate(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) {
    return false
  }

  // Check for closing frontmatter delimiter
  const secondDelimiter = trimmed.indexOf('---', 3)
  return secondDelimiter > 3
}

/**
 * Extract just the frontmatter from a template without full parsing
 *
 * @param content Template content
 * @returns Raw frontmatter data object
 */
export function extractFrontmatter(content: string): Record<string, unknown> | null {
  try {
    const parsed = matter(content)
    return parsed.data
  } catch {
    return null
  }
}
