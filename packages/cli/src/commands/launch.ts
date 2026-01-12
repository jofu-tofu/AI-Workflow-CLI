import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {spawnProcess} from '../lib/spawn.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code with PAI configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * enabling unattended execution. Designed for PAI hook system safety guardrails
 * (requires pai setup - Story 2.7). Supports multiple parallel sessions.
 */
export default class LaunchCommand extends BaseCommand {
  static override description =
    'Launch Claude Code with PAI configuration (sandbox disabled, supports parallel sessions)\n\n' +
    'EXIT CODES\n' +
    '  0  Success - Claude Code launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - Claude Code not found (install from https://claude.ai/download)'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --debug  # Enable verbose logging',
    '# Check exit code in Bash\n<%= config.bin %> <%= command.id %>\necho $?',
    '# Check exit code in PowerShell\n<%= config.bin %> <%= command.id %>\necho $LASTEXITCODE',
  ]

  async run(): Promise<void> {
    let exitCode: number

    try {
      // Check Claude Code version compatibility (non-blocking)
      const version = await getClaudeCodeVersion()
      const versionCheck = checkVersionCompatibility(version)

      // Debug logging: show version information
      this.debug(`Claude Code version: ${versionCheck.version ?? 'unknown'}`)
      this.debug(`Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`)

      // Non-blocking warning for incompatibility or unknown version
      if (versionCheck.warning) {
        this.warn(versionCheck.warning)
      }

      // Spawn Claude Code with sandbox permissions disabled
      // PAI hook system provides safety guardrails
      // Continue launch regardless of version check result (graceful degradation)
      exitCode = await spawnProcess('claude', ['--dangerously-skip-permissions'])
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        // Actionable error message (already includes installation link)
        this.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
      }

      // Unexpected error
      this.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
    }

    // Pass through Claude Code's exit code (outside try-catch to avoid catching exit)
    this.exit(exitCode)
  }
}
