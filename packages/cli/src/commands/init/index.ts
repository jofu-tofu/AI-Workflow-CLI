import {promises as fs} from 'node:fs'
import {basename, join} from 'node:path'

import {checkbox, confirm, input, select} from '@inquirer/prompts'
import {Flags} from '@oclif/core'

import BaseCommand from '../../lib/base-command.js'
import {detectUsername, generateBmadConfigs} from '../../lib/bmad-installer.js'
import {updateGitignore} from '../../lib/gitignore-manager.js'
import {mergeClaudeSettings} from '../../lib/hooks-merger.js'
import {getTargetSettingsFile, readClaudeSettings, writeClaudeSettings} from '../../lib/settings-hierarchy.js'
import {checkTemplateStatus, installTemplate} from '../../lib/template-installer.js'
import {getAvailableTemplates, getTemplatePath} from '../../lib/template-resolver.js'
import {getTargetHooksFile, readWindsurfHooks, writeWindsurfHooks} from '../../lib/windsurf-hooks-hierarchy.js'
import {mergeWindsurfHooks} from '../../lib/windsurf-hooks-merger.js'
import {EXIT_CODES} from '../../types/exit-codes.js'

/**
 * Available IDEs for configuration
 */
const AVAILABLE_IDES = [
  {value: 'claude', name: 'Claude Code', description: 'Anthropic Claude Code CLI'},
  {value: 'windsurf', name: 'Windsurf', description: 'Codeium Windsurf IDE'},
]

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
  confirmed: boolean
  ides: string[]
  method: string
  projectName: string
  username: string
}

/**
 * Initialize AIW tools and integrations with specified template method.
 */
export default class Init extends BaseCommand {
  static override description = 'Initialize AIW tools and integrations with specified template method'
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

      // Get template path
      const templatePath = await getTemplatePath(method)

      // Check what already exists vs what's missing
      const status = await checkTemplateStatus(templatePath, targetDir, ides, method)

      this.logInfo(`Installing ${method} template for project: ${projectName}`)
      this.logInfo(`Detected user: ${username}`)
      this.logInfo(`Target IDEs: ${ides.join(', ')}`)

      // Report existing items
      if (status.existing.length > 0) {
        this.log('')
        this.logInfo('Already present (will be skipped):')
        for (const item of status.existing) {
          const suffix = item.isDirectory ? '/' : ''
          this.log(`  - ${item.name}${suffix}`)
        }
      }

      // Report missing items that will be installed
      if (status.missing.length > 0) {
        this.log('')
        this.logInfo('Will be installed:')
        for (const item of status.missing) {
          const suffix = item.isDirectory ? '/' : ''
          this.log(`  - ${item.name}${suffix}`)
        }
      }

      // If everything already exists, report and continue (don't block)
      if (status.missing.length === 0) {
        this.log('')
        this.logInfo('All template items already exist. Nothing new to install.')
        this.log('')
        // Still update gitignore and merge hooks if needed
      }

      this.log('')

      // Install template with selective installation (skip existing items)
      const result = await installTemplate(
        {
          templateName: method,
          targetDir,
          ides,
          username,
          projectName,
          templatePath,
        },
        true, // skipExisting = true for regeneration support
      )

      // BMAD-specific post-install: generate custom config files
      if (method === 'bmad') {
        await generateBmadConfigs(targetDir, username, projectName)
        this.logSuccess('✓ Configuration files generated')
      }

      // Collect all folders that need gitignore entries
      // The .aiwcli/ container holds all template infrastructure and runtime data
      const foldersForGitignore: string[] = ['.aiwcli']

      // BMAD-specific: add external output directories to gitignore
      if (method === 'bmad') {
        foldersForGitignore.push('_bmad-output', 'bmad-output', '**/bmad-output')
      }

      // Report installation results
      if (result.installedFolders.length > 0) {
        this.logSuccess(`✓ Installed: ${result.installedFolders.join(', ')}`)
      }

      if (result.mergedFolders.length > 0) {
        this.logSuccess(`✓ Merged content into: ${result.mergedFolders.join(', ')} (${result.mergedFileCount} files)`)
      }

      if (result.skippedFolders.length > 0) {
        this.logInfo(`✓ Skipped (already exist): ${result.skippedFolders.join(', ')}`)
      }

      if (result.sharedSettingsMerged) {
        this.logSuccess(`✓ Merged shared settings into .claude/settings.json`)
      }

      // Merge hooks if Claude IDE is selected
      if (flags.ide.includes('claude')) {
        await this.mergeTemplateHooks(targetDir, templatePath)
      }

      // Merge hooks if Windsurf IDE is selected
      if (flags.ide.includes('windsurf')) {
        await this.mergeWindsurfTemplateHooks(targetDir, templatePath)
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
      this.logInfo('  aiw launch    Start Claude Code with agents')
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

  /**
   * Merge Windsurf template hooks into project hooks
   *
   * @param targetDir - Project directory
   * @param templatePath - Template source path
   */
  private async mergeWindsurfTemplateHooks(targetDir: string, templatePath: string): Promise<void> {
    try {
      // Read template hooks
      const templateHooksPath = join(templatePath, '.windsurf', 'hooks.json')
      const templateHooks = await readWindsurfHooks(templateHooksPath)

      // If template has no hooks, nothing to merge
      if (!templateHooks || !templateHooks.hooks || Object.keys(templateHooks.hooks).length === 0) {
        this.logInfo('No Windsurf hooks in template to merge')
        return
      }

      // Get target hooks file path
      const targetHooksPath = getTargetHooksFile(targetDir)

      // Read existing project hooks
      const existingHooks = await readWindsurfHooks(targetHooksPath)

      // Merge hooks
      const mergedHooks = mergeWindsurfHooks(existingHooks, templateHooks)

      // Write merged hooks
      await writeWindsurfHooks(targetHooksPath, mergedHooks)

      this.logSuccess('✓ Windsurf template hooks merged into project hooks')
    } catch (error) {
      const err = error as Error
      this.warn(`Failed to merge Windsurf template hooks: ${err.message}`)
      // Don't fail the entire installation if hook merging fails
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
    this.log('│     AIW Interactive Setup Wizard        │')
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
}
