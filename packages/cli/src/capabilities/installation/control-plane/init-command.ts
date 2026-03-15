import {promises as fs} from 'node:fs'
import {homedir} from 'node:os'
import {basename, join} from 'node:path'

import checkbox from '@inquirer/checkbox'
import confirm from '@inquirer/confirm'
import input from '@inquirer/input'
import select from '@inquirer/select'
import {Flags} from '@oclif/core'

import BaseCommand from '../../../cli/base-command.js'
import {getCoreResolverSourcePath, installCoreAssets} from '../../../lib/core-installer.js'
import {AIW_EXCLUDE_ENTRIES, resolveGitDir, updateGitExclude} from '../../../lib/git-exclude-manager.js'
import {getInstalledMethods, markCoreInstalled, markMethodInstalled} from '../../../lib/install-state.js'
import {checkTemplateStatus, installTemplate} from '../../../lib/template-installer.js'
import {getAvailableTemplates, getTemplateIdeNamesByPath, getTemplatePath} from '../../../lib/template-resolver.js'
import {reconstructIdeSettings} from '../../../lib/template-settings-reconstructor.js'
import {detectUsername} from '../../../lib/user-utils.js'
import {EXIT_CODES} from '../../../types/exit-codes.js'

/**
 * Available IDEs for configuration
 */
