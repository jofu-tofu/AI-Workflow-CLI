import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {computeGitignoreRemovals, pruneGitignoreStaleEntries, removeGitignoreEntries} from '../lib/gitignore-manager.js'
import {pathExists} from '../lib/paths.js'
import {reconstructIdeSettings} from '../lib/template-settings-reconstructor.js'
import {EXIT_CODES} from '../types/exit-codes.js'

/**
 * Container folder for method-specific files
 * This keeps template infrastructure separate from IDE config
 */
const AIWCLI_CONTAINER = '.aiwcli'

/**
 * The output folder name that contains method subdirectories.
 * Structure: .aiwcli/_output/{method}/ (e.g., .aiwcli/_output/bmad/, .aiwcli/_output/gsd/)
 */
const OUTPUT_FOLDER_NAME = '_output'

/**
 * IDE configuration folder names and settings file locations.
 * Method subfolders are discovered dynamically via disk scanning.
 */
const IDE_FOLDERS = {
  claude: {
    root: '.claude',
    settingsFile: 'settings.json',
  },
  windsurf: {
    root: '.windsurf',
    settingsFile: 'hooks.json',
  },
}

/**
 * Get the set of installed method names by combining the settings.json registry
 * with disk scan of .aiwcli/_* directories.
 *
 * @param targetDir - Directory containing the .aiwcli container
 * @returns Set of method names (e.g., 'cc-native', 'bmad')
 */
async function getInstalledMethodNames(targetDir: string): Promise<Set<string>> {
  const methods = new Set<string>()

  // Source 1: settings.json methods registry
  for (const ide of Object.values(IDE_FOLDERS)) {
    const settingsPath = join(targetDir, ide.root, ide.settingsFile)
    try {
      const content = await fs.readFile(settingsPath, 'utf8')
      const settings = JSON.parse(content)
      if (settings.methods && typeof settings.methods === 'object') {
        for (const method of Object.keys(settings.methods)) {
          methods.add(method)
        }
      }
    } catch {
      // Settings file doesn't exist or can't be parsed
    }
  }

  // Source 2: disk scan of .aiwcli/_* directories
  const containerDir = join(targetDir, AIWCLI_CONTAINER)
  try {
    const entries = await fs.readdir(containerDir, {withFileTypes: true})
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('_') && entry.name !== OUTPUT_FOLDER_NAME) {
        methods.add(entry.name.slice(1)) // strip leading underscore
      }
    }
  } catch {
    // Container doesn't exist
  }

  return methods
}

/**
 * Check if a directory is empty.
 *
 * @param dir - Directory to check
 * @returns True if directory is empty or doesn't exist
 */
async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * Check if a JSON settings file is empty or effectively empty.
 * Returns true if the file doesn't exist, can't be parsed, or contains an empty object.
 *
 * @param filePath - Path to the JSON settings file
 * @returns True if file is empty or doesn't exist
 */
async function isSettingsFileEmpty(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const trimmed = content.trim()
    if (trimmed === '' || trimmed === '{}') {
      return true
    }

    const parsed = JSON.parse(content)
    // Check if it's an empty object
    return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0
  } catch {
    // File doesn't exist or can't be parsed - consider it empty
    return true
  }
}

/**
 * Check if an IDE folder should be fully deleted.
 * Returns true if:
 * 1. The settings file is empty (or doesn't exist)
 * 2. All subdirectories are empty (or don't exist)
 * Backup files (e.g., settings.json.backup) are ignored.
 *
 * @param targetDir - Directory containing the IDE folder
 * @param ideFolder - IDE folder configuration
 * @param ideFolder.root - Root folder name (e.g., '.claude')
 * @param ideFolder.settingsFile - Settings file name (e.g., 'settings.json')
 * @returns True if the IDE folder should be fully deleted
 */
