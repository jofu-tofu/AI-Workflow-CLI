import {promises as fs} from 'node:fs'
import {basename, join} from 'node:path'

import {Flags} from '@oclif/core'
import {checkbox, confirm, input, select} from '@inquirer/prompts'

import {detectUsername, generateBmadConfigs} from '../../lib/bmad-installer.js'
import {updateGitignore} from '../../lib/gitignore-manager.js'
import {mergeClaudeSettings} from '../../lib/hooks-merger.js'
import {getTargetSettingsFile, readClaudeSettings, writeClaudeSettings} from '../../lib/settings-hierarchy.js'
import {installTemplate} from '../../lib/template-installer.js'
import {getAvailableTemplates, getTemplatePath} from '../../lib/template-resolver.js'
import {EXIT_CODES} from '../../types/exit-codes.js'
import BaseCommand from '../../lib/base-command.js'

/**
 * Available IDEs for configuration
 */
const AVAILABLE_IDES = [
  {value: 'claude', name: 'Claude Code', description: 'Anthropic Claude Code CLI'},
  {value: 'windsurf', name: 'Windsurf', description: 'Codeium Windsurf IDE'},
]

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
 * Interactive wizard configuration result
 */
interface WizardResult {
  method: string
  ides: string[]
  username: string
  projectName: string
  confirmed: boolean
}

/**
 * Initialize PAI tools and integrations with specified template method.
 */
