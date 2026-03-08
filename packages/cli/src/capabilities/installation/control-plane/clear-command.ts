import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import confirm from '@inquirer/confirm'
import {Flags} from '@oclif/core'

import BaseCommand from '../../../cli/base-command.js'
import {computeExcludeRemovals, pruneExcludeStaleEntries, removeExcludeEntries, resolveGitDir} from '../../../lib/git-exclude-manager.js'
import {deleteInstallStateIfPresent, getInstalledMethods, markMethodRemoved, readInstallState} from '../../../lib/install-state.js'
import {pathExists} from '../../../lib/paths.js'
import {getTemplatePath} from '../../../lib/template-resolver.js'
import {reconstructIdeSettings} from '../../../lib/template-settings-reconstructor.js'
import {EXIT_CODES} from '../../../types/exit-codes.js'

/**
 * Container folder for method-specific files
 * This keeps template infrastructure separate from IDE config
 */
const AIWCLI_CONTAINER = '.aiwcli'

/**
 * The output folder name that contains method subdirectories.
 * Structure: _output/{method}/ (e.g., _output/bmad/, _output/gsd/)
 */
const OUTPUT_FOLDER_NAME = '_output'
const CORE_TEMPLATE_NAME = 'core'
const SETTINGS_FILES_TO_SKIP = new Set(['hooks.json', 'settings.json'])
const CORE_RUNTIME_FOLDERS = ['_core']
export const PROTECTED_OUTPUT_DIRS = new Set(['contexts', 'cache', '_archive'])

interface IdeFolderConfig {
  root: string
  settingsFile?: string
}
interface IdeFoldersConfig {
  claude: IdeFolderConfig
  codex: IdeFolderConfig
  cognition: IdeFolderConfig
  windsurf: IdeFolderConfig
}

/**
 * IDE configuration folder names and settings file locations.
 * Method subfolders are discovered dynamically via disk scanning.
 */
