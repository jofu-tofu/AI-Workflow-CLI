import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

function getTemplatesRootDir(): string {
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  const currentDir = dirname(currentFilePath)
  return join(currentDir, '..', 'templates')
}

/**
 * Resolve the absolute path to a bundled template root.
 * Works in both development (src/) and production (dist/) contexts.
 *
 * Resolution logic:
 * - In development: src/lib/template-resolver.ts → src/templates/<templateName>/
 * - In production: dist/lib/template-resolver.js → dist/templates/<templateName>/
 *
 * @param templateName - Name of the template to resolve (e.g., 'bmad')
 * @returns Absolute path to the template directory
 * @throws Error if template directory doesn't exist or templateName is invalid
 */
export async function getTemplatePath(templateName: string): Promise<string> {
  // Security: Prevent path traversal attacks
  if (!templateName || templateName.includes('..') || templateName.includes('/') || templateName.includes('\\')) {
    throw new Error(`Invalid template name: '${templateName}'. Template names must not contain path separators or traversal sequences.`)
  }

  // Get the directory of this file
  // In dev: .../aiwcli/src/lib/
  // In prod: .../aiwcli/dist/lib/
  // Go up one level and into templates/<templateName>
  // src/lib/ → src/templates/<templateName>/
  // dist/lib/ → dist/templates/<templateName>/
  const templatePath = join(getTemplatesRootDir(), templateName)

  // Validate template exists
  try {
    await fs.access(templatePath)
  } catch {
    throw new Error(`Template '${templateName}' not found at ${templatePath}`)
  }

  return templatePath
}

/**
 * Get list of available method template names by scanning the templates directory.
 *
 * @returns Array of method template names (e.g., ['bmad', 'cc-native'])
 * @throws Error if templates directory cannot be read (indicates corrupted installation)
 */

export async function getAvailableTemplates(): Promise<string[]> {
  const templatesDir = getTemplatesRootDir()

  try {
    const entries = await fs.readdir(templatesDir, {withFileTypes: true})
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !RESERVED_TEMPLATE_NAMES.has(entry.name))
      .map((entry) => entry.name)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    throw new Error(
      `Failed to read templates directory at ${templatesDir}: ${err.message}. ` +
      `This indicates a corrupted installation. Please reinstall aiwcli.`
    )
  }
}

/**
 * Discover IDE names available in a template path by scanning top-level dot-folders.
 * Example: .claude, .codex -> ['claude', 'codex']
 */
export async function getTemplateIdeNamesByPath(templatePath: string): Promise<string[]> {
  const entries = await fs.readdir(templatePath, {withFileTypes: true})
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('.'))
    .map((entry) => entry.name.slice(1))
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b))
}

const RESERVED_TEMPLATE_NAMES = new Set(['core'])