const KNOWN_IDES = [
  {value: 'claude', name: 'Claude Code', description: 'Anthropic Claude Code CLI'},
  {value: 'codex', name: 'Codex CLI', description: 'OpenAI Codex CLI skills'},
  {value: 'cognition', name: 'Cognition', description: 'Cognition (Devin) IDE'},
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

function normalizeIdeList(ides: string[]): string[] {
  const normalized = ides
    .map((ide) => ide.trim().toLowerCase())
    .filter((ide) => ide.length > 0)
  return [...new Set(normalized)]
}

function intersectIdes(requested: string[], available: string[]): string[] {
  const availableSet = new Set(available)
  return requested.filter((ide) => availableSet.has(ide))
}

function differenceIdes(left: string[], right: string[]): string[] {
  const rightSet = new Set(right)
  return left.filter((ide) => !rightSet.has(ide))
}

function toIdeExcludeEntries(ides: string[]): string[] {
  return [...new Set(ides.map((ide) => `.${ide}`))]
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
      description: 'IDEs to configure. When omitted, uses all IDEs discovered in core + selected template',
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

      // Interactive cancellation returns null; undefined means minimal install.
      if (config === null) return
      if (config === undefined) {
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

      // Resolve template + available IDE sets
      const templatePath = await getTemplatePath(method)
      const coreTemplatePath = await getTemplatePath('core')
      const coreAvailableIdes = await getTemplateIdeNamesByPath(coreTemplatePath)
      const methodAvailableIdes = await getTemplateIdeNamesByPath(templatePath)
      const discoveredIdes = [...new Set([...coreAvailableIdes, ...methodAvailableIdes])].sort((a, b) => a.localeCompare(b))
      const requestedIdes = ides.length > 0 ? normalizeIdeList(ides) : discoveredIdes
      const coreIdesToInstall = intersectIdes(requestedIdes, coreAvailableIdes)
      const methodIdesToInstall = intersectIdes(requestedIdes, methodAvailableIdes)

      const coreSkipped = differenceIdes(requestedIdes, coreAvailableIdes)
      if (coreSkipped.length > 0) {
        this.warn(`Skipping core IDEs not available in core: ${coreSkipped.join(', ')}`)
      }

      const methodSkipped = differenceIdes(requestedIdes, methodAvailableIdes)
      if (methodSkipped.length > 0) {
        this.warn(`Skipping method IDEs not available for '${method}': ${methodSkipped.join(', ')}`)
      }

      // Install core runtime first (shared across all methods)
      const coreInstalledFolders = await installCoreAssets(targetDir, coreIdesToInstall)
      await markCoreInstalled(targetDir, coreIdesToInstall)

      // Check what already exists vs what's missing
      const status = await checkTemplateStatus(templatePath, targetDir, methodIdesToInstall, method)

      this.logInfo(`Installing ${method} template for project: ${projectName}`)
      this.logInfo(`Detected user: ${username}`)
      this.logInfo(`Target IDEs (requested): ${requestedIdes.join(', ')}`)
      this.logInfo(`Target IDEs (core): ${coreIdesToInstall.join(', ') || '(none)'}`)
      this.logInfo(`Target IDEs (${method}): ${methodIdesToInstall.join(', ') || '(none)'}`)

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
        ides: methodIdesToInstall,
        username,
        projectName,
        templatePath,
      })

      // Collect all folders that need exclude entries.
      // Include defaults plus all IDE directories actually installed this run.
      const installedIdeExcludes = toIdeExcludeEntries([...coreIdesToInstall, ...methodIdesToInstall])
      const foldersForExclude = [...new Set([...AIW_EXCLUDE_ENTRIES, ...installedIdeExcludes])]
      if (coreInstalledFolders.length > 0) {
        this.logSuccess(`✓ Installed core: ${coreInstalledFolders.join(', ')}`)
      }

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
        ides: [...new Set([...coreIdesToInstall, ...methodIdesToInstall])],
        gitDir,
        foldersForExclude,
      })

      this.log('')
      this.logSuccess(`✓ ${method} initialized successfully`)
      this.log('')
      this.logInfo('Next steps:')
      this.logInfo('  aiw launch    Start Claude Code with agents')
    } catch (error) {
      this.handleRunError(error)
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
      'cc-native': 'CC-Native - Event-sourced context management with plan review',
    }

    return descriptions[template] || 'Custom template'
  }

  private handleRunError(error: unknown): never {
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

    this.error(`Installation failed: ${err.message}`, {
      exit: EXIT_CODES.GENERAL_ERROR,
    })
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
      const resolverSrc = await getCoreResolverSourcePath()

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
   * Perform minimal installation (core runtime only, no template method).
   *
   * @param targetDir - Target directory for installation
   * @param gitDir - Resolved git directory path, or null if not a git repo
   */
  private async performMinimalInstall(targetDir: string, gitDir: null | string): Promise<void> {
    this.logInfo('Performing minimal installation (_core runtime only)...')
    this.log('')

    const coreTemplatePath = await getTemplatePath('core')
    const discoveredCoreIdes = await getTemplateIdeNamesByPath(coreTemplatePath)

    // Install core runtime payload and base IDE shared artifacts
    const installedFolders = await installCoreAssets(targetDir, discoveredCoreIdes)
    await markCoreInstalled(targetDir, discoveredCoreIdes)
    this.logSuccess(`✓ Installed: ${installedFolders.join(', ')}`)

    // Install global resolver for cwd-drift-proof hook/status line commands
    await this.installGlobalResolver()

    // Reconstruct settings from core base plus any existing method templates.
    await reconstructIdeSettings(targetDir, await getInstalledMethods(targetDir), discoveredCoreIdes)

    // Update git exclude if git repository exists
    if (gitDir) {
      const ideExcludeEntries = toIdeExcludeEntries(discoveredCoreIdes)
      await updateGitExclude(gitDir, [...new Set([...AIW_EXCLUDE_ENTRIES, ...ideExcludeEntries])])
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
   * - Method tracking in install-state.json
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

    // Record installation before reconstruction so install-state can drive active templates.
    await markMethodInstalled(targetDir, method, ides)

    // Read installed methods to build the active templates list.
    const activeTemplates = await getInstalledMethods(targetDir)

    // Reconstruct IDE settings from all active templates.
    await reconstructIdeSettings(targetDir, activeTemplates.length > 0 ? activeTemplates : [method], ides)
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
   * @returns Installation configuration, undefined for minimal install, or null if interactive setup was cancelled
   */
  private async resolveInstallationConfig(
    flags: {ide: string[] | undefined; interactive: boolean; method?: string | undefined},
    targetDir: string,
    availableTemplates: string[],
  ): Promise<null | undefined | {ides: string[]; method: string; projectName: string; username: string}> {
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
        ides: normalizeIdeList(flags.ide ?? []),
        username: await detectUsername(),
        projectName: detectProjectName(targetDir),
      }
    }

    // Minimal install mode - install only the core template.
    return undefined
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

    const coreTemplatePath = await getTemplatePath('core')
    const selectedTemplatePath = await getTemplatePath(method)
    const coreAvailableIdes = await getTemplateIdeNamesByPath(coreTemplatePath)
    const methodAvailableIdes = await getTemplateIdeNamesByPath(selectedTemplatePath)
    const discoveredIdes = [...new Set([...coreAvailableIdes, ...methodAvailableIdes])].sort((a, b) => a.localeCompare(b))
    const knownByValue = new Map(KNOWN_IDES.map((ide) => [ide.value, ide]))
    if (discoveredIdes.length === 0) {
      this.error('No IDE integrations were discovered in core or selected template.', {
        exit: EXIT_CODES.ENVIRONMENT_ERROR,
      })
    }

    // Step 2: Select IDEs
    const ides = await checkbox({
      message: 'Select IDEs to configure:',
      choices: discoveredIdes.map((ideName) => {
        const known = knownByValue.get(ideName)
        return {
          value: ideName,
          name: known?.name ?? ideName,
          description: known?.description ?? `Discovered IDE integration (.${ideName}/)`,
          checked: true,
        }
      }),
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
