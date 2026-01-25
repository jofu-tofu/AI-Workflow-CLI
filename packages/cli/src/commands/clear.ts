import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
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
 * IDE configuration folder names and their method subfolder structure
 */
const IDE_FOLDERS = {
  claude: {
    root: '.claude',
    methodSubfolders: ['commands', 'skills', 'agents'],
    settingsFile: 'settings.json',
  },
  windsurf: {
    root: '.windsurf',
    methodSubfolders: ['workflows'],
    settingsFile: 'hooks.json',
  },
}

/**
 * AIW gitignore section header marker
 */
const AIW_GITIGNORE_HEADER = '# AIW Installation'

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
 * 2. All method subfolders are empty (or don't exist)
 * Backup files (e.g., settings.json.backup) are ignored.
 *
 * @param targetDir - Directory containing the IDE folder
 * @param ideFolder - IDE folder configuration
 * @param ideFolder.methodSubfolders - List of method subfolder names to check
 * @param ideFolder.root - Root folder name (e.g., '.claude')
 * @param ideFolder.settingsFile - Settings file name (e.g., 'settings.json')
 * @returns True if the IDE folder should be fully deleted
 */
async function shouldDeleteIdeFolder(
  targetDir: string,
  ideFolder: {methodSubfolders: string[]; root: string; settingsFile: string},
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

  // Check if all method subfolders are empty (in parallel)
  const subfolderChecks = await Promise.all(
    ideFolder.methodSubfolders.map(async (subfolder) => {
      const subfolderPath = join(ideFolderPath, subfolder)
      return isDirectoryEmpty(subfolderPath)
    }),
  )
  if (subfolderChecks.some((isEmpty) => !isEmpty)) {
    return false
  }

  // Check the IDE folder itself - ignore backup files and check for other meaningful content
  try {
    const entries = await fs.readdir(ideFolderPath)
    // Filter entries to check (skip backup files, settings file, and known subfolders)
    const entriesToCheck = entries.filter((entry) => {
      if (entry.endsWith('.backup')) return false
      if (entry === ideFolder.settingsFile) return false
      if (ideFolder.methodSubfolders.includes(entry)) return false
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
 * Update .gitignore to remove patterns for cleared folders.
 * Removes patterns from the AIW Installation section.
 *
 * @param targetDir - Directory containing .gitignore
 * @param foldersToRemove - Folder patterns to remove (without trailing slash)
 */
async function updateGitignoreAfterClear(targetDir: string, foldersToRemove: string[]): Promise<void> {
  const gitignorePath = join(targetDir, '.gitignore')

  try {
    const content = await fs.readFile(gitignorePath, 'utf8')

    // Check if AIW Installation section exists
    if (!content.includes(AIW_GITIGNORE_HEADER)) {
      return
    }

    // Split content into lines
    const lines = content.split('\n')
    const newLines: string[] = []
    let inAiwSection = false
    const aiwSectionLines: string[] = []

    // Parse lines and identify AIW section
    for (const line of lines) {
      if (line === AIW_GITIGNORE_HEADER) {
        inAiwSection = true
        aiwSectionLines.push(line)
        continue
      }

      if (inAiwSection) {
        // AIW section ends at empty line or another comment header
        if (line === '' || (line.startsWith('#') && line !== AIW_GITIGNORE_HEADER)) {
          inAiwSection = false
          // Process AIW section lines now
          const filteredAiwLines = filterAiwSection(aiwSectionLines, foldersToRemove)
          newLines.push(...filteredAiwLines, line)
        } else {
          aiwSectionLines.push(line)
        }
      } else {
        newLines.push(line)
      }
    }

    // Handle case where AIW section is at end of file
    if (inAiwSection) {
      const filteredAiwLines = filterAiwSection(aiwSectionLines, foldersToRemove)
      newLines.push(...filteredAiwLines)
    }

    // Clean up: remove AIW section entirely if only header remains
    const finalContent = cleanupGitignoreContent(newLines.join('\n'))

    await fs.writeFile(gitignorePath, finalContent, 'utf8')
  } catch {
    // .gitignore doesn't exist or can't be read
  }
}

/**
 * Filter AIW section lines to remove specified folders.
 *
 * @param aiwLines - Lines from AIW section (including header)
 * @param foldersToRemove - Folder names to remove
 * @returns Filtered lines
 */
function filterAiwSection(aiwLines: string[], foldersToRemove: string[]): string[] {
  const patternsToRemove = new Set(foldersToRemove.map((f) => `${f}/`))

  return aiwLines.filter((line) => {
    // Always keep the header
    if (line === AIW_GITIGNORE_HEADER) {
      return true
    }

    // Remove matching patterns
    return !patternsToRemove.has(line)
  })
}

/**
 * Clean up gitignore content after filtering.
 * Removes AIW section if empty, cleans up extra newlines.
 *
 * @param content - Gitignore content
 * @returns Cleaned content
 */
function cleanupGitignoreContent(content: string): string {
  const lines = content.split('\n')
  const newLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] as string

    // Check if this is an AIW header with nothing following
    if (line === AIW_GITIGNORE_HEADER) {
      // Look ahead to see if there are any patterns
      let hasPatterns = false
      const nextLine = lines[i + 1]
      if (nextLine !== undefined && nextLine !== '' && !nextLine.startsWith('#')) {
        hasPatterns = true
      }

      if (!hasPatterns) {
        // Skip the AIW header since it has no patterns
        i++
        // Also skip any trailing empty lines that were before AIW section
        while (newLines.length > 0 && newLines.at(-1) === '') {
          newLines.pop()
        }

        continue
      }
    }

    newLines.push(line)
    i++
  }

  // Ensure file ends with newline but not multiple
  let result = newLines.join('\n')
  result = result.replace(/\n+$/, '\n')

  // Handle empty file case
  if (result.trim() === '') {
    return ''
  }

  return result
}

/**
 * Update IDE settings file to remove method-specific entries.
 * Creates a backup before modifying.
 *
 * @param targetDir - Directory containing the IDE folder
 * @param ideFolder - IDE folder configuration (e.g., IDE_FOLDERS.claude)
 * @param ideFolder.root - Root folder name (e.g., '.claude')
 * @param ideFolder.settingsFile - Settings file name (e.g., 'settings.json')
 * @param methodsToRemove - Method names to remove from settings
 */
async function updateIdeSettings(
  targetDir: string,
  ideFolder: {root: string; settingsFile: string},
  methodsToRemove: string[],
): Promise<{backedUp: boolean; updated: boolean}> {
  const settingsPath = join(targetDir, ideFolder.root, ideFolder.settingsFile)
  const result = {backedUp: false, updated: false}

  try {
    const content = await fs.readFile(settingsPath, 'utf8')
    const settings = JSON.parse(content)

    // Create backup before modifying
    const backupPath = `${settingsPath}.backup`
    await fs.writeFile(backupPath, content, 'utf8')
    result.backedUp = true

    // Remove method-specific top-level keys
    let modified = false
    for (const method of methodsToRemove) {
      if (method in settings) {
        delete settings[method]
        modified = true
      }
    }

    // Remove method-specific hooks from hooks array
    if (settings.hooks && typeof settings.hooks === 'object') {
      for (const hookType of Object.keys(settings.hooks)) {
        const hookArray = settings.hooks[hookType]
        if (Array.isArray(hookArray)) {
          const filtered = hookArray.filter((hook: Record<string, unknown>) => {
            // Check if hook command references any of the methods to remove
            if (hook.hooks && Array.isArray(hook.hooks)) {
              const filteredInner = (hook.hooks as Record<string, unknown>[]).filter(
                (innerHook: Record<string, unknown>) => {
                  if (typeof innerHook.command === 'string') {
                    return !methodsToRemove.some(
                      (method) =>
                        innerHook.command?.toString().includes(`_${method}/`) ||
                        innerHook.command?.toString().includes(`/${method}-`),
                    )
                  }

                  return true
                },
              )
              if (filteredInner.length !== (hook.hooks as unknown[]).length) {
                hook.hooks = filteredInner
                modified = true
              }

              // Remove hook entry if all inner hooks were removed
              if (filteredInner.length === 0) {
                return false
              }
            }

            return true
          })
          if (filtered.length !== hookArray.length) {
            settings.hooks[hookType] = filtered
            modified = true
          }

          // Remove hook type if empty
          if (filtered.length === 0) {
            delete settings.hooks[hookType]
            modified = true
          }
        }
      }

      // Remove hooks object if empty
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks
        modified = true
      }
    }

    if (modified) {
      // Write updated settings
      const newContent = JSON.stringify(settings, null, 2) + '\n'
      await fs.writeFile(settingsPath, newContent, 'utf8')
      result.updated = true
    } else {
      // No changes needed, remove backup
      await fs.unlink(backupPath)
      result.backedUp = false
    }
  } catch {
    // Settings file doesn't exist or can't be read
  }

  return result
}

/**
 * Clear workflow folders, output folders, IDE method folders, and update configurations.
 */
export default class ClearCommand extends BaseCommand {
  static override description =
    'Clear workflow folders, output folders, IDE method folders (.claude/.windsurf), and update configurations'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --template bmad',
    '<%= config.bin %> <%= command.id %> -t planning-with-files',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --force',
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
    template: Flags.string({
      char: 't',
      description: 'Clear only a specific template (e.g., bmad, gsd, planning-with-files)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ClearCommand)
    const targetDir = process.cwd()

    try {
      // Find all folders to clear
      const workflowFolders = await this.findWorkflowFolders(targetDir, flags.template)
      const outputMethodFolders = await this.findOutputFolders(targetDir, flags.template)
      const ideMethodFolders = await this.findIdeMethodFolders(targetDir, flags.template)

      // Track what will be cleared for gitignore update
      const foldersToRemoveFromGitignore: string[] = []

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

      // Workflow folders (_{method}/) - will be deleted entirely
      if (workflowFolders.length > 0) {
        this.logInfo(`Workflow folders to remove (${workflowFolders.length}):`)
        for (const folder of workflowFolders) {
          const folderName = folder.replace(targetDir + '\\', '').replace(targetDir + '/', '')
          this.log(`  ${folderName}/`)
          foldersToRemoveFromGitignore.push(folderName)
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

        // Count existing method folders vs folders being deleted (in parallel)
        const subfolderResults = await Promise.all(
          ideFolder.methodSubfolders.map(async (subfolder) => {
            const subfolderPath = join(idePath, subfolder)
            try {
              const entries = await fs.readdir(subfolderPath, {withFileTypes: true})
              const methodDirs = entries.filter((e) => e.isDirectory())
              const beingDeleted = methodDirs.filter((entry) => {
                const fullPath = join(subfolderPath, entry.name)
                return ideMethodFolders.includes(fullPath)
              }).length
              return {beingDeleted, total: methodDirs.length}
            } catch {
              // Subfolder doesn't exist
              return {beingDeleted: 0, total: 0}
            }
          }),
        )

        const totalMethodFolders = subfolderResults.reduce((sum, r) => sum + r.total, 0)
        const foldersBeingDeleted = subfolderResults.reduce((sum, r) => sum + r.beingDeleted, 0)

        // If all method folders are being deleted, check if settings would be empty
        if (totalMethodFolders > 0 && totalMethodFolders === foldersBeingDeleted) {
          // Check if settings file would become empty after removing methods
          const settingsPath = join(idePath, ideFolder.settingsFile)
          try {
            const content = await fs.readFile(settingsPath, 'utf8')
            const settings = JSON.parse(content)
            // Remove method keys that would be removed
            for (const method of methodsToRemove) {
              if (method in settings) {
                delete settings[method]
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

      // Update .gitignore to remove cleared folder patterns
      if (foldersToRemoveFromGitignore.length > 0) {
        await updateGitignoreAfterClear(targetDir, foldersToRemoveFromGitignore)
        this.logDebug('Updated .gitignore')
      }

      // Update IDE settings files to remove method-specific entries
      let updatedClaudeSettings = false
      let updatedWindsurfSettings = false
      if (methodsToRemove.length > 0) {
        const claudeResult = await updateIdeSettings(targetDir, IDE_FOLDERS.claude, methodsToRemove)
        if (claudeResult.updated) {
          this.logDebug('Updated .claude/settings.json (backup created)')
          updatedClaudeSettings = true
        }

        const windsurfResult = await updateIdeSettings(targetDir, IDE_FOLDERS.windsurf, methodsToRemove)
        if (windsurfResult.updated) {
          this.logDebug('Updated .windsurf/hooks.json (backup created)')
          updatedWindsurfSettings = true
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

      if (removedClaudeDir) {
        parts.push(`${IDE_FOLDERS.claude.root}/ folder`)
      }

      if (removedWindsurfDir) {
        parts.push(`${IDE_FOLDERS.windsurf.root}/ folder`)
      }

      this.logSuccess(`Cleared: ${parts.join(', ')}.`)

      if (foldersToRemoveFromGitignore.length > 0) {
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
   * Find all IDE method folders (e.g., .claude/commands/{method}/, .claude/skills/{method}/).
   * Searches within IDE configuration folders for method-specific subfolders.
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template/method name to filter by
   * @returns Array of IDE method folder paths
   */
  private async findIdeMethodFolders(targetDir: string, template?: string): Promise<string[]> {
    // Build list of all subfolder paths to check
    const subfolderChecks: {ideRoot: string; subfolder: string}[] = []

    for (const ide of Object.values(IDE_FOLDERS)) {
      const ideRoot = join(targetDir, ide.root)
      for (const subfolder of ide.methodSubfolders) {
        subfolderChecks.push({ideRoot, subfolder})
      }
    }

    // Check all subfolders in parallel
    const subfolderResults = await Promise.all(
      subfolderChecks.map(async ({ideRoot, subfolder}) => {
        const subfolderPath = join(ideRoot, subfolder)

        try {
          const stat = await fs.stat(subfolderPath)
          if (!stat.isDirectory()) return []

          const entries = await fs.readdir(subfolderPath, {withFileTypes: true})
          return entries
            .filter((entry) => entry.isDirectory())
            .filter((entry) => !template || entry.name === template)
            .map((entry) => join(subfolderPath, entry.name))
        } catch {
          return []
        }
      }),
    )

    return subfolderResults.flat()
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
}
