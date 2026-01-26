import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'

import {IdePathResolver} from './ide-path-resolver.js'
import {mergeTemplateContent} from './template-merger.js'

/**
 * Deep merge two settings objects, combining hook arrays.
 * Used to merge _shared/settings.json into .claude/settings.json
 */
function deepMergeSettings(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = {...target}

  for (const key of Object.keys(source)) {
    // Skip comment fields
    if (key.startsWith('$') || key.startsWith('_')) {
      continue
    }

    const sourceValue = source[key]
    const targetValue = result[key]

    if (key === 'hooks' && typeof sourceValue === 'object' && sourceValue !== null) {
      // Special handling for hooks - merge by event type
      result[key] = mergeHooks(
        (targetValue as Record<string, unknown[]>) || {},
        sourceValue as Record<string, unknown[]>,
      )
    } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      // Concatenate arrays
      result[key] = [...targetValue, ...sourceValue]
    } else if (typeof sourceValue === 'object' && sourceValue !== null && typeof targetValue === 'object' && targetValue !== null) {
      // Recursively merge objects
      result[key] = deepMergeSettings(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>)
    } else {
      // Override with source value
      result[key] = sourceValue
    }
  }

  return result
}

/**
 * Merge hook configurations, combining arrays for each event type.
 */
function mergeHooks(
  target: Record<string, unknown[]>,
  source: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {...target}

  for (const eventType of Object.keys(source)) {
    const targetHooks = result[eventType]
    const sourceHooks = source[eventType]

    if (targetHooks && sourceHooks) {
      // Append source hooks to existing event type
      result[eventType] = [...targetHooks, ...sourceHooks]
    } else if (sourceHooks) {
      // New event type
      result[eventType] = sourceHooks
    }
  }

  return result
}

/**
 * Merge settings from a source settings.json file into the IDE settings file.
 * Reads from the provided source path and merges into .claude/settings.json at project root.
 *
 * @param targetDir - Project root directory
 * @param sourceSettingsPath - Absolute path to source settings.json file
 * @returns true if merge successful, false otherwise
 */
async function mergeSharedSettingsFromSource(targetDir: string, sourceSettingsPath: string): Promise<boolean> {
  const resolver = new IdePathResolver(targetDir)
  const ideSettingsPath = resolver.getClaudeSettings()

  // Check if source settings exists
  if (!(await pathExists(sourceSettingsPath))) {
    return false
  }

  try {
    // Read source settings
    const sourceContent = await fs.readFile(sourceSettingsPath, 'utf8')
    const sourceSettings = JSON.parse(sourceContent) as Record<string, unknown>

    // Read IDE settings (create empty object if doesn't exist)
    let ideSettings: Record<string, unknown> = {}
    if (await pathExists(ideSettingsPath)) {
      const ideContent = await fs.readFile(ideSettingsPath, 'utf8')
      ideSettings = JSON.parse(ideContent) as Record<string, unknown>
    } else {
      // Create .claude directory if it doesn't exist
      await fs.mkdir(dirname(ideSettingsPath), {recursive: true})
    }

    // Merge source settings into IDE settings
    const mergedSettings = deepMergeSettings(ideSettings, sourceSettings)

    // Write merged settings back
    await fs.writeFile(ideSettingsPath, JSON.stringify(mergedSettings, null, 4) + '\n', 'utf8')

    return true
  } catch {
    // Silently fail on parse/write errors
    return false
  }
}

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
  /** Number of files that were merged into existing folders */
  mergedFileCount: number
  /** List of folder names that had content merged */
  mergedFolders: string[]
  /** Whether shared settings were merged into IDE settings */
  sharedSettingsMerged: boolean
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
const EXCLUDED_PATTERNS = [
  '_output',
  '__pycache__',
  '.pytest_cache',
  'conftest.py',
  /^test_.*\.py$/,
  /.*\.pyc$/,
]

/**
 * Check if a filename should be excluded from copying
 */
function shouldExclude(name: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => {
    if (typeof pattern === 'string') {
      return name === pattern
    }

    return pattern.test(name)
  })
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
  const skippedFolders: string[] = []
  const mergedFolders: string[] = []
  let mergedFileCount = 0

  // Create .aiwcli container folder for method-specific files
  const resolver = new IdePathResolver(targetDir)
  const containerDir = resolver.getAiwcliContainer()
  await fs.mkdir(containerDir, {recursive: true})

  // Install non-dot folders into .aiwcli/ container (skip if already exist and skipExisting is true)
  const nonDotInstalls = nonDotFolders.map(async (folder) => {
    const srcPath = join(templatePath, folder)
    // Destination is inside .aiwcli/ container
    const destPath = join(containerDir, folder)

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

  // Install root-level _shared directory (shared across all templates)
  // This is at templates/_shared, not inside the specific template directory
  // Exclude IDE config folders (.claude, .windsurf) - they are used for settings merging only
  const templatesRoot = dirname(templatePath)
  const rootSharedSrc = join(templatesRoot, '_shared')
  const rootSharedDest = join(containerDir, '_shared')

  if (await pathExists(rootSharedSrc)) {
    if (skipExisting && (await pathExists(rootSharedDest))) {
      skippedFolders.push('_shared')
    } else {
      await copyDir(rootSharedSrc, rootSharedDest, true) // excludeIdeFolders = true
      installedFolders.push('_shared')
    }
  }

  // Install matching IDE folders
  // If folder exists, merge content recursively by looking for method name folders
  const ideInstalls = ides.map(async (ide) => {
    const folderName = dotFolders.get(ide)
    if (folderName) {
      const srcPath = join(templatePath, folderName)
      const destPath = resolver.getIdeDir(ide)

      if (await pathExists(destPath)) {
        if (skipExisting) {
          // Folder exists - merge template content by finding method-named folders
          const mergeResult = await mergeTemplateContent(srcPath, destPath, templateName)
          return {
            folder: folderName,
            skipped: false,
            merged: true,
            mergedFiles: mergeResult.copiedFiles.length,
          }
        }

        // skipExisting is false, so overwrite
        await copyDir(srcPath, destPath)
        return {folder: folderName, skipped: false, merged: false, mergedFiles: 0}
      }

      await copyDir(srcPath, destPath)
      return {folder: folderName, skipped: false, merged: false, mergedFiles: 0}
    }

    return null
  })

  const ideResults = (await Promise.all(ideInstalls)).filter(
    (result): result is {folder: string; merged: boolean; mergedFiles: number; skipped: boolean} => result !== null,
  )
  for (const result of ideResults) {
    if (result.merged) {
      mergedFolders.push(result.folder)
      mergedFileCount += result.mergedFiles
    } else if (result.skipped) {
      skippedFolders.push(result.folder)
    } else {
      installedFolders.push(result.folder)
    }
  }

  // Settings merging is now handled by the caller via mergeMethodsSettings()
  // This allows unified merging of _shared + method-specific settings

  return {
    installedFolders,
    skippedFolders,
    mergedFolders,
    mergedFileCount,
    sharedSettingsMerged: false, // Deprecated, kept for backwards compatibility
    templatePath,
  }
}