const IDE_FOLDERS: IdeFoldersConfig = {
  claude: {
    root: '.claude',
    settingsFile: 'settings.json',
  },
  codex: {
    root: '.codex',
  },
  cognition: {
    root: '.cognition',
  },
  windsurf: {
    root: '.windsurf',
    settingsFile: 'hooks.json',
  },
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
  ideFolder: IdeFolderConfig,
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

  // Check if settings file is empty (for IDEs that use one)
  if (ideFolder.settingsFile) {
    const settingsPath = join(ideFolderPath, ideFolder.settingsFile)
    const settingsEmpty = await isSettingsFileEmpty(settingsPath)
    if (!settingsEmpty) {
      return false
    }
  }

  // Check the IDE folder itself - ignore backup files and check for other meaningful content
  try {
    const entries = await fs.readdir(ideFolderPath)
    // Filter entries to check (skip backup files and settings file)
    const entriesToCheck = entries.filter((entry) => {
      if (entry.endsWith('.backup')) return false
      if (ideFolder.settingsFile && entry === ideFolder.settingsFile) return false
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

    // If unknown entry is not empty (or is a non-backup file), don't delete
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
 * Try to remove a directory if it is empty.
 *
 * @param dir - Directory to check and potentially remove
 * @returns True if the directory was removed
 */
async function tryRemoveEmptyDir(dir: string): Promise<boolean> {
  try {
    if (await isDirectoryEmpty(dir)) {
      await removeDirectory(dir)
      return true
    }
  } catch {
    // Directory doesn't exist or can't be accessed
  }

  return false
}

/**
 * Check if an IDE folder will be empty after removing specified method folders.
 * Counts method folders vs folders being deleted, then simulates settings cleanup.
 *
 * @param targetDir - Project root directory
 * @param ideFolder - IDE folder configuration
 * @param ideFolder.root - Root folder name (e.g., '.claude')
 * @param ideFolder.settingsFile - Settings file name (e.g., 'settings.json')
 * @param ideMethodFolders - IDE method folders being deleted
 * @returns True if the IDE folder will be empty after removal
 */
async function checkIdeRemovalEligibility(
  targetDir: string,
  ideFolder: IdeFolderConfig,
  ideMethodFolders: string[],
): Promise<boolean> {
  const idePath = join(targetDir, ideFolder.root)
  try {
    const stat = await fs.stat(idePath)
    if (!stat.isDirectory()) return false
  } catch {
    return false
  }

  // Count method folders vs folders being deleted
  const counts = await countMethodFolderDeletions(idePath, ideMethodFolders)
  if (counts.total === 0 || counts.total !== counts.deleted) return false

  // IDEs without a settings file are eligible based on folder counts alone.
  if (!ideFolder.settingsFile) return true

  // Check if settings file would become empty after removing AIW-managed hooks.
  return wouldSettingsBeEmpty(idePath, ideFolder.settingsFile)
}

/**
 * Count total method folders and how many are being deleted in an IDE root.
 *
 * @param idePath - Path to IDE root folder
 * @param ideMethodFolders - IDE method folders being deleted
 * @returns Counts of total and deleted method folders
 */
async function countMethodFolderDeletions(
  idePath: string,
  ideMethodFolders: string[],
): Promise<{deleted: number; total: number}> {
  let total = 0
  let deleted = 0

  try {
    const topEntries = await fs.readdir(idePath, {withFileTypes: true})
    const subdirs = topEntries.filter((e) => e.isDirectory())

    const subResults = await Promise.all(
      subdirs.map(async (subdir) => {
        const subdirPath = join(idePath, subdir.name)
        try {
          const entries = await fs.readdir(subdirPath, {withFileTypes: true})
          const methodDirs = entries.filter((e) => e.isDirectory())
          const deletedCount = methodDirs.filter((entry) =>
            ideMethodFolders.includes(join(subdirPath, entry.name)),
          ).length
          return {deleted: deletedCount, total: methodDirs.length}
        } catch {
          return {deleted: 0, total: 0}
        }
      }),
    )

    for (const r of subResults) {
      total += r.total
      deleted += r.deleted
    }
  } catch {
    return {deleted: 0, total: 0}
  }

  return {deleted, total}
}

/**
 * Check if a settings file would be empty after removing AIW-managed hooks.
 *
 * @param idePath - Path to IDE root folder
 * @param settingsFile - Settings file name
 * @returns True if settings would be empty
 */
async function wouldSettingsBeEmpty(
  idePath: string,
  settingsFile: string,
): Promise<boolean> {
  const settingsPath = join(idePath, settingsFile)
  try {
    const content = await fs.readFile(settingsPath, 'utf8')
    const settings = JSON.parse(content)

    if (settings.hooks && typeof settings.hooks === 'object') {
      delete settings.hooks
    }

    return Object.keys(settings).length === 0
  } catch {
    return true
  }
}

/**
 * Check if a log file exceeds 1MB and needs rotation.
 *
 * @param logPath - Path to the log file
 * @returns Log action info if rotation needed, null otherwise
 */
async function checkLogRotation(logPath: string): Promise<null | {path: string; sizeBytes: number}> {
  try {
    const stat = await fs.stat(logPath)
    if (stat.size > 1_048_576) {
      return {path: logPath, sizeBytes: stat.size}
    }
  } catch {
    // Can't stat log file
  }

  return null
}

/**
 * Check if a contexts directory has a non-empty _archive/ subdirectory.
 *
 * @param contextsPath - Path to the contexts directory
 * @returns Archive info if found, null otherwise
 */
async function checkArchiveDir(contextsPath: string): Promise<null | {count: number; path: string}> {
  const archivePath = join(contextsPath, '_archive')
  try {
    const entries = await fs.readdir(archivePath)
    if (entries.length > 0) {
      return {path: archivePath, count: entries.length}
    }
  } catch {
    // No archive directory
  }

  return null
}

/**
 * Recursively remove files from targetDir that have a matching file in sourceDir.
 * This removes only AIW-managed template files and leaves unknown user files intact.
 *
 * @param sourceDir - Template source subtree
 * @param targetDir - Target subtree in project
 * @returns Number of files removed
 */
async function removeMatchingFiles(sourceDir: string, targetDir: string): Promise<number> {
  let entries
  try {
    entries = await fs.readdir(sourceDir, {withFileTypes: true})
  } catch {
    return 0
  }

  let removed = 0
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      removed += await removeMatchingFiles(sourcePath, targetPath)
      continue
    }

    if (!entry.isFile()) continue
    if (SETTINGS_FILES_TO_SKIP.has(entry.name)) continue

    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await pathExists(targetPath))) continue
      // eslint-disable-next-line no-await-in-loop
      await fs.rm(targetPath, {force: true})
      removed++
    } catch {
      // Best-effort deletion
    }
  }

  try {
    const leftovers = await fs.readdir(targetDir)
    if (leftovers.length === 0) {
      await fs.rmdir(targetDir)
    }
  } catch {
    // Target dir doesn't exist or isn't empty
  }

  return removed
}

/**
 * Clear method runtime folders, output folders, IDE method folders, and update configurations.
 */
export default class ClearCommand extends BaseCommand {
  static override description =
    'Clear method runtime folders, output folders, IDE method folders (.claude/.codex/.windsurf), and update configurations'
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
    const isTemplateScoped = Boolean(flags.template)

    // Handle --output flag separately (mutually exclusive with --template)
    if (flags.output) {
      await this.cleanRuntimeOutput(targetDir, flags)
      return
    }

