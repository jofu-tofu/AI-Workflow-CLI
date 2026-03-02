import {promises as fs} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import checkbox from '@inquirer/checkbox'
import confirm from '@inquirer/confirm'
import input from '@inquirer/input'
import select from '@inquirer/select'
import {Flags} from '@oclif/core'

import BaseCommand from '../../lib/base-command.js'
import {AIW_EXCLUDE_ENTRIES, resolveGitDir, updateGitExclude} from '../../lib/git-exclude-manager.js'
import {IdePathResolver} from '../../lib/ide-path-resolver.js'
import {pathExists} from '../../lib/paths.js'
import {getTargetSettingsFile, readClaudeSettings, writeClaudeSettings} from '../../lib/settings-hierarchy.js'
import {checkTemplateStatus, installTemplate, shouldExclude} from '../../lib/template-installer.js'
import {getAvailableTemplates, getTemplatePath} from '../../lib/template-resolver.js'
import {reconstructIdeSettings} from '../../lib/template-settings-reconstructor.js'
import {detectUsername} from '../../lib/user-utils.js'
import {EXIT_CODES} from '../../types/exit-codes.js'

/**
 * Available IDEs for configuration
 */
const AVAILABLE_IDES = [
  {value: 'claude', name: 'Claude Code', description: 'Anthropic Claude Code CLI'},
  {value: 'windsurf', name: 'Windsurf', description: 'Codeium Windsurf IDE'},
]

