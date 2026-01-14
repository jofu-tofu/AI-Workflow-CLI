import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

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
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  const currentDir = dirname(currentFilePath)

  // Go up one level and into templates/<templateName>
  // src/lib/ → src/templates/<templateName>/
  // dist/lib/ → dist/templates/<templateName>/
  const templatePath = join(currentDir, '..', 'templates', templateName)

  // Validate template exists
  try {
    await fs.access(templatePath)
  } catch {
    throw new Error(`Template '${templateName}' not found at ${templatePath}`)
  }

  return templatePath
}

/**
 * Get list of available template names by scanning the templates directory.
 *
 * @returns Array of template names (e.g., ['bmad', 'gsr'])
 * @throws Error if templates directory cannot be read (indicates corrupted installation)
 */
export async function getAvailableTemplates(): Promise<string[]> {
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  const currentDir = dirname(currentFilePath)

  const templatesDir = join(currentDir, '..', 'templates')

  try {
    const entries = await fs.readdir(templatesDir, {withFileTypes: true})
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    throw new Error(
      `Failed to read templates directory at ${templatesDir}: ${err.message}. ` +
      `This indicates a corrupted installation. Please reinstall aiwcli.`
    )
  }
}