    try {
      // Find all folders to clear
      const methodRuntimeFolders = await this.findMethodRuntimeFolders(targetDir, flags.template)
      const outputMethodFolders = await this.findOutputFolders(targetDir, flags.template)
      const ideMethodFolders = await this.findIdeMethodFolders(targetDir, flags.template)
      const coreRuntimeFolders = isTemplateScoped ? [] : await this.findCoreRuntimeFolders(targetDir)
      const coreIdeFilesToRemove = isTemplateScoped ? 0 : await this.countCoreIdeManagedFiles(targetDir)
      const methodsToRemove = await this.resolveMethodsToRemove(targetDir, flags.template, methodRuntimeFolders)

      // Nothing to clear
      if (
        methodRuntimeFolders.length === 0 &&
        outputMethodFolders.length === 0 &&
        ideMethodFolders.length === 0 &&
        coreRuntimeFolders.length === 0 &&
        coreIdeFilesToRemove === 0
      ) {
        const msg = flags.template
          ? `No folders found for template '${flags.template}'.`
          : 'No AIW-managed folders or core template files found.'
        this.logInfo(msg)
        return
      }

      // Display pending changes
      await this.displayPendingChanges(targetDir, {
        methodRuntimeFolders, outputMethodFolders, ideMethodFolders, coreRuntimeFolders, methodsToRemove, coreIdeFilesToRemove,
      })

      // Dry run - just show what would happen
      if (flags['dry-run']) {
        this.logInfo('Dry run complete. No files or folders were deleted.')
        return
      }

      // Confirm deletion
      const totalFolders = methodRuntimeFolders.length + outputMethodFolders.length + ideMethodFolders.length + coreRuntimeFolders.length
      const coreFilesSuffix = coreIdeFilesToRemove > 0 ? ` and clean ${coreIdeFilesToRemove} core IDE file(s)` : ''
      if (!flags.force) {
        const shouldDelete = await confirm({
          message: `Delete ${totalFolders} folder(s)${coreFilesSuffix}?`,
          default: false,
        })

        if (!shouldDelete) {
          this.log('Operation cancelled.')
          return
        }
      }

      // Execute deletion and cleanup
      const deleteCounts = await this.executeFolderDeletion(
        methodRuntimeFolders, outputMethodFolders, ideMethodFolders, coreRuntimeFolders,
      )

      // Audit log for aiw clear operations (only if _output/ will survive — don't create orphan files)
      try {
        const outputDir = join(targetDir, OUTPUT_FOLDER_NAME)
        if (await pathExists(outputDir) && !await isDirectoryEmpty(outputDir)) {
          const hookLogPath = join(outputDir, 'hook-log.jsonl')
          const logEntry = JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            hook: 'aiw_clear',
            msg: `aiw clear: deleted ${deleteCounts.deletedMethodRuntime + deleteCounts.deletedOutput + deleteCounts.deletedIde + deleteCounts.deletedCoreRuntime} folder(s)`,
            data: { methodRuntime: deleteCounts.deletedMethodRuntime, output: deleteCounts.deletedOutput, ide: deleteCounts.deletedIde, coreRuntime: deleteCounts.deletedCoreRuntime }
          })
          await fs.appendFile(hookLogPath, logEntry + '\n')
        }
      } catch { /* non-critical */ }

      const cleanupResult = await this.performPostDeleteCleanup(targetDir, methodsToRemove, !isTemplateScoped)
      this.reportClearResults(deleteCounts, cleanupResult)
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
   * @param flags.force - Skip confirmation prompt
   */
  // eslint-disable-next-line complexity
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
          logAction = await checkLogRotation(entryPath) // eslint-disable-line no-await-in-loop
          continue
        }

        // Archive cleanup: contexts/_archive/
        if (entry.isDirectory() && entry.name === 'contexts') {
          const result = await checkArchiveDir(entryPath) // eslint-disable-line no-await-in-loop
          if (result) {
            archiveDir = result.path
            archiveCount = result.count
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
        await fs.unlink(item.path) // eslint-disable-line no-await-in-loop
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
   * Clean up backup files created during settings reconstruction.
   *
   * @param targetDir - Project root directory
   */
  private async cleanupBackupFiles(targetDir: string): Promise<void> {
    const cleanups = Object.values(IDE_FOLDERS).map(async (ide) => {
      if (!ide.settingsFile) return
      const backupPath = join(targetDir, ide.root, `${ide.settingsFile}.backup`)
      try {
        await fs.rm(backupPath, {force: true})
      } catch {
        // Backup doesn't exist or can't be removed
      }
    })
    await Promise.all(cleanups)
  }

  /**
   * Clean up git exclude entries and prune stale entries.
   *
   * @param targetDir - Project root directory
   * @returns True if git exclude was updated
   */
  private async cleanupGitExclude(targetDir: string, isFullClear = false): Promise<boolean> {
    const gitDir = await resolveGitDir(targetDir)
    if (!gitDir) return false

    const {toRemove, toKeep} = await computeExcludeRemovals(gitDir, targetDir, isFullClear ? [] : undefined)

    for (const {entry, reason} of toKeep) {
      this.logDebug(`Keeping ${entry}/ in git exclude (${reason})`)
    }

    if (toRemove.length > 0) {
      await removeExcludeEntries(gitDir, toRemove)
      this.logDebug(`Removed from git exclude: ${toRemove.join(', ')}`)
    }

    const pruned = await pruneExcludeStaleEntries(gitDir, targetDir)
    if (pruned) {
      this.logDebug('Pruned stale git exclude entries')
    }

    return toRemove.length > 0 || pruned
  }

  private async countCoreIdeManagedFiles(targetDir: string): Promise<number> {
    const coreTemplatePath = await this.getCoreTemplatePathSafe()
    if (!coreTemplatePath) return 0

    let total = 0
    for (const ide of Object.values(IDE_FOLDERS)) {
      const sourceIdeRoot = join(coreTemplatePath, ide.root)
      const targetIdeRoot = join(targetDir, ide.root)
      // eslint-disable-next-line no-await-in-loop
      if (!(await pathExists(sourceIdeRoot)) || !(await pathExists(targetIdeRoot))) continue
      // eslint-disable-next-line no-await-in-loop
      total += await this.countMatchingManagedFiles(sourceIdeRoot, targetIdeRoot)
    }

    return total
  }

  private async countMatchingManagedFiles(sourceDir: string, targetDir: string): Promise<number> {
    let entries
    try {
      entries = await fs.readdir(sourceDir, {withFileTypes: true})
    } catch {
      return 0
    }

    let count = 0
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name)
      const targetPath = join(targetDir, entry.name)
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        count += await this.countMatchingManagedFiles(sourcePath, targetPath)
        continue
      }

      if (!entry.isFile()) continue
      if (SETTINGS_FILES_TO_SKIP.has(entry.name)) continue
      // eslint-disable-next-line no-await-in-loop
      if (await pathExists(targetPath)) count++
    }

    return count
  }

  /**
   * Display a list of folders to remove.
   *
   * @param targetDir - Base directory for relative path display
   * @param folders - Array of folder paths
   * @param label - Label for the folder type
   */
  private displayFolderList(targetDir: string, folders: string[], label: string): void {
    if (folders.length === 0) return

    this.logInfo(`${label} to remove (${folders.length}):`)
    for (const folder of folders) {
      const folderName = folder.replace(targetDir + '\\', '').replace(targetDir + '/', '')
      this.log(`  ${folderName}/`)
    }

    this.log('')
  }

  /**
   * Display all pending changes before confirmation.
   *
   * @param targetDir - Project root directory
   * @param folders - Discovered folders and methods to remove
   * @param folders.methodRuntimeFolders - Method runtime folders to remove
   * @param folders.outputMethodFolders - Output method folders to remove
   * @param folders.ideMethodFolders - IDE method folders to remove
   * @param folders.coreRuntimeFolders - Core runtime folders to remove
   * @param folders.coreIdeFilesToRemove - Number of core IDE files to remove
   * @param folders.methodsToRemove - Method names being removed
   */
  private async displayPendingChanges(
    targetDir: string,
    folders: {
      coreIdeFilesToRemove: number
      coreRuntimeFolders: string[]
      ideMethodFolders: string[]
      methodRuntimeFolders: string[]
      methodsToRemove: string[]
      outputMethodFolders: string[]
    },
  ): Promise<void> {
    const {
      methodRuntimeFolders,
      outputMethodFolders,
      ideMethodFolders,
      coreRuntimeFolders,
      methodsToRemove,
      coreIdeFilesToRemove,
    } = folders
    this.log('')

    this.displayFolderList(targetDir, methodRuntimeFolders, 'Method runtime folders')
    this.displayFolderList(targetDir, outputMethodFolders, 'Output folders')
    this.displayFolderList(targetDir, ideMethodFolders, 'IDE method folders')
    this.displayFolderList(targetDir, coreRuntimeFolders, 'Core runtime folders')

    if (coreIdeFilesToRemove > 0) {
      this.logInfo(`Core IDE template files to remove (${coreIdeFilesToRemove})`)
      this.log('')
    }

    if (methodsToRemove.length > 0) {
      this.logInfo(`Will reconstruct core IDE settings after removing: ${methodsToRemove.join(', ')}`)
      this.log('')
    }

    // Check if _output will be empty after clearing
    const allMethodFolders = await this.findOutputFolders(targetDir)
    if (allMethodFolders.length > 0 && allMethodFolders.length === outputMethodFolders.length) {
      this.logInfo(`${OUTPUT_FOLDER_NAME}/ folder will be removed (will be empty)`)
      this.log('')
    }

    // Check if IDE folders might be removed after clearing
    const [willClaudeFolderBeEmpty, willCodexFolderBeEmpty, willCognitionFolderBeEmpty, willWindsurfFolderBeEmpty] = await Promise.all([
      checkIdeRemovalEligibility(targetDir, IDE_FOLDERS.claude, ideMethodFolders),
      checkIdeRemovalEligibility(targetDir, IDE_FOLDERS.codex, ideMethodFolders),
      checkIdeRemovalEligibility(targetDir, IDE_FOLDERS.cognition, ideMethodFolders),
      checkIdeRemovalEligibility(targetDir, IDE_FOLDERS.windsurf, ideMethodFolders),
    ])

    if (willClaudeFolderBeEmpty) {
      this.logInfo(`${IDE_FOLDERS.claude.root}/ folder will be removed (will be empty)`)
      this.log('')
    }

    if (willCodexFolderBeEmpty) {
      this.logInfo(`${IDE_FOLDERS.codex.root}/ folder will be removed (will be empty)`)
      this.log('')
    }

    if (willCognitionFolderBeEmpty) {
      this.logInfo(`${IDE_FOLDERS.cognition.root}/ folder will be removed (will be empty)`)
      this.log('')
    }

    if (willWindsurfFolderBeEmpty) {
      this.logInfo(`${IDE_FOLDERS.windsurf.root}/ folder will be removed (will be empty)`)
      this.log('')
    }

    // Compute git exclude changes for dry-run display
    const gitDir = await resolveGitDir(targetDir)
    const excludeSimulation = gitDir ? await computeExcludeRemovals(gitDir, targetDir) : {toRemove: [], toKeep: []}
    if (excludeSimulation.toRemove.length > 0 || excludeSimulation.toKeep.length > 0) {
      this.logInfo('Git exclude changes:')
      for (const {entry, reason} of excludeSimulation.toKeep) {
        this.log(`  keep ${entry}/ (${reason})`)
      }

      for (const entry of excludeSimulation.toRemove) {
        this.log(`  remove ${entry}/`)
      }

      this.log('')
    }
  }

  /**
   * Delete all discovered folders in parallel.
   *
   * @param methodRuntimeFolders - Method runtime folders to delete
   * @param outputMethodFolders - Output method folders to delete
   * @param ideMethodFolders - IDE method folders to delete
   * @returns Count of successfully deleted folders by type
   */
  private async executeFolderDeletion(
    methodRuntimeFolders: string[],
    outputMethodFolders: string[],
    ideMethodFolders: string[],
    coreRuntimeFolders: string[],
  ): Promise<{deletedCoreRuntime: number; deletedIde: number; deletedMethodRuntime: number; deletedOutput: number;}> {
    const deleteFolder = async (
      folder: string,
      type: string,
    ): Promise<{success: boolean; type: string}> => {
      try {
        await removeDirectory(folder)
        this.logDebug(`Removed ${type} folder: ${folder}`)
        return {success: true, type}
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        this.logWarning(`Failed to delete ${folder}: ${err.message}`)
        return {success: false, type}
      }
    }

    const deleteResults = await Promise.all([
      ...methodRuntimeFolders.map((f) => deleteFolder(f, 'method runtime')),
      ...outputMethodFolders.map((f) => deleteFolder(f, 'output')),
      ...ideMethodFolders.map((f) => deleteFolder(f, 'IDE method')),
      ...coreRuntimeFolders.map((f) => deleteFolder(f, 'core runtime')),
    ])

    return {
      deletedMethodRuntime: deleteResults.filter((r) => r.success && r.type === 'method runtime').length,
      deletedOutput: deleteResults.filter((r) => r.success && r.type === 'output').length,
      deletedIde: deleteResults.filter((r) => r.success && r.type === 'IDE method').length,
      deletedCoreRuntime: deleteResults.filter((r) => r.success && r.type === 'core runtime').length,
    }
  }

  /**
   * Extract method names from runtime folder names (e.g., _gsd -> gsd).
   *
   * @param methodRuntimeFolders - Array of runtime folder paths
   * @returns Array of method names
   */
  private extractMethodNames(methodRuntimeFolders: string[]): string[] {
    const methods: string[] = []
    for (const folder of methodRuntimeFolders) {
      const folderName = folder.split(/[/\\]/).pop() || ''
      if (folderName.startsWith('_')) {
        methods.push(folderName.slice(1))
      }
    }

    return methods
  }

  private async findCoreRuntimeFolders(targetDir: string): Promise<string[]> {
    const containerDir = join(targetDir, AIWCLI_CONTAINER)
    const paths = CORE_RUNTIME_FOLDERS.map((name) => join(containerDir, name))
    const checks = await Promise.all(paths.map((p) => pathExists(p)))
    return paths.filter((_, index) => checks[index])
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
    const methodNames = new Set(template ? [template] : await getInstalledMethods(targetDir))

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
   * Find all method runtime folders in the target directory.
   * Looks for .aiwcli/_{method}/ structure (e.g., .aiwcli/_gsd/, .aiwcli/_bmad/).
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by (e.g., 'bmad', 'gsd')
   * @returns Array of method runtime folder paths
   */
  private async findMethodRuntimeFolders(targetDir: string, template?: string): Promise<string[]> {
    const foundFolders: string[] = []
    const containerDir = join(targetDir, AIWCLI_CONTAINER)

    try {
      const entries = await fs.readdir(containerDir, {withFileTypes: true})

      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          !entry.name.startsWith('_') ||
          entry.name === OUTPUT_FOLDER_NAME ||
          entry.name === '_core' ||
          false
        ) {
          continue
        }

        // If template specified, only include matching folder
        if (template && entry.name !== `_${template}`) {
          continue
        }

        foundFolders.push(join(containerDir, entry.name))
      }
    } catch {
      // Directory can't be read - return empty
    }

    return foundFolders
  }

  /**
   * Find all method output folders in the target directory.
   * Looks for _output/{method}/ structure at project root.
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by (e.g., 'bmad', 'gsd')
   * @returns Array of output folder paths
   */
  private async findOutputFolders(targetDir: string, template?: string): Promise<string[]> {
    const outputDir = join(targetDir, OUTPUT_FOLDER_NAME)

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
        if (entry.isDirectory() && !PROTECTED_OUTPUT_DIRS.has(entry.name)) {
          foundFolders.push(join(outputDir, entry.name))
        }
      }
    } catch {
      // Directory can't be read - return empty
    }

    return foundFolders
  }

  private async getCoreTemplatePathSafe(): Promise<null | string> {
    try {
      return await getTemplatePath(CORE_TEMPLATE_NAME)
    } catch {
      return null
    }
  }

  /**
   * Perform all post-deletion cleanup: empty dir removal, git exclude, settings, IDE folders.
   *
   * @param targetDir - Project root directory
   * @param methodsToRemove - Method names being removed
   * @returns Cleanup result state
   */
  private async performPostDeleteCleanup(
    targetDir: string,
    methodsToRemove: string[],
    isFullClear: boolean,
  ): Promise<{
    gitExcludeUpdated: boolean
    removedAiwcliContainer: boolean
    removedClaudeDir: boolean
    removedCodexDir: boolean
    removedCognitionDir: boolean
    removedCoreIdeFiles: number
    removedOutputDir: boolean
    removedWindsurfDir: boolean
    updatedClaudeSettings: boolean
    updatedWindsurfSettings: boolean
  }> {
    const containerDir = join(targetDir, AIWCLI_CONTAINER)
    const outputDir = join(targetDir, OUTPUT_FOLDER_NAME)
    let removedCoreIdeFiles = 0

    let removedOutputDir = false
    let removedAiwcliContainer = false

    if (isFullClear) {
      // Force-delete .aiwcli/ entirely on full clear.
      try {
        await fs.rm(containerDir, {recursive: true, force: true})
        removedAiwcliContainer = true
        this.logDebug(`Force-deleted ${AIWCLI_CONTAINER}/ folder`)
      } catch {
        // Directory may not exist
      }
    } else {
      // Check if .aiwcli container is now empty and remove it.
      removedAiwcliContainer = await tryRemoveEmptyDir(containerDir)
      if (removedAiwcliContainer) {
        this.logDebug(`Removed empty ${AIWCLI_CONTAINER}/ folder`)
      }
    }

    // Check if the root _output folder is now empty and remove it.
    removedOutputDir = await tryRemoveEmptyDir(outputDir)
    if (removedOutputDir) {
      this.logDebug(`Removed empty ${OUTPUT_FOLDER_NAME}/ folder`)
    }

    if (isFullClear) {
      removedCoreIdeFiles = await this.removeCoreIdeContent(targetDir)
    }

    // Reconstruct IDE settings
    let {updatedClaudeSettings, updatedWindsurfSettings} =
      await this.reconstructSettingsAfterRemoval(targetDir, methodsToRemove, isFullClear)

    // Clean up backup files
    await this.cleanupBackupFiles(targetDir)

    // Check if IDE folders should be fully deleted
    const removedClaudeDir = await this.tryRemoveIdeFolder(targetDir, IDE_FOLDERS.claude)
    if (removedClaudeDir) updatedClaudeSettings = false

    const removedCodexDir = await this.tryRemoveIdeFolder(targetDir, IDE_FOLDERS.codex)

    const removedCognitionDir = await this.tryRemoveIdeFolder(targetDir, IDE_FOLDERS.cognition)

    const removedWindsurfDir = await this.tryRemoveIdeFolder(targetDir, IDE_FOLDERS.windsurf)
    if (removedWindsurfDir) updatedWindsurfSettings = false

    // Smart git exclude removal must happen after any now-empty IDE folders are deleted.
    const gitExcludeUpdated = await this.cleanupGitExclude(targetDir, isFullClear)

    return {
      removedCoreIdeFiles,
      removedOutputDir, removedAiwcliContainer, removedClaudeDir, removedCodexDir, removedCognitionDir, removedWindsurfDir,
      updatedClaudeSettings, updatedWindsurfSettings, gitExcludeUpdated,
    }
  }

  /**
   * Reconstruct IDE settings after method removal.
   *
   * @param targetDir - Project root directory
   * @param methodsToRemove - Methods being removed
   * @returns Which IDE settings were updated
   */
  private async reconstructSettingsAfterRemoval(
    targetDir: string,
    methodsToRemove: string[],
    isFullClear: boolean,
  ): Promise<{updatedClaudeSettings: boolean; updatedWindsurfSettings: boolean}> {
    let updatedClaudeSettings = false
    let updatedWindsurfSettings = false

    if (methodsToRemove.length > 0) {
      for (const method of methodsToRemove) {
        await markMethodRemoved(targetDir, method) // eslint-disable-line no-await-in-loop
      }
    }

    if (isFullClear) {
      await deleteInstallStateIfPresent(targetDir)
      await this.stripAiwSettingsForFullClear(targetDir)
    } else if (methodsToRemove.length > 0) {
      const remainingTemplates = (await getInstalledMethods(targetDir)).filter((method) => !methodsToRemove.includes(method))

      const ides: string[] = []
      if (await pathExists(join(targetDir, IDE_FOLDERS.claude.root))) ides.push('claude')
      if (await pathExists(join(targetDir, IDE_FOLDERS.windsurf.root))) ides.push('windsurf')

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

    const currentState = await readInstallState(targetDir)
    if (currentState && Object.keys(currentState.methods).length === 0 && !currentState.core.installed) {
      await deleteInstallStateIfPresent(targetDir)
    }

    return {updatedClaudeSettings, updatedWindsurfSettings}
  }

  private async removeCoreIdeContent(targetDir: string): Promise<number> {
    const coreTemplatePath = await this.getCoreTemplatePathSafe()
    if (!coreTemplatePath) return 0

    let removedFiles = 0
    for (const ide of Object.values(IDE_FOLDERS)) {
      const sourceIdeRoot = join(coreTemplatePath, ide.root)
      const targetIdeRoot = join(targetDir, ide.root)
      // eslint-disable-next-line no-await-in-loop
      if (!(await pathExists(sourceIdeRoot)) || !(await pathExists(targetIdeRoot))) continue
      // eslint-disable-next-line no-await-in-loop
      removedFiles += await removeMatchingFiles(sourceIdeRoot, targetIdeRoot)
    }

    return removedFiles
  }

  /**
   * Report the results of a clear operation.
   *
   * @param deleteCounts - Counts of deleted folders by type
   * @param deleteCounts.deletedMethodRuntime - Number of method runtime folders deleted
   * @param deleteCounts.deletedOutput - Number of output folders deleted
   * @param deleteCounts.deletedIde - Number of IDE method folders deleted
   * @param deleteCounts.deletedCoreRuntime - Number of core runtime folders deleted
   * @param cleanup - Cleanup operation results
   * @param cleanup.gitExcludeUpdated - Whether git exclude was updated
   * @param cleanup.removedOutputDir - Whether _output dir was removed
   * @param cleanup.removedAiwcliContainer - Whether .aiwcli dir was removed
   * @param cleanup.removedClaudeDir - Whether .claude dir was removed
   * @param cleanup.removedCodexDir - Whether .codex dir was removed
   * @param cleanup.removedCognitionDir - Whether .cognition dir was removed
   * @param cleanup.removedWindsurfDir - Whether .windsurf dir was removed
   * @param cleanup.removedCoreIdeFiles - Number of core IDE files removed
   * @param cleanup.updatedClaudeSettings - Whether Claude settings were updated
   * @param cleanup.updatedWindsurfSettings - Whether Windsurf settings were updated
   */
  private reportClearResults(
    deleteCounts: {deletedCoreRuntime: number; deletedIde: number; deletedMethodRuntime: number; deletedOutput: number;},
    cleanup: {
      gitExcludeUpdated: boolean
      removedAiwcliContainer: boolean
      removedClaudeDir: boolean
      removedCodexDir: boolean
      removedCognitionDir: boolean
      removedCoreIdeFiles: number
      removedOutputDir: boolean
      removedWindsurfDir: boolean
      updatedClaudeSettings: boolean
      updatedWindsurfSettings: boolean
    },
  ): void {
    this.log('')
    const parts: string[] = []
    if (deleteCounts.deletedMethodRuntime > 0) parts.push(`${deleteCounts.deletedMethodRuntime} method runtime folder(s)`)
    if (deleteCounts.deletedOutput > 0) parts.push(`${deleteCounts.deletedOutput} output folder(s)`)
    if (deleteCounts.deletedIde > 0) parts.push(`${deleteCounts.deletedIde} IDE method folder(s)`)
    if (deleteCounts.deletedCoreRuntime > 0) parts.push(`${deleteCounts.deletedCoreRuntime} core runtime folder(s)`)
    if (cleanup.removedCoreIdeFiles > 0) parts.push(`${cleanup.removedCoreIdeFiles} core IDE file(s)`)
    if (cleanup.removedOutputDir) parts.push(`${OUTPUT_FOLDER_NAME}/ folder`)
    if (cleanup.removedAiwcliContainer) parts.push(`${AIWCLI_CONTAINER}/ folder`)
    if (cleanup.removedClaudeDir) parts.push(`${IDE_FOLDERS.claude.root}/ folder`)
    if (cleanup.removedCodexDir) parts.push(`${IDE_FOLDERS.codex.root}/ folder`)
    if (cleanup.removedCognitionDir) parts.push(`${IDE_FOLDERS.cognition.root}/ folder`)
    if (cleanup.removedWindsurfDir) parts.push(`${IDE_FOLDERS.windsurf.root}/ folder`)

    this.logSuccess(`Cleared: ${parts.join(', ')}.`)

    if (cleanup.gitExcludeUpdated) {
      this.logSuccess('Updated git exclude.')
    }

    if (cleanup.updatedClaudeSettings) {
      this.logSuccess('Updated .claude/settings.json (backup: settings.json.backup).')
    }

    if (cleanup.updatedWindsurfSettings) {
      this.logSuccess('Updated .windsurf/hooks.json (backup: hooks.json.backup).')
    }
  }

  private async resolveMethodsToRemove(
    targetDir: string,
    template: string | undefined,
    methodRuntimeFolders: string[],
  ): Promise<string[]> {
    if (template) return [template]
    const installedMethods = new Set(await getInstalledMethods(targetDir))
    const discoveredFromFolders = this.extractMethodNames(methodRuntimeFolders)
    for (const method of discoveredFromFolders) {
      installedMethods.add(method)
    }

    return [...installedMethods]
  }

  private async stripAiwSettingsForFullClear(targetDir: string): Promise<void> {
    const ops = Object.values(IDE_FOLDERS).map(async (ide) => {
      if (!ide.settingsFile) return
      const settingsPath = join(targetDir, ide.root, ide.settingsFile)
      try {
        const raw = await fs.readFile(settingsPath, 'utf8')
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

        delete parsed.hooks
        delete parsed.statusLine
        delete parsed.fileSuggestion
        delete parsed.methods

        if (ide.root === IDE_FOLDERS.claude.root) {
          if (parsed.env && typeof parsed.env === 'object' && !Array.isArray(parsed.env)) {
            delete parsed.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
            if (Object.keys(parsed.env).length === 0) delete parsed.env
          }

          if (parsed.permissions && typeof parsed.permissions === 'object' && !Array.isArray(parsed.permissions)) {
            const permissionKeys = Object.keys(parsed.permissions)
            const hasOnlyAllowDeny = permissionKeys.every((key) => key === 'allow' || key === 'deny')
            const allow = Array.isArray(parsed.permissions.allow) ? parsed.permissions.allow : []
            const deny = Array.isArray(parsed.permissions.deny) ? parsed.permissions.deny : []
            if (hasOnlyAllowDeny && allow.length === 0 && deny.length === 0) delete parsed.permissions
          }
        }

        await fs.writeFile(settingsPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
      } catch {
        // Ignore invalid/missing settings files
      }
    })

    await Promise.all(ops)
  }

  /**
   * Try to remove an IDE folder if it should be deleted (empty settings + empty subfolders).
   *
   * @param targetDir - Project root directory
   * @param ideFolder - IDE folder configuration
   * @param ideFolder.root - Root folder name (e.g., '.claude')
   * @param ideFolder.settingsFile - Settings file name (e.g., 'settings.json')
   * @returns True if the folder was removed
   */
  private async tryRemoveIdeFolder(
    targetDir: string,
    ideFolder: IdeFolderConfig,
  ): Promise<boolean> {
    if (!(await shouldDeleteIdeFolder(targetDir, ideFolder))) return false

    const dirPath = join(targetDir, ideFolder.root)
    try {
      await removeDirectory(dirPath)
      this.logDebug(`Removed empty ${ideFolder.root}/ folder`)
      return true
    } catch {
      return false
    }
  }
}

