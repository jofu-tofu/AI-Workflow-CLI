import {promises as fs} from 'node:fs'
import {basename, join} from 'node:path'

import {Flags} from '@oclif/core'

import {detectUsername, generateBmadConfigs} from '../../lib/bmad-installer.js'
import {updateGitignore} from '../../lib/gitignore-manager.js'
import {installTemplate} from '../../lib/template-installer.js'
import {getAvailableTemplates, getTemplatePath} from '../../lib/template-resolver.js'
import {EXIT_CODES} from '../../types/exit-codes.js'
import BaseCommand from '../base.js'

/**
 * Detect if a template is already installed in the given directory.
 * Checks for common template folders like _bmad, GSR, etc.
 */
async function detectExistingInstallation(targetDir: string): Promise<boolean> {
  // Check for common template folders
  const commonFolders = ['_bmad', 'GSR', '_gsr']

  const checks = commonFolders.map(async (folder) => {
    try {
      const folderPath = join(targetDir, folder)
      await fs.access(folderPath)
      return true
    } catch {
      return false
    }
  })

  const results = await Promise.all(checks)
  return results.some(Boolean)
}

/**
 * Detect if current directory is a git repository.
 * Checks for .git directory existence.
 */
async function detectGitRepository(targetDir: string): Promise<boolean> {
  try {
    const gitPath = join(targetDir, '.git')
    await fs.access(gitPath)
    return true
  } catch {
    return false
  }
}

/**
 * Extract project name from directory path.
 * Returns the basename of the given directory.
 */
function detectProjectName(targetDir: string): string {
  return basename(targetDir)
}

/**
 * Initialize PAI tools and integrations with specified template method.
 */
export default class Init extends BaseCommand {
  static override description = 'Initialize PAI tools and integrations with specified template method'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --method bmad',
    '<%= config.bin %> <%= command.id %> --method bmad --ide windsurf',
    '<%= config.bin %> <%= command.id %> --method bmad --ide claude --ide windsurf',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    method: Flags.string({
      char: 'm',
      description: 'Template method to initialize',
      required: true,
    }),
    ide: Flags.string({
      char: 'i',
      default: ['claude'],
      description: 'IDEs to configure (specify multiple: --ide claude --ide windsurf)',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Init)
    const targetDir = process.cwd()

    try {
      // Validate template exists
      const availableTemplates = await getAvailableTemplates()
      if (!availableTemplates.includes(flags.method)) {
        this.error(`Template '${flags.method}' not found. Available templates: ${availableTemplates.join(', ')}`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      // Check if template already installed
      const exists = await detectExistingInstallation(targetDir)
      if (exists) {
        this.warn('Template already installed in this directory.')
        this.log('To reinstall, remove the template directory first.')
        return
      }

      // Validate write permissions
      try {
        const testFile = join(targetDir, '.aiwcli-write-test')
        await fs.writeFile(testFile, '', 'utf8')
        await fs.unlink(testFile)
      } catch {
        this.error('Permission denied. Cannot write to current directory.', {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      // Detect configuration values
      const username = await detectUsername()
      const projectName = detectProjectName(targetDir)
      const hasGit = await detectGitRepository(targetDir)

      this.logInfo(`Installing ${flags.method} template for project: ${projectName}`)
      this.logInfo(`Detected user: ${username}`)
      this.logInfo(`Installing IDEs: ${flags.ide.join(', ')}`)

      // Get template path
      const templatePath = await getTemplatePath(flags.method)

      // Install template with IDE selection
      const result = await installTemplate({
        templateName: flags.method,
        targetDir,
        ides: flags.ide,
        username,
        projectName,
        templatePath,
      })

      // BMAD-specific post-install: generate custom config files
      if (flags.method === 'bmad') {
        await generateBmadConfigs(targetDir, username, projectName)
        this.logSuccess('✓ Configuration files generated')
      }

      // Collect all folders that need gitignore entries
      const foldersForGitignore = [...result.installedFolders]

      // BMAD-specific post-install: add output directories to gitignore
      if (flags.method === 'bmad') {
        foldersForGitignore.push('_bmad-output', 'bmad-output', '**/bmad-output')
      }

      this.logSuccess('✓ Template structure installed')
      this.logSuccess(`✓ Installed folders: ${result.installedFolders.join(', ')}`)

      // Update .gitignore if git repository exists
      if (hasGit) {
        await updateGitignore(targetDir, foldersForGitignore)
        this.logSuccess('✓ .gitignore updated')
      }

      this.log('')
      this.logSuccess(`✓ ${flags.method} initialized successfully`)
      this.log('')
      this.logInfo('Next steps:')
      this.logInfo('  pai launch    Start Claude Code with agents')
    } catch (error) {
      const err = error as NodeJS.ErrnoException

      // Categorize errors for better user feedback
      // Check error codes first, then fall back to message matching
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        this.error(`Permission denied. Cannot write to current directory. ${err.message}`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      if (err.code === 'ENOENT' || err.message?.includes('not found') || err.message?.includes('not available')) {
        this.error(err.message || 'Resource not found', {exit: EXIT_CODES.INVALID_USAGE})
      }

      // Generic error fallback
      this.error(`Installation failed: ${err.message}`, {
        exit: EXIT_CODES.GENERAL_ERROR,
      })
    }
  }
}
