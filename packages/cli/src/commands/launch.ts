import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {basename} from 'node:path'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {spawnProcess} from '../lib/spawn.js'
import {launchTerminal} from '../lib/terminal.js'
import {enableTmuxMouse, findToolPath, launchInTmuxSession} from '../lib/tmux-session.js'
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
    'Launch Claude Code or Codex with AIW configuration (sandbox disabled, tmux-first by default)\n\n' +
    'FLAGS\n' +
    '  --codex/-c: Launch Codex instead of Claude Code (uses --yolo flag)\n' +
    '  --new/-n: Open a new terminal in the current directory and launch there\n' +
    '  --no-tmux/-t: Launch directly in current shell instead of auto-launching tmux\n' +
    '  --tmux-session/-s: tmux session name to reuse when auto-launching tmux (default is fresh session per launch)\n' +
    '  --prompt/-p: Initial prompt to pass to the AI REPL at startup\n\n' +
    'EXIT CODES\n' +
    '  0  Success - AI assistant launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - CLI not found (install Claude Code from https://claude.ai/download, Codex from npm)'
static override examples = [
    '<%= config.bin %> <%= command.id %>  # Auto-launches tmux with a fresh session when not already in tmux',
    '<%= config.bin %> <%= command.id %> --codex  # Launch Codex with --yolo flag',
    '<%= config.bin %> <%= command.id %> -c  # Short form for --codex',
    '<%= config.bin %> <%= command.id %> --new  # Launch in a new terminal window',
    '<%= config.bin %> <%= command.id %> -n  # Short form for --new',
    '<%= config.bin %> <%= command.id %> --codex --new  # Launch Codex in new terminal',
    '<%= config.bin %> <%= command.id %> --no-tmux  # Run directly in current shell',
    '<%= config.bin %> <%= command.id %> --tmux-session aiw-main  # Reuse/attach explicit tmux session name',
    '<%= config.bin %> <%= command.id %> --prompt "Fix the login bug"  # Launch with initial prompt',
    '<%= config.bin %> <%= command.id %> -p "Refactor auth module"  # Short form for --prompt',
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
    'no-tmux': Flags.boolean({
      char: 't',
      description: 'Launch directly in current shell instead of auto-launching tmux',
      default: false,
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Initial prompt to pass to the AI REPL at startup',
      required: false,
    }),
    'prompt-file': Flags.string({
      description: 'Path to file containing initial prompt (internal)',
      required: false,
      hidden: true,
    }),
    'tmux-session': Flags.string({
      char: 's',
      description: 'tmux session name to reuse when auto-launching tmux (default: new aiw-<current-dir>-<unique> session)',
      required: false,
    }),
  }

  // eslint-disable-next-line complexity
  async run(): Promise<void> {
    const {flags} = await this.parse(LaunchCommand)

    // Clear Claude Code nesting-detection vars so the spawned REPL doesn't
    // refuse to start with "cannot launch claude within claude".
    // Safe here because the launch command's only job is to spawn a new REPL.
    delete process.env['CLAUDECODE']
    delete process.env['CLAUDE_CODE_ENTRYPOINT']

    // Determine which CLI to launch
    const useCodex = flags.codex
    const cliCommand = useCodex ? 'codex' : 'claude'
    const cliArgs = useCodex ? ['--yolo'] : ['--dangerously-skip-permissions']
    const launchFlag = useCodex ? '--codex' : ''
    const disableTmux = flags['no-tmux']
    const insideTmux = Boolean(process.env.TMUX)
    const interactiveTty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    const shouldAutoTmux = !flags.new && !disableTmux && !insideTmux && interactiveTty

    // Resolve prompt from --prompt flag or --prompt-file (internal, used by --new propagation)
    let promptText = flags.prompt?.trim() || undefined
    if (!promptText && flags['prompt-file']) {
      const pf = flags['prompt-file'].trim()
      try { if (existsSync(pf)) promptText = readFileSync(pf, 'utf-8').trim() || undefined }
      catch { /* ignore — prompt is best-effort enhancement */ }
    }

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      let launchCmd = useCodex ? 'aiw launch --codex' : 'aiw launch'
      if (promptText) {
        const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
        writeFileSync(tmpFile, promptText, {encoding: 'utf-8', mode: 0o600})
        launchCmd += ` --prompt-file ${this.shellQuote(tmpFile)}`
      }

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
      if (shouldAutoTmux) {
        const resolvedPath = findToolPath(cliCommand)

        // On Windows, bare command names fail in MSYS2 tmux (PATH is reset by login shell).
        // Skip tmux and fall back to direct spawn with explicit warning.
        if (!resolvedPath && process.platform === 'win32') {
          this.warn(`${cliCommand} not found on PATH — launching directly (install from https://claude.ai/download)`)
          const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
          exitCode = await spawnProcess(cliCommand, finalArgs)
        } else {
          const sessionFromFlag = flags['tmux-session']?.trim()
          const reattach = Boolean(sessionFromFlag && sessionFromFlag.length > 0)

          let sessionName: string
          if (reattach) {
            sessionName = this.sanitizeTmuxSessionName(sessionFromFlag!)
            this.logInfo(`Launching in tmux session: ${sessionName} (reuse/attach)`)
          } else {
            const sessionBase = `aiw-${basename(process.cwd())}`
            sessionName = this.buildUniqueTmuxSessionName(sessionBase)
            this.logInfo(`Launching in new tmux session: ${sessionName}`)
          }

          const result = await launchInTmuxSession({
            sessionName,
            reattach,
            toolPath: resolvedPath ?? cliCommand,
            toolArgs: cliArgs,
            promptText,
          })

          if (result.usedTmux) {
            exitCode = result.exitCode
          } else {
            if (result.reason) this.warn(`tmux: ${result.reason}, launching directly`)
            const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
            exitCode = await spawnProcess(cliCommand, finalArgs)
          }
        }
      } else {
        if (disableTmux) {
          this.debug('tmux launch disabled via --no-tmux')
        } else if (insideTmux) {
          this.debug('Already inside tmux; launching directly in current pane')
          enableTmuxMouse()
        } else if (!interactiveTty) {
          this.debug('Non-interactive terminal detected; launching directly')
        }

        const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
        exitCode = await spawnProcess(cliCommand, finalArgs)
      }
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

  private buildUniqueTmuxSessionName(base: string): string {
    const safeBase = this.sanitizeTmuxSessionName(base)
    const timestamp = Date.now().toString(36)
    const pid = process.pid.toString(36)
    return this.sanitizeTmuxSessionName(`${safeBase}-${timestamp}-${pid}`)
  }

  private sanitizeTmuxSessionName(input: string): string {
    const trimmed = input.trim().toLowerCase()
    const safe = trimmed
      .replaceAll(/[^a-z0-9_-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^[-_]+|[-_]+$/g, '')
    return safe || 'aiw'
  }

  private shellQuote(input: string): string {
    return `'${input.replaceAll("'", `'"'"'`)}'`
  }
}
