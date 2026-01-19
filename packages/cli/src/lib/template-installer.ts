import {promises as fs} from 'node:fs'
import {join} from 'node:path'

/**
 * Configuration for template installation
 */
export interface TemplateInstallConfig {
  /** List of IDE names to install (e.g., ['claude', 'windsurf']) */
  ides: string[]
  /** Project name for configuration generation */
  projectName: string
  /** Target directory where template will be installed */
  targetDir: string
  /** Name of the template to install (e.g., 'bmad') */
  templateName: string
  /** Absolute path to the template directory */
  templatePath: string
  /** Username for configuration generation */
  username: string
}

/**
 * Status of a single template item (file or folder)
 */
export interface TemplateItemStatus {
  /** Whether the item exists in target directory */
  exists: boolean
  /** Whether the item is a directory */
  isDirectory: boolean
  /** The item name */
  name: string
}

/**
 * Result of checking template installation status
 */
export interface TemplateInstallationStatus {
  /** Items that already exist in target directory */
  existing: TemplateItemStatus[]
  /** Items that are missing from target directory */
  missing: TemplateItemStatus[]
  /** The method-specific workflow folder name (e.g., '_gsd', '_bmad') */
  workflowFolder: null | string
  /** Whether the workflow folder exists */
  workflowFolderExists: boolean
}

/**
 * Result of template installation
 */
export interface InstallationResult {
  /** List of folder names that were installed (for gitignore) */
  installedFolders: string[]
  /** List of folder names that were skipped (already exist) */
  skippedFolders: string[]
  /** Absolute path to the template that was installed */
  templatePath: string
}

/**
 * Check if a path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Check template installation status for a method.
 * Returns which items exist and which are missing.
 *
 * @param templatePath - Path to the template directory
 * @param targetDir - Target directory to check
 * @param ides - List of IDEs to check (for dot folders)
 * @param templateName - Name of the template (for identifying workflow folder)
 * @returns Status of template items
 */
export async function checkTemplateStatus(
  templatePath: string,
  targetDir: string,
  ides: string[],
  templateName: string,
): Promise<TemplateInstallationStatus> {
  const existing: TemplateItemStatus[] = []
  const missing: TemplateItemStatus[] = []

  // Scan template directory
  const entries = await fs.readdir(templatePath, {withFileTypes: true})

  // Identify workflow folder based on template name
  // Convention: _templatename (e.g., _gsd, _bmad)
  const workflowFolderName = `_${templateName}`
  let workflowFolder: null | string = null
  let workflowFolderExists = false

  // Filter entries to only include relevant items (skip non-selected IDE folders)
  const relevantEntries = entries.filter((entry) => {
    if (entry.name.startsWith('.') && entry.isDirectory()) {
      const ideName = entry.name.slice(1)
      return ides.includes(ideName)
    }

    return true
  })

  // Check all entries in parallel
  const statusChecks = relevantEntries.map(async (entry) => {
    const targetPath = join(targetDir, entry.name)
    const exists = await pathExists(targetPath)
    return {
      name: entry.name,
      isDirectory: entry.isDirectory(),
      exists,
    }
  })

  const statuses = await Promise.all(statusChecks)

  for (const status of statuses) {
    if (status.exists) {
      existing.push(status)
    } else {
      missing.push(status)
    }

    // Track workflow folder
    if (status.name === workflowFolderName) {
      workflowFolder = workflowFolderName
      workflowFolderExists = status.exists
    }
  }

  return {
    existing,
    missing,
    workflowFolder,
    workflowFolderExists,
  }
}

/**
 * Copy directory recursively with proper error handling
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, {recursive: true})

  const entries = await fs.readdir(src, {withFileTypes: true})

  const operations = entries.map(async (entry) => {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    try {
      return entry.isDirectory() ? await copyDir(srcPath, destPath) : await fs.copyFile(srcPath, destPath)
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to copy ${srcPath} to ${destPath}: ${err.message}`)
    }
  })

  await Promise.all(operations)
}

/**
 * Install template with IDE-specific folder selection.
 * Supports selective installation - only installs items that don't already exist.
 *
 * Template structure:
 * - Non-dot folders (e.g., _bmad/, GSR/) are installed if not already present
 * - Dot folders (e.g., .claude/, .windsurf/) are installed only if matching IDE flag and not already present
 *
 * @param config - Installation configuration
 * @param skipExisting - If true, skip items that already exist (default: true for regeneration support)
 * @returns Installation result with list of installed and skipped folders
 * @throws Error if template doesn't exist or requested IDE folder not found
 */
export async function installTemplate(
  config: TemplateInstallConfig,
  skipExisting: boolean = true,
): Promise<InstallationResult> {
  const {templateName, targetDir, ides, templatePath} = config

  // Verify template exists
  try {
    await fs.access(templatePath)
  } catch {
    throw new Error(
      `Template '${templateName}' not found at ${templatePath}. ` +
        `This indicates a corrupted installation. Please reinstall aiwcli.`,
    )
  }

  // Scan template directory to classify folders
  const entries = await fs.readdir(templatePath, {withFileTypes: true})
  const directories = entries.filter((entry) => entry.isDirectory())

  const nonDotFolders: string[] = []
  const dotFolders: Map<string, string> = new Map() // ide name -> folder name

  for (const dir of directories) {
    if (dir.name.startsWith('.')) {
      // Extract IDE name from dot folder (e.g., '.claude' -> 'claude')
      const ideName = dir.name.slice(1)
      dotFolders.set(ideName, dir.name)
    } else {
      nonDotFolders.push(dir.name)
    }
  }

  // Validate requested IDE folders exist in template
  const availableIdes = [...dotFolders.keys()]
  const missingIdes = ides.filter((ide) => !dotFolders.has(ide))

  if (missingIdes.length > 0) {
    throw new Error(
      `IDE '${missingIdes[0]}' not available for template '${templateName}'. ` +
        `Available: ${availableIdes.join(', ')}`,
    )
  }

  const installedFolders: string[] = []
  const skippedFolders: string[] = []

  // Install non-dot folders (skip if already exist and skipExisting is true)
  const nonDotInstalls = nonDotFolders.map(async (folder) => {
    const srcPath = join(templatePath, folder)
    const destPath = join(targetDir, folder)

    if (skipExisting && (await pathExists(destPath))) {
      return {folder, skipped: true}
    }

    await copyDir(srcPath, destPath)
    return {folder, skipped: false}
  })

  const nonDotResults = await Promise.all(nonDotInstalls)
  for (const result of nonDotResults) {
    if (result.skipped) {
      skippedFolders.push(result.folder)
    } else {
      installedFolders.push(result.folder)
    }
  }

  // Install matching IDE folders (skip if already exist and skipExisting is true)
  const ideInstalls = ides.map(async (ide) => {
    const folderName = dotFolders.get(ide)
    if (folderName) {
      const srcPath = join(templatePath, folderName)
      const destPath = join(targetDir, folderName)

      if (skipExisting && (await pathExists(destPath))) {
        return {folder: folderName, skipped: true}
      }

      await copyDir(srcPath, destPath)
      return {folder: folderName, skipped: false}
    }

    return null
  })

  const ideResults = (await Promise.all(ideInstalls)).filter(
    (result): result is {folder: string; skipped: boolean} => result !== null,
  )
  for (const result of ideResults) {
    if (result.skipped) {
      skippedFolders.push(result.folder)
    } else {
      installedFolders.push(result.folder)
    }
  }

  return {
    installedFolders,
    skippedFolders,
    templatePath,
  }
}
