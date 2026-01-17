import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {EXIT_CODES} from '../types/exit-codes.js'

/**
 * Clean output folder(s) for methods.
 * Removes all files and subdirectories from the method's output folder.
 */
export default class CleanCommand extends BaseCommand {
  static override description = 'Clean output folder(s) for a specific method or all methods'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --method bmad',
    '<%= config.bin %> <%= command.id %> -m gsd',
    '<%= config.bin %> <%= command.id %> --all',
    '<%= config.bin %> <%= command.id %> -a --dry-run',
    '<%= config.bin %> <%= command.id %> --method planning-with-files --dry-run',
    '<%= config.bin %> <%= command.id %> -m bmad --force',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    all: Flags.boolean({
      char: 'a',
      description: 'Clean all output folders',
      default: false,
      exclusive: ['method'],
    }),
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
    method: Flags.string({
      char: 'm',
      description: 'Method name whose output folder to clean (e.g., bmad, gsd)',
      exclusive: ['all'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(CleanCommand)
    const targetDir = process.cwd()

    // Validate: require either --method or --all
    if (!flags.method && !flags.all) {
      this.error('Either --method or --all is required.', {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }

    try {
      // Find output folders to clean
      const outputFolders = flags.all
        ? await this.findAllOutputFolders(targetDir)
        : [`_${flags.method}-output`]

      if (outputFolders.length === 0) {
        this.logInfo('No output folders found.')
        return
      }

      // Collect contents from all folders
      const allContents: {folder: string; items: {isDirectory: boolean; path: string}[]}[] = []
      let totalItems = 0

      for (const folder of outputFolders) {
        const folderPath = join(targetDir, folder)
        const stat = await fs.stat(folderPath).catch(() => null)

        if (stat?.isDirectory()) {
          const items = await this.getContents(folderPath)
          if (items.length > 0) {
            allContents.push({folder, items})
            totalItems += items.length
          }
        } else if (!flags.all) {
          // Only show "does not exist" for single method mode
          this.logInfo(`Output folder '${folder}' does not exist.`)
          return
        }
      }

      if (totalItems === 0) {
        const msg = flags.all ? 'All output folders are empty.' : `Output folder '${outputFolders[0]}' is already empty.`
        this.logInfo(msg)
        return
      }

      // Show what will be deleted
      this.log('')
      this.logInfo(`Found ${totalItems} item(s) in ${allContents.length} output folder(s):`)
      this.log('')

      for (const {folder, items} of allContents) {
        for (const item of items) {
          const relativePath = item.path.replace(targetDir + '\\', '').replace(targetDir + '/', '')
          const suffix = item.isDirectory ? '/' : ''
          this.log(`  ${relativePath}${suffix}`)
        }
      }

      this.log('')

      // Dry run - just show files without deleting
      if (flags['dry-run']) {
        this.logInfo('Dry run complete. No files were deleted.')
        return
      }

      // Confirm deletion
      if (!flags.force) {
        const folderNames = allContents.map((c) => c.folder).join(', ')
        const shouldDelete = await confirm({
          message: `Delete all contents of ${allContents.length > 1 ? 'folders: ' : ''}${folderNames}?`,
          default: false,
        })

        if (!shouldDelete) {
          this.log('Operation cancelled.')
          return
        }
      }

      // Delete all contents
      let deletedCount = 0
      for (const {items} of allContents) {
        for (const item of items) {
          try {
            await fs.rm(item.path, {recursive: true, force: true})
            this.logDebug(`Deleted: ${item.path}`)
            deletedCount++
          } catch (error) {
            const err = error as NodeJS.ErrnoException
            this.logWarning(`Failed to delete ${item.path}: ${err.message}`)
          }
        }
      }

      this.log('')
      const firstFolder = allContents[0]
      const folderSummary = allContents.length === 1 && firstFolder ? `'${firstFolder.folder}'` : `${allContents.length} folders`
      this.logSuccess(`Cleaned ${folderSummary}: ${deletedCount} item(s) deleted.`)
    } catch (error) {
      const err = error as NodeJS.ErrnoException

      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied. ${err.message}`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      this.error(`Clean failed: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }
  }

  /**
   * Find all output folders in the target directory.
   * Matches folders with pattern _*-output (e.g., _bmad-output, _gsd-output).
   *
   * @param targetDir - Directory to search in
   * @returns Array of output folder names
   */
  private async findAllOutputFolders(targetDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(targetDir, {withFileTypes: true})
      return entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('_') && entry.name.endsWith('-output'))
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  /**
   * Get all top-level contents of a directory.
   *
   * @param dirPath - Directory to list contents of
   * @returns Array of content items with path and type info
   */
  private async getContents(dirPath: string): Promise<{isDirectory: boolean; path: string}[]> {
    try {
      const entries = await fs.readdir(dirPath, {withFileTypes: true})
      return entries.map((entry) => ({
        isDirectory: entry.isDirectory(),
        path: join(dirPath, entry.name),
      }))
    } catch {
      return []
    }
  }
}
