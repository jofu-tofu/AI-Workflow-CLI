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
 * Result of template installation
 */
export interface InstallationResult {
  /** List of folder names that were installed (for gitignore) */
  installedFolders: string[]
  /** Absolute path to the template that was installed */
  templatePath: string
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
 *
 * Template structure:
 * - Non-dot folders (e.g., _bmad/, GSR/) are always installed
 * - Dot folders (e.g., .claude/, .windsurf/) are installed only if matching IDE flag
 *
 * @param config - Installation configuration
 * @returns Installation result with list of installed folders
 * @throws Error if template doesn't exist or requested IDE folder not found
 */
export async function installTemplate(config: TemplateInstallConfig): Promise<InstallationResult> {
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

  // Install all non-dot folders
  const nonDotInstalls = nonDotFolders.map(async (folder) => {
    const srcPath = join(templatePath, folder)
    const destPath = join(targetDir, folder)
    await copyDir(srcPath, destPath)
    return folder
  })

  const installedNonDotFolders = await Promise.all(nonDotInstalls)
  installedFolders.push(...installedNonDotFolders)

  // Install only matching IDE folders
  const ideInstalls = ides.map(async (ide) => {
    const folderName = dotFolders.get(ide)
    if (folderName) {
      const srcPath = join(templatePath, folderName)
      const destPath = join(targetDir, folderName)
      await copyDir(srcPath, destPath)
      return folderName
    }

    return null
  })

  const installedIdeFolders = (await Promise.all(ideInstalls)).filter((folder): folder is string => folder !== null)
  installedFolders.push(...installedIdeFolders)

  return {
    installedFolders,
    templatePath,
  }
}
