import {promises as fs} from 'node:fs'
import {join} from 'node:path'

/**
 * Content folder types that should be recursively merged rather than skipped.
 * These are the canonical folder names used in templates for organizing content.
 */
export const CONTENT_FOLDER_TYPES = ['agents', 'commands', 'workflows', 'tasks'] as const

/**
 * Result of merging content folders
 */
export interface MergeResult {
  /** Files that were copied */
  copiedFiles: string[]
  /** Directories that were created */
  createdDirs: string[]
  /** Files that were skipped (already exist) */
  skippedFiles: string[]
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
 * Recursively find folders matching the method name within a directory tree.
 * This finds folders like `.claude/commands/bmad/` when methodName is 'bmad'.
 *
 * @param dir - Directory to search
 * @param methodName - Method name to look for (e.g., 'bmad', 'gsd')
 * @returns Array of paths to matching folders
 */
export async function findMethodFolders(dir: string, methodName: string): Promise<string[]> {
  const results: string[] = []

  async function scan(currentDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentDir, {withFileTypes: true})
      const directories = entries.filter((entry) => entry.isDirectory())

      // Process all directories in parallel
      await Promise.all(
        directories.map(async (entry) => {
          const entryPath = join(currentDir, entry.name)

          if (entry.name === methodName) {
            results.push(entryPath)
          }

          // Recursively scan subdirectories
          await scan(entryPath)
        }),
      )
    } catch {
      // Ignore errors (permission issues, etc.)
    }
  }

  await scan(dir)
  return results
}

/**
 * Recursively merge a source directory into a target directory.
 * Only copies files that don't already exist in the target.
 * Creates directories as needed.
 *
 * @param srcDir - Source directory to copy from
 * @param destDir - Destination directory to copy to
 * @param result - Accumulator for merge results
 */
async function mergeDirectory(srcDir: string, destDir: string, result: MergeResult): Promise<void> {
  // Create destination directory if it doesn't exist
  if (!(await pathExists(destDir))) {
    await fs.mkdir(destDir, {recursive: true})
    result.createdDirs.push(destDir)
  }

  const entries = await fs.readdir(srcDir, {withFileTypes: true})

  // Process all entries in parallel
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)

      if (entry.isDirectory()) {
        // Recursively merge subdirectories
        await mergeDirectory(srcPath, destPath, result)
        return
      }

      // Copy file if it doesn't exist
      const exists = await pathExists(destPath)
      if (exists) {
        result.skippedFiles.push(destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
        result.copiedFiles.push(destPath)
      }
    }),
  )
}

/**
 * Merge template content into an existing IDE folder.
 * Recursively finds folders matching the method name and merges their content.
 *
 * This enables adding new agents, commands, workflows, and tasks from a template
 * even when the IDE folder (e.g., .claude) already exists.
 *
 * @param templateIdePath - Path to the template's IDE folder (e.g., template/.claude)
 * @param targetIdePath - Path to the target's IDE folder (e.g., project/.claude)
 * @param methodName - Method name to look for (e.g., 'bmad', 'gsd')
 * @returns Merge results
 */
export async function mergeTemplateContent(
  templateIdePath: string,
  targetIdePath: string,
  methodName: string,
): Promise<MergeResult> {
  const result: MergeResult = {
    copiedFiles: [],
    createdDirs: [],
    skippedFiles: [],
  }

  // First, copy root-level files from the template IDE folder (e.g., settings.json)
  // These are files directly in .claude/ that aren't in method-specific subfolders
  try {
    const entries = await fs.readdir(templateIdePath, {withFileTypes: true})
    const rootFiles = entries.filter((entry) => entry.isFile())

    await Promise.all(
      rootFiles.map(async (file) => {
        const srcPath = join(templateIdePath, file.name)
        const destPath = join(targetIdePath, file.name)

        // Only copy if it doesn't exist (skip existing behavior)
        const exists = await pathExists(destPath)
        if (exists) {
          result.skippedFiles.push(destPath)
        } else {
          await fs.copyFile(srcPath, destPath)
          result.copiedFiles.push(destPath)
        }
      }),
    )
  } catch {
    // Ignore errors (permission issues, missing directory, etc.)
  }

  // Find all folders matching the method name in the template
  const methodFolders = await findMethodFolders(templateIdePath, methodName)

  // Merge all method folders in parallel
  await Promise.all(
    methodFolders.map(async (srcMethodFolder) => {
      // Calculate the relative path from the template IDE folder
      const relativePath = srcMethodFolder.slice(templateIdePath.length)
      const destMethodFolder = join(targetIdePath, relativePath)

      // Merge this method folder into the target
      await mergeDirectory(srcMethodFolder, destMethodFolder, result)
    }),
  )

  return result
}

/**
 * Merge content type folders (agents, commands, workflows, tasks) from template to target.
 * This is an alternative approach that looks for specific folder types rather than method names.
 *
 * @param templateIdePath - Path to the template's IDE folder
 * @param targetIdePath - Path to the target's IDE folder
 * @returns Merge results
 */
export async function mergeContentTypeFolders(
  templateIdePath: string,
  targetIdePath: string,
): Promise<MergeResult> {
  const result: MergeResult = {
    copiedFiles: [],
    createdDirs: [],
    skippedFiles: [],
  }

  async function scanAndMerge(srcDir: string, destDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(srcDir, {withFileTypes: true})
      const directories = entries.filter((entry) => entry.isDirectory())

      // Process all directories in parallel
      await Promise.all(
        directories.map(async (entry) => {
          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)

          // Check if this is a content type folder
          const isContentType = CONTENT_FOLDER_TYPES.includes(entry.name as (typeof CONTENT_FOLDER_TYPES)[number])

          // Merge content folders, recursively scan other directories
          await (isContentType ? mergeDirectory(srcPath, destPath, result) : scanAndMerge(srcPath, destPath))
        }),
      )
    } catch {
      // Ignore errors
    }
  }

  await scanAndMerge(templateIdePath, targetIdePath)
  return result
}