export default class Init extends BaseCommand {
  static override description = 'Initialize PAI tools and integrations with specified template method'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --interactive',
    '<%= config.bin %> <%= command.id %> --method bmad',
    '<%= config.bin %> <%= command.id %> --method bmad --ide windsurf',
    '<%= config.bin %> <%= command.id %> --method bmad --ide claude --ide windsurf',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    interactive: Flags.boolean({
      char: 'I',
      description: 'Run interactive setup wizard',
      default: false,
    }),
    method: Flags.string({
      char: 'm',
      description: 'Template method to initialize',
      required: false,
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
      // Get available templates for validation
      const availableTemplates = await getAvailableTemplates()

      // Determine configuration: interactive or flags
      let method: string
      let ides: string[]
      let username: string
      let projectName: string

      if (flags.interactive) {
        // Run interactive wizard
        const wizardResult = await this.runInteractiveWizard(targetDir, availableTemplates)

        if (!wizardResult.confirmed) {
          this.log('Installation cancelled.')
          return
        }

        method = wizardResult.method
        ides = wizardResult.ides
        username = wizardResult.username
        projectName = wizardResult.projectName
      } else {
        // Use flags (require method in non-interactive mode)
        if (!flags.method) {
          this.error('Template method is required. Use --method <template> or --interactive for guided setup.', {
            exit: EXIT_CODES.INVALID_USAGE,
          })
        }

        // Validate template exists
        if (!availableTemplates.includes(flags.method)) {
          this.error(`Template '${flags.method}' not found. Available templates: ${availableTemplates.join(', ')}`, {
            exit: EXIT_CODES.INVALID_USAGE,
          })
        }

        method = flags.method
        ides = flags.ide
        username = await detectUsername()
        projectName = detectProjectName(targetDir)
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

      const hasGit = await detectGitRepository(targetDir)

      this.logInfo(`Installing ${method} template for project: ${projectName}`)
      this.logInfo(`Detected user: ${username}`)
      this.logInfo(`Installing IDEs: ${ides.join(', ')}`)

      // Get template path
      const templatePath = await getTemplatePath(method)

      // Install template with IDE selection
      const result = await installTemplate({
        templateName: method,
        targetDir,
        ides,
        username,
        projectName,
        templatePath,
      })

      // BMAD-specific post-install: generate custom config files
      if (method === 'bmad') {
        await generateBmadConfigs(targetDir, username, projectName)
        this.logSuccess('✓ Configuration files generated')
      }

      // Collect all folders that need gitignore entries
      const foldersForGitignore = [...result.installedFolders]

      // BMAD-specific post-install: add output directories to gitignore
      if (method === 'bmad') {
        foldersForGitignore.push('_bmad-output', 'bmad-output', '**/bmad-output')
      }

      this.logSuccess('✓ Template structure installed')
      this.logSuccess(`✓ Installed folders: ${result.installedFolders.join(', ')}`)

      // Merge hooks if Claude IDE is selected
      if (flags.ide.includes('claude')) {
        await this.mergeTemplateHooks(targetDir, templatePath)
      }

      // Update .gitignore if git repository exists
      if (hasGit) {
        await updateGitignore(targetDir, foldersForGitignore)
        this.logSuccess('✓ .gitignore updated')
      }

      this.log('')
      this.logSuccess(`✓ ${method} initialized successfully`)
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

  /**
   * Run interactive setup wizard
   *
   * @param targetDir - Target directory for installation
   * @param availableTemplates - List of available template names
   * @returns Wizard configuration result
   */
  private async runInteractiveWizard(targetDir: string, availableTemplates: string[]): Promise<WizardResult> {
    this.log('')
    this.log('┌─────────────────────────────────────────┐')
    this.log('│     PAI Interactive Setup Wizard        │')
    this.log('└─────────────────────────────────────────┘')
    this.log('')

    // Detect defaults
    const detectedUsername = await detectUsername()
    const detectedProjectName = detectProjectName(targetDir)

    // Step 1: Select template method
    const method = await select({
      message: 'Select a template method:',
      choices: availableTemplates.map((template) => ({
        value: template,
        name: template.toUpperCase(),
        description: this.getTemplateDescription(template),
      })),
    })

    this.log('')

    // Step 2: Select IDEs
    const ides = await checkbox({
      message: 'Select IDEs to configure:',
      choices: AVAILABLE_IDES.map((ide) => ({
        value: ide.value,
        name: ide.name,
        checked: ide.value === 'claude', // Default to Claude selected
      })),
      required: true,
    })

    this.log('')

    // Step 3: Confirm/edit username
    const username = await input({
      message: 'Username:',
      default: detectedUsername,
    })

    // Step 4: Confirm/edit project name
    const projectName = await input({
      message: 'Project name:',
      default: detectedProjectName,
    })

    this.log('')

    // Step 5: Summary and confirmation
    this.log('┌─────────────────────────────────────────┐')
    this.log('│           Installation Summary          │')
    this.log('├─────────────────────────────────────────┤')
    this.log(`│  Template:     ${method.padEnd(24)}│`)
    this.log(`│  IDEs:         ${ides.join(', ').padEnd(24)}│`)
    this.log(`│  Username:     ${username.padEnd(24)}│`)
    this.log(`│  Project:      ${projectName.padEnd(24)}│`)
    this.log(`│  Directory:    ${basename(targetDir).padEnd(24)}│`)
    this.log('└─────────────────────────────────────────┘')
    this.log('')

    const confirmed = await confirm({
      message: 'Proceed with installation?',
      default: true,
    })

    return {
      method,
      ides,
      username,
      projectName,
      confirmed,
    }
  }

  /**
   * Get description for a template
   *
   * @param template - Template name
   * @returns Template description
   */
  private getTemplateDescription(template: string): string {
    const descriptions: Record<string, string> = {
      bmad: 'BMAD Method - AI-driven development workflow with agents',
      gsd: 'GSD Method - Get Stuff Done project management',
    }
    return descriptions[template] || 'Custom template'
  }

  /**
   * Merge template hooks into project settings
   *
   * @param targetDir - Project directory
   * @param templatePath - Template source path
   */
  private async mergeTemplateHooks(targetDir: string, templatePath: string): Promise<void> {
    try {
      // Read template settings
      const templateSettingsPath = join(templatePath, '.claude', 'settings.json')
      const templateSettings = await readClaudeSettings(templateSettingsPath)

      // If template has no settings or no hooks, nothing to merge
      if (!templateSettings || !templateSettings.hooks || Object.keys(templateSettings.hooks).length === 0) {
        this.logInfo('No hooks in template to merge')
        return
      }

      // Get target settings file path
      const targetSettingsPath = getTargetSettingsFile(targetDir)

      // Read existing project settings
      const existingSettings = await readClaudeSettings(targetSettingsPath)

      // Merge settings
      const mergedSettings = mergeClaudeSettings(existingSettings, templateSettings)

      // Write merged settings
      await writeClaudeSettings(targetSettingsPath, mergedSettings)

      this.logSuccess('✓ Template hooks merged into project settings')
    } catch (error) {
      const err = error as Error
      this.warn(`Failed to merge template hooks: ${err.message}`)
      // Don't fail the entire installation if hook merging fails
    }
  }
}