// detectGitRepository replaced by resolveGitDir from git-exclude-manager

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
    '<%= config.bin %> <%= command.id %> --method cc-native',
    '<%= config.bin %> <%= command.id %> --method cc-native --ide windsurf',
    '<%= config.bin %> <%= command.id %> --method cc-native --ide claude --ide windsurf',
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

      // Check git repository early (needed by both install paths)
      const gitDir = await resolveGitDir(targetDir)

      // Resolve installation configuration from flags or interactive wizard
      const config = await this.resolveInstallationConfig(flags, targetDir, availableTemplates)

      // If config is null, perform minimal install (shared folder only)
      if (!config) {
        await this.performMinimalInstall(targetDir, gitDir)
        return
      }

      const {method, ides, username, projectName} = config

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

      // Install template (always overwrites method-owned content)
      const result = await installTemplate({
        templateName: method,
        targetDir,
        ides,
        username,
        projectName,
        templatePath,
      })

      // Collect all folders that need exclude entries
      // The .aiwcli/ container holds all template infrastructure and runtime data
      const foldersForExclude: string[] = [...AIW_EXCLUDE_ENTRIES]

      // Report installation results
      if (result.installedFolders.length > 0) {
        this.logSuccess(`✓ Installed: ${result.installedFolders.join(', ')}`)
      }

      // Install global resolver for cwd-drift-proof hook/status line commands
      await this.installGlobalResolver()

      // Perform post-installation actions (settings tracking, hook merging, git exclude updates)
      await this.performPostInstallActions({
        targetDir,
        method,
        ides,
        gitDir,
        foldersForExclude,
      })

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
   * Copy directory recursively, excluding test files and cache
   *
   * @param src - Source directory path
   * @param dest - Destination directory path
   * @param excludeIdeFolders - If true, exclude IDE config folders (.claude, .windsurf, etc.)
   */
  private async copyDirectory(src: string, dest: string, excludeIdeFolders: boolean = false): Promise<void> {
    await fs.mkdir(dest, {recursive: true})

    const entries = await fs.readdir(src, {withFileTypes: true})

    const operations = entries
      .filter((entry) => {
        // Standard exclusions (test files, cache, etc.)
        if (shouldExclude(entry.name)) {
          return false
        }

        // Exclude IDE config folders if requested (used for _shared folder)
        // These folders are used for settings merging, not direct installation
        if (excludeIdeFolders && entry.isDirectory() && entry.name.startsWith('.')) {
          return false
        }

        return true
      })
      .map(async (entry) => {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)

        try {
          return entry.isDirectory() ? await this.copyDirectory(srcPath, destPath, excludeIdeFolders) : await fs.copyFile(srcPath, destPath)
        } catch (error) {
          const err = error as Error
          throw new Error(`Failed to copy ${srcPath} to ${destPath}: ${err.message}`)
        }
      })

    await Promise.all(operations)
  }

  /**
   * Get description for a template
   *
   * @param template - Template name
   * @returns Template description
   */
  private getTemplateDescription(template: string): string {
    const descriptions: Record<string, string> = {
      'cc-native': 'CC-Native - Event-sourced context management with plan review',
    }

    return descriptions[template] || 'Custom template'
  }

  /**
   * Install the global resolve-run.ts script to ~/.aiwcli/bin/.
   *
   * This resolver allows hook and status line commands to find the project root
   * regardless of cwd drift (e.g., after `cd` in a Bash tool call).
   * Always overwrites to ensure the latest version is installed.
   */
  private async installGlobalResolver(): Promise<void> {
    try {
      const currentFilePath = fileURLToPath(import.meta.url)
      const currentDir = dirname(currentFilePath)
      const templatesRoot = join(dirname(dirname(currentDir)), 'templates')
      const resolverSrc = join(templatesRoot, '_shared', 'scripts', 'resolve-run.ts')

      const globalBinDir = join(homedir(), '.aiwcli', 'bin')
      const resolverDest = join(globalBinDir, 'resolve-run.ts')

      await fs.mkdir(globalBinDir, {recursive: true})
      await fs.copyFile(resolverSrc, resolverDest)
      this.logSuccess('✓ Global resolver installed (~/.aiwcli/bin/resolve-run.ts)')
    } catch (error) {
      const err = error as Error
      this.warn(`Failed to install global resolver: ${err.message}`)
    }
  }

  /**
   * Perform minimal installation (_shared folder only, no template method).
   *
   * @param targetDir - Target directory for installation
   * @param gitDir - Resolved git directory path, or null if not a git repo
   */
  private async performMinimalInstall(targetDir: string, gitDir: null | string): Promise<void> {
    this.logInfo('Performing minimal installation (_shared folder only)...')
    this.log('')

    // Create .aiwcli container and install _shared
    const resolver = new IdePathResolver(targetDir)
    const containerDir = resolver.getAiwcliContainer()
    await fs.mkdir(containerDir, {recursive: true})

    const sharedDestPath = resolver.getSharedFolder()
    const sharedExists = await pathExists(sharedDestPath)

    if (sharedExists) {
      this.logInfo('✓ _shared folder already exists - skipping')
    } else {
      const currentFilePath = fileURLToPath(import.meta.url)
      const currentDir = dirname(currentFilePath)
      const templatesRoot = join(dirname(dirname(currentDir)), 'templates')
      const sharedSrcPath = join(templatesRoot, '_shared')

      if (!(await pathExists(sharedSrcPath))) {
        this.error(`Shared folder not found at ${sharedSrcPath}. This indicates a corrupted installation.`, {
          exit: EXIT_CODES.ENVIRONMENT_ERROR,
        })
      }

      await this.copyDirectory(sharedSrcPath, sharedDestPath, true)
      this.logSuccess('✓ Installed _shared folder')
    }

    // Install global resolver for cwd-drift-proof hook/status line commands
    await this.installGlobalResolver()

    // Reconstruct settings from _shared template
    await reconstructIdeSettings(targetDir, [], ['claude'])

    // Update git exclude if git repository exists
    if (gitDir) {
      await updateGitExclude(gitDir, [...AIW_EXCLUDE_ENTRIES])
      this.logSuccess('✓ git exclude updated')
    }

    this.log('')
    this.logSuccess('✓ Minimal installation completed successfully')
    this.log('')
    this.logInfo('Next steps:')
    this.logInfo('  aiw init --method <template>    Install a full template method (cc-native)')
    this.logInfo('  aiw init --interactive          Run interactive setup wizard')
  }

  /**
   * Perform post-installation actions.
   *
   * Handles:
   * - Method tracking in settings.json
   * - Settings reconstruction from all active templates
   * - .gitignore updates
   *
   * @param config - Post-install configuration
   * @param config.targetDir - Project directory
   * @param config.method - Method name that was installed
   * @param config.ides - IDEs that were configured
   * @param config.gitDir - Resolved git directory path, or null if not a git repo
   * @param config.foldersForExclude - Folders to add to git exclude
   */
  private async performPostInstallActions(config: {
    foldersForExclude: string[]
    gitDir: null | string
    ides: string[]
    method: string
    targetDir: string
  }): Promise<void> {
    const {targetDir, method, ides, gitDir, foldersForExclude} = config

    // Track method installation in settings.json first (so reconstructor can read methods list)
    await this.trackMethodInstallation(targetDir, method, ides)

    // Read installed methods to build active templates list
    const settingsPath = getTargetSettingsFile(targetDir)
    const settings = await readClaudeSettings(settingsPath)
    const activeTemplates = settings?.methods ? Object.keys(settings.methods) : [method]

    // Reconstruct IDE settings from all active templates
    await reconstructIdeSettings(targetDir, activeTemplates, ides)
    this.logSuccess('✓ Reconstructed IDE settings from active templates')

    // Update git exclude if git repository exists
    if (gitDir) {
      await updateGitExclude(gitDir, foldersForExclude)
      this.logSuccess('✓ git exclude updated')
    }
  }

  /**
   * Resolve installation configuration from flags or interactive wizard.
   *
   * Determines what to install based on:
   * - Interactive wizard input
   * - Command-line flags
   * - Minimal install mode (no method specified)
   *
   * @param flags - Parsed command flags
   * @param flags.interactive - Run interactive wizard
   * @param flags.method - Template method to install
   * @param flags.ide - IDEs to configure
   * @param targetDir - Target directory for installation
   * @param availableTemplates - List of available template names
   * @returns Installation configuration or null for minimal install
   */
  private async resolveInstallationConfig(
    flags: {ide: string[]; interactive: boolean; method?: string | undefined},
    targetDir: string,
    availableTemplates: string[],
  ): Promise<null | {ides: string[]; method: string; projectName: string; username: string}> {
    if (flags.interactive) {
      // Run interactive wizard
      const wizardResult = await this.runInteractiveWizard(targetDir, availableTemplates)

      if (!wizardResult.confirmed) {
        this.log('Installation cancelled.')
        return null
      }

      return {
        method: wizardResult.method,
        ides: wizardResult.ides,
        username: wizardResult.username,
        projectName: wizardResult.projectName,
      }
    }

    if (flags.method) {
      // Use flags (method specified)
      // Validate template exists
      if (!availableTemplates.includes(flags.method)) {
        this.error(`Template '${flags.method}' not found. Available templates: ${availableTemplates.join(', ')}`, {
          exit: EXIT_CODES.INVALID_USAGE,
        })
      }

      return {
        method: flags.method,
        ides: flags.ide,
        username: await detectUsername(),
        projectName: detectProjectName(targetDir),
      }
    }

    // Minimal install mode - install only _shared folder
    return null
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

  /**
   * Track method installation in settings.json
   *
   * Adds method entry to the methods object with installation metadata.
   *
   * @param targetDir - Project directory
   * @param method - Method name being installed
   * @param ides - IDEs configured for this method
   */
  private async trackMethodInstallation(targetDir: string, method: string, ides: string[]): Promise<void> {
    try {
      const settingsPath = getTargetSettingsFile(targetDir)
      const existingSettings = (await readClaudeSettings(settingsPath)) || {}

      // Add method tracking
      const updatedSettings = {
        ...existingSettings,
        methods: {
          ...existingSettings.methods,
          [method]: {
            ides,
            installedAt: new Date().toISOString(),
          },
        },
      }

      await writeClaudeSettings(settingsPath, updatedSettings)
      this.logSuccess(`✓ Method '${method}' tracked in settings.json`)
    } catch (error) {
      const err = error as Error
      this.warn(`Failed to track method installation: ${err.message}`)
    }
  }
}
