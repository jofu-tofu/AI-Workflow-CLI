import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'

import {IdePathResolver} from './ide-path-resolver.js'
import {pathExists} from './paths.js'

/**
 * Configuration for template installation
 */
interface TemplateInstallConfig {
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
interface TemplateItemStatus {
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
interface TemplateInstallationStatus {
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
interface InstallationResult {
  /** List of folder names that were installed (for gitignore) */
  installedFolders: string[]
  /** Whether shared settings were merged into IDE settings */
  sharedSettingsMerged: boolean
  /** Absolute path to the template that was installed */
  templatePath: string
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

  // Filter entries to only include relevant items (skip non-selected IDE folders and excluded patterns)
  const relevantEntries = entries.filter((entry) => {
    // Skip excluded patterns (test files, cache, etc.)
    if (shouldExclude(entry.name)) {
      return false
    }

    if (entry.name.startsWith('.') && entry.isDirectory()) {
      const ideName = entry.name.slice(1)
      return ides.includes(ideName)
    }

    return true
  })

  // Check all entries in parallel
  // Non-dot folders go into .aiwcli/, dot folders stay at project root
  const resolver = new IdePathResolver(targetDir)
  const containerDir = resolver.getAiwcliContainer()
  const statusChecks = relevantEntries.map(async (entry) => {
    // Dot folders (IDE folders) are at project root, non-dot folders are in .aiwcli/
    const targetPath = entry.name.startsWith('.')
      ? resolver.getIdeDir(entry.name.slice(1))
      : join(containerDir, entry.name)
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
 * Patterns to exclude when copying template directories.
 * These are development/test artifacts that shouldn't be packaged.
 */
const EXCLUDED_PATTERNS = new Set([
  '_output',
])

/**
 * Check if a filename should be excluded from copying
 */
export function shouldExclude(name: string): boolean {
  return EXCLUDED_PATTERNS.has(name)
}

/**
 * Copy directory recursively with proper error handling.
 * Excludes test files, cache directories, and output folders.
 *
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @param excludeIdeFolders - If true, exclude IDE config folders (.claude, .windsurf, etc.)
 */
export async function copyDir(src: string, dest: string, excludeIdeFolders: boolean = false): Promise<void> {
  await fs.mkdir(dest, {recursive: true})

  const entries = await fs.readdir(src, {withFileTypes: true})

  const operations = entries
    .filter((entry) => {
      // Standard exclusions (test files, cache, etc.)
      if (shouldExclude(entry.name)) {
        return false
      }

      // Exclude IDE config folders if requested (used for _shared folder)
      // These folders are used for settings merging, not direct installation
      if (excludeIdeFolders && entry.isDirectory() && entry.name.startsWith('.')) {
        return false
      }

      return true
    })
    .map(async (entry) => {
      const srcPath = join(src, entry.name)
      const destPath = join(dest, entry.name)

      try {
        return entry.isDirectory() ? await copyDir(srcPath, destPath, excludeIdeFolders) : await fs.copyFile(srcPath, destPath)
      } catch (error) {
        const err = error as Error
        throw new Error(`Failed to copy ${srcPath} to ${destPath}: ${err.message}`)
      }
    })

  await Promise.all(operations)
}

/**
 * Merge source directory into destination, skipping existing files.
 * Unlike copyDir, this preserves existing files in destination.
 *
 * @param src - Source directory path
 * @param dest - Destination directory path
 */
async function mergeDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, {recursive: true})
  const entries = await fs.readdir(src, {withFileTypes: true})

  const ops = entries
    .filter((entry) => !shouldExclude(entry.name))
    .map(async (entry) => {
      const srcPath = join(src, entry.name)
      const destPath = join(dest, entry.name)

      if (entry.isDirectory()) {
        await mergeDirectory(srcPath, destPath)
      } else if (!(await pathExists(destPath))) {
        await fs.copyFile(srcPath, destPath)
      }
    })
  await Promise.all(ops)
}

/**
 * Install template with IDE-specific folder selection.
 *
 * Template structure:
 * - Non-dot folders (e.g., _bmad/, GSR/) → .aiwcli/ (always overwritten)
 * - _shared/ → .aiwcli/_shared/ (always overwritten)
 * - IDE dot folders (e.g., .claude/) → decomposed into method-owned subdirs
 *
 * Settings reconstruction is handled separately by the caller via reconstructIdeSettings().
 *
 * @param config - Installation configuration
 * @returns Installation result with list of installed folders
 * @throws Error if template doesn't exist or requested IDE folder not found
 */
export async function installTemplate(
  config: TemplateInstallConfig,
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

  // Scan template directory to classify folders (excluding test/cache patterns)
  const entries = await fs.readdir(templatePath, {withFileTypes: true})
  const directories = entries.filter((entry) => entry.isDirectory() && !shouldExclude(entry.name))

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

  // Create .aiwcli container folder for method-specific files
  const resolver = new IdePathResolver(targetDir)
  const containerDir = resolver.getAiwcliContainer()
  await fs.mkdir(containerDir, {recursive: true})

  // Install non-dot folders into .aiwcli/ container (always overwrite)
  const nonDotInstalls = nonDotFolders.map(async (folder) => {
    const srcPath = join(templatePath, folder)
    const destPath = join(containerDir, folder)
    await copyDir(srcPath, destPath)
    return folder
  })

  const nonDotResults = await Promise.all(nonDotInstalls)
  installedFolders.push(...nonDotResults)

  // Install root-level _shared directory (shared across all templates)
  // Exclude IDE config folders (.claude, .windsurf) - they are used for settings merging only
  const templatesRoot = dirname(templatePath)
  const rootSharedSrc = join(templatesRoot, '_shared')
  const rootSharedDest = join(containerDir, '_shared')

  if (await pathExists(rootSharedSrc)) {
    await copyDir(rootSharedSrc, rootSharedDest, true) // excludeIdeFolders = true
    installedFolders.push('_shared')

    // Copy shared IDE content (e.g., _shared/.claude/commands/handoff.md)
    // These are non-method-owned files that live in IDE folders
    const sharedIdeInstalls = ides.map(async (ide) => {
      const sharedIdeFolder = join(rootSharedSrc, `.${ide}`)
      if (await pathExists(sharedIdeFolder)) {
        const destIdeFolder = resolver.getIdeDir(ide)
        await fs.mkdir(destIdeFolder, {recursive: true})
        // Merge shared IDE content, skipping files that already exist
        await mergeDirectory(sharedIdeFolder, destIdeFolder)
      }
    })
    await Promise.all(sharedIdeInstalls)
  }

  // Install method-owned IDE content (decomposed approach)
  // Instead of copying entire .claude/ from template, only copy method-namespaced subdirectories
  const ideInstalls = ides.map(async (ide) => {
    const folderName = dotFolders.get(ide)
    if (!folderName) return null

    const srcIdePath = join(templatePath, folderName)
    const destIdePath = resolver.getIdeDir(ide)
    await fs.mkdir(destIdePath, {recursive: true})

    // Scan the template IDE folder for subdirectories and copy method-owned content
    const ideEntries = await fs.readdir(srcIdePath, {withFileTypes: true})
    const subdirOps = ideEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const subdirSrc = join(srcIdePath, entry.name)
        const subdirDest = join(destIdePath, entry.name)

        // Check for method-namespaced child within this subdirectory
        const methodChildSrc = join(subdirSrc, templateName)
        if (await pathExists(methodChildSrc)) {
          // Copy only the method-namespaced subdirectory (overwrite)
          const methodChildDest = join(subdirDest, templateName)
          await copyDir(methodChildSrc, methodChildDest)
        } else {
          // No method-namespaced child — copy the entire subdirectory, merging with existing
          await mergeDirectory(subdirSrc, subdirDest)
        }
      })
    await Promise.all(subdirOps)

    return folderName
  })

  const ideResults = (await Promise.all(ideInstalls)).filter(
    (result): result is string => result !== null,
  )
  installedFolders.push(...ideResults)

  // Settings reconstruction is handled by the caller via reconstructIdeSettings()

  return {
    installedFolders,
    sharedSettingsMerged: false,
    templatePath,
  }
}
