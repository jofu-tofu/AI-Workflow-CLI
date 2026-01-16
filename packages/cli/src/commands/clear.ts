import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/exit-codes.js'

/**
 * Known output folder patterns for templates.
 * These folders contain generated Markdown files that can be safely cleared.
 */
const OUTPUT_FOLDER_PATTERNS = new Set([
  '_bmad-output',
  '_gsd-output',
  '_planning-with-files-output',
])

/**
 * Recursively scan a directory for Markdown files.
 * Uses Promise.all for parallel processing at each level.
 *
 * @param dir - Directory to scan
 * @returns Array of Markdown file paths
 */
async function scanDirectoryForMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, {withFileTypes: true})
    const subDirs: string[] = []
    const mdFiles: string[] = []

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        subDirs.push(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath)
      }
    }

    // Recursively scan subdirectories in parallel
    const subResults = await Promise.all(subDirs.map((subDir) => scanDirectoryForMarkdown(subDir)))

    return [...mdFiles, ...subResults.flat()]
  } catch {
    return []
  }
}

/**
 * Clear all Markdown files from output folders.
 */
export default class ClearCommand extends BaseCommand {
  static override description = 'Clear all Markdown files from output folders'
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
      description: 'Clear only a specific template output folder (e.g., bmad, gsd, planning-with-files)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ClearCommand)
    const targetDir = process.cwd()

    try {
      // Find all output folders (optionally filtered by template)
      const outputFolders = await this.findOutputFolders(targetDir, flags.template)

      if (outputFolders.length === 0) {
        const msg = flags.template
          ? `No output folder found for template '${flags.template}'.`
          : 'No output folders found.'
        this.logInfo(msg)
        return
      }

      // Collect all Markdown files to delete
      const filesArrays = await Promise.all(
        outputFolders.map((folder) => this.findMarkdownFiles(folder)),
      )
      const filesToDelete = filesArrays.flat()

      if (filesToDelete.length === 0) {
        this.logInfo('No Markdown files found in output folders.')
        return
      }

      // Show what will be deleted
      this.log('')
      this.logInfo(`Found ${filesToDelete.length} Markdown file(s) in ${outputFolders.length} output folder(s):`)
      this.log('')

      for (const file of filesToDelete) {
        const relativePath = file.replace(targetDir + '\\', '').replace(targetDir + '/', '')
        this.log(`  ${relativePath}`)
      }

      this.log('')

      // Dry run - just show files without deleting
      if (flags['dry-run']) {
        this.logInfo('Dry run complete. No files were deleted.')
        return
      }

      // Confirm deletion
      if (!flags.force) {
        const shouldDelete = await confirm({
          message: `Delete ${filesToDelete.length} file(s)?`,
          default: false,
        })

        if (!shouldDelete) {
          this.log('Operation cancelled.')
          return
        }
      }

      // Delete files in parallel
      const deleteResults = await Promise.all(
        filesToDelete.map(async (file) => {
          try {
            await fs.unlink(file)
            this.logDebug(`Deleted: ${file}`)
            return true
          } catch (error) {
            const err = error as NodeJS.ErrnoException
            this.logWarning(`Failed to delete ${file}: ${err.message}`)
            return false
          }
        }),
      )
      const deletedCount = deleteResults.filter(Boolean).length

      this.log('')
      this.logSuccess(`Deleted ${deletedCount} file(s).`)
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
   * Find all Markdown files in a folder (recursively).
   *
   * @param folderPath - Folder to search in
   * @returns Array of Markdown file paths
   */
  private async findMarkdownFiles(folderPath: string): Promise<string[]> {
    return scanDirectoryForMarkdown(folderPath)
  }

  /**
   * Find all output folders in the target directory.
   *
   * @param targetDir - Directory to search in
   * @param template - Optional template name to filter by (e.g., 'bmad', 'gsd')
   * @returns Array of output folder paths
   */
  private async findOutputFolders(targetDir: string, template?: string): Promise<string[]> {
    const foundFolders: string[] = []

    // If template specified, only look for that specific output folder
    if (template) {
      const expectedFolder = `_${template}-output`
      const folderPath = join(targetDir, expectedFolder)
      try {
        const stat = await fs.stat(folderPath)
        if (stat.isDirectory()) {
          return [folderPath]
        }
      } catch {
        // Folder doesn't exist
      }

      return []
    }

    // No template filter - find all output folders
    try {
      const entries = await fs.readdir(targetDir, {withFileTypes: true})

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const {name} = entry

        // Check if it matches known output folder patterns
        if (OUTPUT_FOLDER_PATTERNS.has(name)) {
          foundFolders.push(join(targetDir, name))
          continue
        }

        // Also match any folder ending with '-output'
        if (name.endsWith('-output') && name.startsWith('_')) {
          foundFolders.push(join(targetDir, name))
        }
      }
    } catch {
      // Directory doesn't exist or can't be read - return empty
    }

    return foundFolders
  }
}
