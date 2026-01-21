import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {spawnProcess} from '../lib/spawn.js'
import {launchTerminal} from '../lib/terminal.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code or Codex with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * or Codex CLI with --yolo flag, enabling unattended execution.
 * Designed for AIW hook system safety guardrails (requires aiw setup).
 * Supports multiple parallel sessions.
 */
export default class LaunchCommand extends BaseCommand {
  static override description =
    'Launch Claude Code or Codex with AIW configuration (sandbox disabled, supports parallel sessions)\n\n' +
    'FLAGS\n' +
    '  --codex/-c: Launch Codex instead of Claude Code (uses --yolo flag)\n' +
    '  --new/-n: Open a new terminal in the current directory and launch there\n\n' +
    'EXIT CODES\n' +
    '  0  Success - AI assistant launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - CLI not found (install Claude Code from https://claude.ai/download or Codex from npm)'
static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --codex  # Launch Codex with --yolo flag',
    '<%= config.bin %> <%= command.id %> -c  # Short form for --codex',
    '<%= config.bin %> <%= command.id %> --new  # Launch in a new terminal window',
    '<%= config.bin %> <%= command.id %> -n  # Short form for --new',
    '<%= config.bin %> <%= command.id %> --codex --new  # Launch Codex in new terminal',
    '<%= config.bin %> <%= command.id %> --debug  # Enable verbose logging',
    '# Check exit code in Bash\n<%= config.bin %> <%= command.id %>\necho $?',
    '# Check exit code in PowerShell\n<%= config.bin %> <%= command.id %>\necho $LASTEXITCODE',
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    codex: Flags.boolean({
      char: 'c',
      description: 'Launch Codex instead of Claude Code (uses --yolo flag for full auto mode)',
      default: false,
    }),
    new: Flags.boolean({
      char: 'n',
      description: 'Open a new terminal in the current directory and run aiw launch there',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LaunchCommand)

    // Determine which CLI to launch
    const useCodex = flags.codex
    const cliCommand = useCodex ? 'codex' : 'claude'
    const cliArgs = useCodex ? ['--yolo'] : ['--dangerously-skip-permissions']
    const launchFlag = useCodex ? '--codex' : ''

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      const launchCmd = useCodex ? 'aiw launch --codex' : 'aiw launch'
      const result = await launchTerminal({
        cwd,
        command: launchCmd,
        debugLog: (msg) => this.debug(msg),
      })

      if (!result.success) {
        this.error(`Failed to launch new terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

      this.log(`New terminal launched with aiw launch${launchFlag ? ` ${launchFlag}` : ''}`)
      return
    }

    // Normal launch flow
    let exitCode: number

    try {
      // Version check only applies to Claude Code (not Codex)
      if (useCodex) {
        this.debug('Launching Codex with --yolo flag')
      } else {
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
      }

      // Spawn AI CLI with sandbox permissions disabled
      // AIW hook system provides safety guardrails
      // Continue launch regardless of version check result (graceful degradation)
      exitCode = await spawnProcess(cliCommand, cliArgs)
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