async function shouldDeleteIdeFolder(
  targetDir: string,
  ideFolder: {root: string; settingsFile: string},
): Promise<boolean> {
  const ideFolderPath = join(targetDir, ideFolder.root)

  // Check if IDE folder exists at all
  try {
    const stat = await fs.stat(ideFolderPath)
    if (!stat.isDirectory()) {
      return false
    }
  } catch {
    // Folder doesn't exist - nothing to delete
    return false
  }

  // Check if settings file is empty
  const settingsPath = join(ideFolderPath, ideFolder.settingsFile)
  const settingsEmpty = await isSettingsFileEmpty(settingsPath)
  if (!settingsEmpty) {
    return false
  }

  // Check the IDE folder itself - ignore backup files and check for other meaningful content
  try {
    const entries = await fs.readdir(ideFolderPath)
    // Filter entries to check (skip backup files and settings file)
    const entriesToCheck = entries.filter((entry) => {
      if (entry.endsWith('.backup')) return false
      if (entry === ideFolder.settingsFile) return false
      return true
    })

    // Check all entries in parallel
    const entryResults = await Promise.all(
      entriesToCheck.map(async (entry) => {
        const entryPath = join(ideFolderPath, entry)
        try {
          const stat = await fs.stat(entryPath)
          if (stat.isDirectory()) {
            return isDirectoryEmpty(entryPath)
          }

          // Non-backup file exists - don't delete the folder
          return false
        } catch {
          // Can't stat entry - be safe and don't delete
          return false
        }
      }),
    )

    // If any entry is not empty (or is a non-backup file), don't delete
    if (entryResults.some((result) => !result)) {
      return false
    }
  } catch {
    return false
  }

  return true
}

/**
 * Remove a directory recursively.
 *
 * @param dir - Directory to remove
 */
async function removeDirectory(dir: string): Promise<void> {
  await fs.rm(dir, {force: true, recursive: true})
}

/**
 * Clear workflow folders, output folders, IDE method folders, and update configurations.
 */
