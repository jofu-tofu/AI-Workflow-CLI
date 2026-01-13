import {promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../lib/base-command.js'
import {
  parseTemplate,
  ClaudeCodeAdapter,
  WindsurfAdapter,
} from '../../lib/template-mapper/index.js'
import type {
  Platform,
  PlatformAdapter,
  TransformationResult,
  TransformationWarning,
} from '../../lib/template-mapper/types.js'
import {EXIT_CODES} from '../../types/exit-codes.js'

/**
 * Supported platform targets for conversion
 */
const SUPPORTED_PLATFORMS: Platform[] = ['claude-code', 'windsurf']

/**
 * Get adapter instance for a platform
 */
function getAdapter(platform: Platform): PlatformAdapter {
  switch (platform) {
    case 'claude-code': {
      return new ClaudeCodeAdapter()
    }

    case 'windsurf': {
      return new WindsurfAdapter()
    }

    default: {
      throw new Error(`Unsupported platform: ${platform}`)
    }
  }
}

/**
 * Format a warning for display
 */
function formatWarning(warning: TransformationWarning): string {
  const prefix = `[${warning.category}]`
  let message = `${prefix} ${warning.message}`
  if (warning.field) {
    message += ` (field: ${warning.field})`
  }

  if (warning.details) {
    message += `\n    ${warning.details}`
  }

  return message
}

/**
 * Convert templates between AI assistant platform formats.
 *
 * Takes a template file written in the standard superset format and converts
 * it to platform-specific formats for Claude Code or Windsurf.
 */
export default class Convert extends BaseCommand {
  static override args = {
    source: Args.file({
      description: 'Path to template file to convert',
      required: true,
    }),
  }

  static override description = 'Convert templates between AI assistant platform formats'

  static override examples = [
    '<%= config.bin %> <%= command.id %> template.md --to claude-code',
    '<%= config.bin %> <%= command.id %> template.md --to windsurf',
    '<%= config.bin %> <%= command.id %> template.md --to claude-code --to windsurf',
    '<%= config.bin %> <%= command.id %> template.md --to claude-code --output ./output',
    '<%= config.bin %> <%= command.id %> template.md --to windsurf --dry-run',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    'dry-run': Flags.boolean({
      description: 'Show what would be generated without writing files',
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory (default: current directory)',
      default: '.',
    }),
    strict: Flags.boolean({
      description: 'Fail on any incompatibility instead of generating warnings',
      default: false,
    }),
    to: Flags.string({
      char: 't',
      description: 'Target platform(s): claude-code, windsurf',
      multiple: true,
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Convert)
    const sourcePath = resolve(args.source)
    const outputDir = resolve(flags.output)
    const dryRun = flags['dry-run']
    const strict = flags.strict
    const targetPlatforms = flags.to as Platform[]

    // Validate target platforms
    for (const platform of targetPlatforms) {
      if (!SUPPORTED_PLATFORMS.includes(platform)) {
        this.logError(`Unsupported platform: ${platform}`)
        this.logInfo(`Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`)
        this.exit(EXIT_CODES.INVALID_USAGE)
      }
    }

    // Parse the source template
    const spinner = this.spinner(`Parsing ${args.source}`)
    spinner.start()

    let template
    try {
      template = await parseTemplate(sourcePath)
      spinner.succeed('Template parsed successfully')
    } catch (error) {
      spinner.fail('Failed to parse template')
      this.logError((error as Error).message)
      this.exit(EXIT_CODES.INVALID_USAGE)
    }

    this.logDebug(`Parsed template: ${template.metadata.name || 'unnamed'}`)
    this.logDebug(`Description: ${template.metadata.description || 'none'}`)

    // Convert to each target platform
    const results: Map<Platform, TransformationResult> = new Map()
    let totalWarnings = 0
    let totalFiles = 0
    let hasErrors = false

    for (const platform of targetPlatforms) {
      const platformSpinner = this.spinner(`Converting to ${platform}`)
      platformSpinner.start()

      const adapter = getAdapter(platform)
      const result = adapter.transform(template, {
        outputDir,
        strict,
      })

      results.set(platform, result)

      if (!result.success) {
        platformSpinner.fail(`Failed to convert to ${platform}`)
        if (result.error) {
          this.logError(result.error)
        }

        hasErrors = true
        continue
      }

      totalWarnings += result.warnings.length
      totalFiles += result.files.size

      platformSpinner.succeed(`Converted to ${platform}: ${result.files.size} file(s)`)

      // Show warnings
      if (result.warnings.length > 0) {
        this.logInfo('')
        this.logWarning(`${result.warnings.length} warning(s) for ${platform}:`)
        for (const warning of result.warnings) {
          this.logWarning(formatWarning(warning))
        }
      }

      // Write or display files
      if (dryRun) {
        this.logInfo('')
        this.logInfo(`Would generate files for ${platform}:`)
        for (const [path] of result.files) {
          this.logInfo(`  ${path}`)
        }
      } else {
        // Write files
        for (const [relativePath, content] of result.files) {
          const fullPath = join(outputDir, relativePath)
          const dir = dirname(fullPath)

          // Ensure directory exists
          await fs.mkdir(dir, {recursive: true})

          // Write file
          await fs.writeFile(fullPath, content, 'utf8')
          this.logDebug(`Wrote: ${fullPath}`)
        }

        this.logInfo(`Generated ${result.files.size} file(s) for ${platform}`)
      }
    }

    // Summary
    this.logInfo('')
    if (hasErrors && strict) {
      this.logError('Conversion failed with errors')
      this.exit(EXIT_CODES.GENERAL_ERROR)
    }

    if (dryRun) {
      this.logSuccess(`Dry run complete: Would generate ${totalFiles} file(s) with ${totalWarnings} warning(s)`)
    } else {
      this.logSuccess(`Conversion complete: Generated ${totalFiles} file(s) with ${totalWarnings} warning(s)`)
    }

    // List all generated files
    this.logInfo('')
    this.logInfo('Generated files:')
    for (const [platform, result] of results) {
      if (result.success) {
        for (const [path] of result.files) {
          this.logInfo(`  [${platform}] ${path}`)
        }
      }
    }
  }
}