export default class ClearCommand extends BaseCommand {
  static override description =
    'Clear workflow folders, output folders, IDE method folders (.claude/.windsurf), and update configurations'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --template cc-native',
    '<%= config.bin %> <%= command.id %> -t cc-native',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --force',
    '<%= config.bin %> <%= command.id %> --output',
    '<%= config.bin %> <%= command.id %> --output --dry-run',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    'dry-run': Flags.boolean({
      char: 'n',
      description: 'Show what would be deleted without actually deleting',
      default: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
    output: Flags.boolean({
      char: 'o',
      description: 'Clean runtime output artifacts (temp files, caches, log rotation, archives)',
      default: false,
      exclusive: ['template'],
    }),
    template: Flags.string({
      char: 't',
      description: 'Clear only a specific template (e.g., cc-native)',
      exclusive: ['output'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ClearCommand)
    const targetDir = process.cwd()

    // Handle --output flag separately (mutually exclusive with --template)
    if (flags.output) {
      await this.cleanRuntimeOutput(targetDir, flags)
      return
    }

    try {
      // Find all folders to clear
      const workflowFolders = await this.findWorkflowFolders(targetDir, flags.template)
      const outputMethodFolders = await this.findOutputFolders(targetDir, flags.template)
      const ideMethodFolders = await this.findIdeMethodFolders(targetDir, flags.template)

      // Nothing to clear
      if (workflowFolders.length === 0 && outputMethodFolders.length === 0 && ideMethodFolders.length === 0) {
        const msg = flags.template
          ? `No folders found for template '${flags.template}'.`
          : 'No workflow, output, or IDE method folders found.'
        this.logInfo(msg)
        return
      }

      // Show what will be deleted
      this.log('')

      // Workflow folders (.aiwcli/_{method}/) - will be deleted entirely
      if (workflowFolders.length > 0) {
        this.logInfo(`Workflow folders to remove (${workflowFolders.length}):`)
        for (const folder of workflowFolders) {
          const folderName = folder.replace(targetDir + '\\', '').replace(targetDir + '/', '')
          this.log(`  ${folderName}/`)
        }

        this.log('')
      }

      // Output folders (_output/{method}/) - will be deleted
      if (outputMethodFolders.length > 0) {
        this.logInfo(`Output folders to remove (${outputMethodFolders.length}):`)
        for (const folder of outputMethodFolders) {
          const folderName = folder.replace(targetDir + '\\', '').replace(targetDir + '/', '')
          this.log(`  ${folderName}/`)
        }

        this.log('')
      }

      // IDE method folders (.claude/commands/{method}/, .windsurf/workflows/{method}/, etc.)
      if (ideMethodFolders.length > 0) {
        this.logInfo(`IDE method folders to remove (${ideMethodFolders.length}):`)
        for (const folder of ideMethodFolders) {
          const folderName = folder.replace(targetDir + '\\', '').replace(targetDir + '/', '')
          this.log(`  ${folderName}/`)
        }

        this.log('')
      }

      // Extract method names for settings.json updates
      const methodsToRemove = this.extractMethodNames(workflowFolders)
      if (methodsToRemove.length > 0) {
        this.logInfo(`Will update settings files to remove method entries: ${methodsToRemove.join(', ')}`)
        this.log('')
      }

      // Check if _output will be empty after clearing
      const containerDir = join(targetDir, AIWCLI_CONTAINER)
      const outputDir = join(containerDir, OUTPUT_FOLDER_NAME)
      const allMethodFolders = await this.findOutputFolders(targetDir)
      const willOutputBeEmpty =
        allMethodFolders.length > 0 && allMethodFolders.length === outputMethodFolders.length

      if (willOutputBeEmpty) {
        this.logInfo(`${AIWCLI_CONTAINER}/${OUTPUT_FOLDER_NAME}/ folder will be removed (will be empty)`)
        this.log('')
      }

      // Check if IDE folders might be removed after clearing
      // This happens when settings.json becomes empty and all subfolders are empty
      const checkIdeRemoval = async (ideFolder: typeof IDE_FOLDERS.claude): Promise<boolean> => {
        const idePath = join(targetDir, ideFolder.root)
        // Check if IDE folder exists
        try {
          const stat = await fs.stat(idePath)
          if (!stat.isDirectory()) return false
        } catch {
          return false
        }

        // Scan all subdirectories to count method folders vs folders being deleted
        let totalMethodFolders = 0
        let foldersBeingDeleted = 0
        try {
          const topEntries = await fs.readdir(idePath, {withFileTypes: true})
          const subdirs = topEntries.filter((e) => e.isDirectory())

          // Check each subdirectory for method folders
          const subResults = await Promise.all(
            subdirs.map(async (subdir) => {
              const subdirPath = join(idePath, subdir.name)
              try {
                const entries = await fs.readdir(subdirPath, {withFileTypes: true})
                const methodDirs = entries.filter((e) => e.isDirectory())
                const deleted = methodDirs.filter((entry) => {
                  const fullPath = join(subdirPath, entry.name)
                  return ideMethodFolders.includes(fullPath)
                }).length
                return {deleted, total: methodDirs.length}
              } catch {
                return {deleted: 0, total: 0}
              }
            }),
          )
          for (const r of subResults) {
            totalMethodFolders += r.total
            foldersBeingDeleted += r.deleted
          }
        } catch {
          return false
        }

        // If all method folders are being deleted, check if settings would be empty
        if (totalMethodFolders > 0 && totalMethodFolders === foldersBeingDeleted) {
          // Check if settings file would become empty after removing methods
          const settingsPath = join(idePath, ideFolder.settingsFile)
          try {
            const content = await fs.readFile(settingsPath, 'utf8')
            const settings = JSON.parse(content)
            // Remove method entries from methods tracking object
            if (settings.methods && typeof settings.methods === 'object') {
              for (const method of methodsToRemove) {
                if (method in settings.methods) {
                  delete settings.methods[method]
                }
              }

              // Remove methods object if empty
              if (Object.keys(settings.methods).length === 0) {
                delete settings.methods
              }
            }

            // Remove hooks that would be empty
            if (settings.hooks && typeof settings.hooks === 'object') {
              // Simplified check - if hooks only contains method-related entries
              delete settings.hooks
            }

            return Object.keys(settings).length === 0
          } catch {
            // Settings file doesn't exist or is invalid - would be considered empty
            return true
          }
        }

        return false
      }

      const [willClaudeFolderBeEmpty, willWindsurfFolderBeEmpty] = await Promise.all([
        checkIdeRemoval(IDE_FOLDERS.claude),
        checkIdeRemoval(IDE_FOLDERS.windsurf),
      ])

      if (willClaudeFolderBeEmpty) {
        this.logInfo(`${IDE_FOLDERS.claude.root}/ folder will be removed (will be empty)`)
        this.log('')
      }

      if (willWindsurfFolderBeEmpty) {
        this.logInfo(`${IDE_FOLDERS.windsurf.root}/ folder will be removed (will be empty)`)
        this.log('')
      }

      // Compute gitignore changes for dry-run display
      const gitignoreSimulation = await computeGitignoreRemovals(targetDir)
      if (gitignoreSimulation.toRemove.length > 0 || gitignoreSimulation.toKeep.length > 0) {
        this.logInfo('Gitignore changes:')
        for (const {entry, reason} of gitignoreSimulation.toKeep) {
          this.log(`  keep ${entry}/ (${reason})`)
        }

        for (const entry of gitignoreSimulation.toRemove) {
          this.log(`  remove ${entry}/`)
        }

        this.log('')
      }

      // Dry run - just show what would happen
      if (flags['dry-run']) {
        this.logInfo('Dry run complete. No files or folders were deleted.')
        return
      }

      // Calculate total items for confirmation
      const totalFolders = workflowFolders.length + outputMethodFolders.length + ideMethodFolders.length

      // Confirm deletion
      if (!flags.force) {
        const shouldDelete = await confirm({
          message: `Delete ${totalFolders} folder(s)?`,
          default: false,
        })

        if (!shouldDelete) {
          this.log('Operation cancelled.')
          return
        }
      }

      // Delete all folders in parallel
      const deleteFolder = async (
        folder: string,
        type: string,
      ): Promise<{folder: string; success: boolean; type: string}> => {
        try {
          await removeDirectory(folder)
          this.logDebug(`Removed ${type} folder: ${folder}`)
          return {folder, success: true, type}
        } catch (error) {
          const err = error as NodeJS.ErrnoException
          this.logWarning(`Failed to delete ${folder}: ${err.message}`)
          return {folder, success: false, type}
        }
      }

      const deleteResults = await Promise.all([
        ...workflowFolders.map((f) => deleteFolder(f, 'workflow')),
        ...outputMethodFolders.map((f) => deleteFolder(f, 'output')),
        ...ideMethodFolders.map((f) => deleteFolder(f, 'IDE method')),
      ])

      const deletedWorkflow = deleteResults.filter((r) => r.success && r.type === 'workflow').length
      const deletedOutput = deleteResults.filter((r) => r.success && r.type === 'output').length
      const deletedIde = deleteResults.filter((r) => r.success && r.type === 'IDE method').length

      // Check if _output folder is now empty and remove it
      let removedOutputDir = false
      try {
        if (await isDirectoryEmpty(outputDir)) {
          await removeDirectory(outputDir)
          this.logDebug(`Removed empty ${AIWCLI_CONTAINER}/${OUTPUT_FOLDER_NAME}/ folder`)
          removedOutputDir = true
        }
      } catch {
        // _output doesn't exist or can't be accessed
      }

      // Check if .aiwcli container is now empty and remove it
      let removedAiwcliContainer = false
      try {
        if (await isDirectoryEmpty(containerDir)) {
          await removeDirectory(containerDir)
          this.logDebug(`Removed empty ${AIWCLI_CONTAINER}/ folder`)
          removedAiwcliContainer = true
        }
      } catch {
        // .aiwcli doesn't exist or can't be accessed
      }

      // Smart gitignore removal: compute what should be removed based on disk state
      const {toRemove, toKeep} = await computeGitignoreRemovals(targetDir)

      for (const {entry, reason} of toKeep) {
        this.logDebug(`Keeping ${entry}/ in .gitignore (${reason})`)
      }

      if (toRemove.length > 0) {
        await removeGitignoreEntries(targetDir, toRemove)
        this.logDebug(`Removed from .gitignore: ${toRemove.join(', ')}`)
      }

      // Prune stale gitignore entries as safety net
      const pruned = await pruneGitignoreStaleEntries(targetDir)
      if (pruned) {
        this.logDebug('Pruned stale .gitignore entries')
      }

      // Reconstruct IDE settings from remaining templates
      let updatedClaudeSettings = false
      let updatedWindsurfSettings = false
      if (methodsToRemove.length > 0) {
        // Remove method entries from settings files first
        await this.removeMethodEntries(targetDir, methodsToRemove)

        // Get remaining installed methods
        const allMethods = await getInstalledMethodNames(targetDir)
        // Filter out methods being removed (in case disk scan still finds them)
        const remainingTemplates = [...allMethods].filter(m => !methodsToRemove.includes(m))

        // Determine which IDEs need reconstruction
        const ides: string[] = []
        if (await pathExists(join(targetDir, IDE_FOLDERS.claude.root))) {
          ides.push('claude')
        }

        if (await pathExists(join(targetDir, IDE_FOLDERS.windsurf.root))) {
          ides.push('windsurf')
        }

        if (ides.length > 0) {
          await reconstructIdeSettings(targetDir, remainingTemplates, ides)
          if (ides.includes('claude')) {
            this.logDebug('Reconstructed .claude/settings.json (backup created)')
            updatedClaudeSettings = true
          }

          if (ides.includes('windsurf')) {
            this.logDebug('Reconstructed .windsurf/hooks.json (backup created)')
            updatedWindsurfSettings = true
          }
        }
      }

      // Check if IDE folders should be fully deleted (empty settings + empty subfolders)
      let removedClaudeDir = false
      let removedWindsurfDir = false

      if (await shouldDeleteIdeFolder(targetDir, IDE_FOLDERS.claude)) {
        const claudeDirPath = join(targetDir, IDE_FOLDERS.claude.root)
        try {
          await removeDirectory(claudeDirPath)
          this.logDebug(`Removed empty ${IDE_FOLDERS.claude.root}/ folder`)
          removedClaudeDir = true
          // If we deleted the whole folder, the settings update message is misleading
          updatedClaudeSettings = false
        } catch {
          // Folder can't be removed
        }
      }

      if (await shouldDeleteIdeFolder(targetDir, IDE_FOLDERS.windsurf)) {
        const windsurfDirPath = join(targetDir, IDE_FOLDERS.windsurf.root)
        try {
          await removeDirectory(windsurfDirPath)
          this.logDebug(`Removed empty ${IDE_FOLDERS.windsurf.root}/ folder`)
          removedWindsurfDir = true
          // If we deleted the whole folder, the settings update message is misleading
          updatedWindsurfSettings = false
        } catch {
          // Folder can't be removed
        }
      }

      // Report results
      this.log('')
      const parts: string[] = []
      if (deletedWorkflow > 0) {
        parts.push(`${deletedWorkflow} workflow folder(s)`)
      }

      if (deletedOutput > 0) {
        parts.push(`${deletedOutput} output folder(s)`)
      }

      if (deletedIde > 0) {
        parts.push(`${deletedIde} IDE method folder(s)`)
      }

      if (removedOutputDir) {
        parts.push(`${AIWCLI_CONTAINER}/${OUTPUT_FOLDER_NAME}/ folder`)
      }

      if (removedAiwcliContainer) {
        parts.push(`${AIWCLI_CONTAINER}/ folder`)
      }

      if (removedClaudeDir) {
        parts.push(`${IDE_FOLDERS.claude.root}/ folder`)
      }

      if (removedWindsurfDir) {
        parts.push(`${IDE_FOLDERS.windsurf.root}/ folder`)
      }

      this.logSuccess(`Cleared: ${parts.join(', ')}.`)

      if (toRemove.length > 0 || pruned) {
        this.logSuccess('Updated .gitignore.')
      }

      if (updatedClaudeSettings) {
        this.logSuccess('Updated .claude/settings.json (backup: settings.json.backup).')
      }

      if (updatedWindsurfSettings) {
        this.logSuccess('Updated .windsurf/hooks.json (backup: hooks.json.backup).')
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException

      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied. ${err.message}`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      this.error(`Clear failed: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }
  }

  /**
   * Clean runtime output artifacts from _output/ at project root.
   * Handles temp files, cache files, log rotation, and archive cleanup.
   *
   * @param targetDir - Project root directory
   * @param flags - Command flags (dry-run, force)
   */
  private async cleanRuntimeOutput(
    targetDir: string,
    flags: {'dry-run': boolean; force: boolean},
  ): Promise<void> {
    const outputDir = join(targetDir, '_output')

    if (!(await pathExists(outputDir))) {
      this.logInfo('No _output/ directory found.')
      return
    }

    const toDelete: {path: string; reason: string}[] = []
    let logAction: null | {path: string; sizeBytes: number} = null
    let archiveDir: null | string = null
    let archiveCount = 0

    try {
      const entries = await fs.readdir(outputDir, {withFileTypes: true})

      for (const entry of entries) {
        const entryPath = join(outputDir, entry.name)

        // Temp files: .index_*.tmp (orphaned atomic write files)
        if (entry.isFile() && entry.name.startsWith('.index_') && entry.name.endsWith('.tmp')) {
          toDelete.push({path: entryPath, reason: 'temp file'})
          continue
        }

        // Cache files: .*-cache.json
        if (entry.isFile() && entry.name.startsWith('.') && entry.name.endsWith('-cache.json')) {
          toDelete.push({path: entryPath, reason: 'cache file'})
          continue
        }

        // Log rotation: hook-log.jsonl > 1MB
        if (entry.isFile() && entry.name === 'hook-log.jsonl') {
          try {
            const stat = await fs.stat(entryPath)
            if (stat.size > 1_048_576) {
              logAction = {path: entryPath, sizeBytes: stat.size}
            }
          } catch {
            // Can't stat log file
          }

          continue
        }

        // Archive cleanup: contexts/_archive/
        if (entry.isDirectory() && entry.name === 'contexts') {
          const archivePath = join(entryPath, '_archive')
          try {
            const archiveEntries = await fs.readdir(archivePath)
            if (archiveEntries.length > 0) {
              archiveDir = archivePath
              archiveCount = archiveEntries.length
            }
          } catch {
            // No archive directory
          }
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      this.error(`Cannot read _output/: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }

    // Nothing to clean
    if (toDelete.length === 0 && !logAction && !archiveDir) {
      this.logInfo('No runtime output artifacts to clean.')
      return
    }

    // Show what will be cleaned
    this.log('')
    this.logInfo('Runtime output cleanup:')

    if (toDelete.length > 0) {
      for (const item of toDelete) {
        const relativePath = item.path.replace(targetDir + '\\', '').replace(targetDir + '/', '')
        this.log(`  ${relativePath} (${item.reason})`)
      }
    }

    if (logAction) {
      const sizeMB = (logAction.sizeBytes / 1_048_576).toFixed(1)
      this.log(`  _output/hook-log.jsonl (${sizeMB}MB → truncate to ~512KB)`)
    }

    if (archiveDir) {
      this.log(`  _output/contexts/_archive/ (${archiveCount} archived context(s))`)
    }

    this.log('')

    // Dry run
    if (flags['dry-run']) {
      this.logInfo('Dry run complete. No files were modified.')
      return
    }

    // Confirm archive deletion (unless --force)
    if (archiveDir && !flags.force) {
      const shouldDelete = await confirm({
        message: `Delete ${archiveCount} archived context(s)?`,
        default: false,
      })

      if (!shouldDelete) {
        archiveDir = null
        archiveCount = 0
      }
    }

    // Execute deletions
    let deletedCount = 0
    for (const item of toDelete) {
      try {
        await fs.unlink(item.path)
        deletedCount++
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        this.logWarning(`Failed to delete ${item.path}: ${err.message}`)
      }
    }

    // Log rotation
    if (logAction) {
      try {
        const content = await fs.readFile(logAction.path, 'utf8')
        // Keep the most recent 512KB
        const truncated = content.slice(-524_288)
        // Find the first complete line
        const firstNewline = truncated.indexOf('\n')
        const cleaned = firstNewline === -1 ? truncated : truncated.slice(firstNewline + 1)
        await fs.writeFile(logAction.path, cleaned, 'utf8')
        this.logDebug('Rotated hook-log.jsonl')
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        this.logWarning(`Failed to rotate log: ${err.message}`)
      }
    }

    // Archive cleanup
    let archivedCleaned = 0
    if (archiveDir) {
      try {
        const archiveEntries = await fs.readdir(archiveDir)
        await Promise.all(
          archiveEntries.map(async (entry) => {
            try {
              await fs.rm(join(archiveDir!, entry), {force: true, recursive: true})
              archivedCleaned++
            } catch {
              // Individual entry failed
            }
          }),
        )
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        this.logWarning(`Failed to clean archive: ${err.message}`)
      }
    }

    // Summary
    this.log('')
    const parts: string[] = []
    if (deletedCount > 0) {
      parts.push(`${deletedCount} file(s) removed`)
    }

    if (logAction) {
      parts.push('log rotated')
    }

    if (archivedCleaned > 0) {
      parts.push(`${archivedCleaned} archived context(s) removed`)
    }

    if (parts.length > 0) {
      this.logSuccess(`Output cleanup: ${parts.join(', ')}.`)
    } else {
      this.logInfo('No changes made.')
    }
  }

  /**
   * Extract method names from workflow folder names (e.g., _gsd -> gsd).
   *
   * @param workflowFolders - Array of workflow folder paths
   * @returns Array of method names
   */
  private extractMethodNames(workflowFolders: string[]): string[] {
    const methods: string[] = []
    for (const folder of workflowFolders) {
      const folderName = folder.split(/[/\\]/).pop() || ''
      if (folderName.startsWith('_')) {
        methods.push(folderName.slice(1))
      }
    }

    return methods
  }

  /**
   * Find all IDE method folders by scanning subdirectories of each IDE root
   * for children matching installed method names.
   *
   * For example, finds .claude/commands/cc-native/, .claude/skills/cc-native/,
   * .windsurf/workflows/cc-native/ — without hardcoding which subdirectories exist.
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by
   * @returns Array of IDE method folder paths
   */
  private async findIdeMethodFolders(targetDir: string, template?: string): Promise<string[]> {
    // Build method set: from --template flag, or from installed methods
    const methodNames = template ? new Set([template]) : await getInstalledMethodNames(targetDir)

    if (methodNames.size === 0) {
      return []
    }

    // For each IDE root, scan all subdirectories for children matching method names
    const ideRoots = Object.values(IDE_FOLDERS).map((ide) => join(targetDir, ide.root))

    const ideResults = await Promise.all(
      ideRoots.map(async (ideRoot) => {
        // Get all subdirectories of IDE root (e.g., .claude/commands/, .claude/skills/)
        try {
          const topEntries = await fs.readdir(ideRoot, {withFileTypes: true})
          const subdirs = topEntries.filter((e) => e.isDirectory())

          // For each subdirectory, check for method-named children
          const subResults = await Promise.all(
            subdirs.map(async (subdir) => {
              const subdirPath = join(ideRoot, subdir.name)
              try {
                const entries = await fs.readdir(subdirPath, {withFileTypes: true})
                return entries
                  .filter((entry) => entry.isDirectory() && methodNames.has(entry.name))
                  .map((entry) => join(subdirPath, entry.name))
              } catch {
                return []
              }
            }),
          )
          return subResults.flat()
        } catch {
          return []
        }
      }),
    )

    return ideResults.flat()
  }

  /**
   * Find all output folders in the target directory.
   * Looks for .aiwcli/_output/{method}/ structure.
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by (e.g., 'bmad', 'gsd')
   * @returns Array of output folder paths
   */
  private async findOutputFolders(targetDir: string, template?: string): Promise<string[]> {
    const containerDir = join(targetDir, AIWCLI_CONTAINER)
    const outputDir = join(containerDir, OUTPUT_FOLDER_NAME)

    // Check if _output folder exists
    try {
      const stat = await fs.stat(outputDir)
      if (!stat.isDirectory()) {
        return []
      }
    } catch {
      // _output folder doesn't exist
      return []
    }

    // If template specified, only look for that specific method folder
    if (template) {
      const methodPath = join(outputDir, template)
      try {
        const stat = await fs.stat(methodPath)
        if (stat.isDirectory()) {
          return [methodPath]
        }
      } catch {
        // Method folder doesn't exist
      }

      return []
    }

    // No template filter - find all method folders within _output
    const foundFolders: string[] = []
    try {
      const entries = await fs.readdir(outputDir, {withFileTypes: true})

      for (const entry of entries) {
        if (entry.isDirectory()) {
          foundFolders.push(join(outputDir, entry.name))
        }
      }
    } catch {
      // Directory can't be read - return empty
    }

    return foundFolders
  }

  /**
   * Find all workflow folders in the target directory.
   * Looks for .aiwcli/_{method}/ structure (e.g., .aiwcli/_gsd/, .aiwcli/_bmad/).
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by (e.g., 'bmad', 'gsd')
   * @returns Array of workflow folder paths
   */
  private async findWorkflowFolders(targetDir: string, template?: string): Promise<string[]> {
    const foundFolders: string[] = []
    const containerDir = join(targetDir, AIWCLI_CONTAINER)

    try {
      const entries = await fs.readdir(containerDir, {withFileTypes: true})

      for (const entry of entries) {
        // Look for directories starting with underscore (workflow folders)
        if (entry.isDirectory() && entry.name.startsWith('_') && entry.name !== OUTPUT_FOLDER_NAME) {
          // If template specified, only include matching folder
          if (template) {
            if (entry.name === `_${template}`) {
              foundFolders.push(join(containerDir, entry.name))
            }
          } else {
            foundFolders.push(join(containerDir, entry.name))
          }
        }
      }
    } catch {
      // Directory can't be read - return empty
    }

    return foundFolders
  }

  /**
   * Remove method entries from IDE settings files (methods tracking only).
   * Settings reconstruction handles hooks/permissions; this only strips the methods object.
   */
  private async removeMethodEntries(targetDir: string, methodsToRemove: string[]): Promise<void> {
    const ops = Object.values(IDE_FOLDERS).map(async (ide) => {
      const settingsPath = join(targetDir, ide.root, ide.settingsFile)
      try {
        const content = await fs.readFile(settingsPath, 'utf8')
        const settings = JSON.parse(content)

        if (settings.methods && typeof settings.methods === 'object') {
          for (const method of methodsToRemove) {
            if (method in settings.methods) {
              delete settings.methods[method]
            }
          }

          if (Object.keys(settings.methods).length === 0) {
            delete settings.methods
          }

          // Write back with methods removed (backup created by reconstructor)
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
        }
      } catch {
        // Settings file doesn't exist or can't be read
      }
    })
    await Promise.all(ops)
  }
}
