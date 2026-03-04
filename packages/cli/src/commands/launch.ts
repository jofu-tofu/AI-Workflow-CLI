import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {ensureLspPatch} from '../lib/lsp-patch.js'
import {launchDriverInTmuxOrFallback, type LaunchDriverResult} from '../lib/pane-driver.js'
import {createPaneLauncher} from '../lib/pane-launcher.js'
import {readSentinelExitCode, waitForSentinelFile} from '../lib/runtime/sentinel-ipc.js'
import {spawnProcess} from '../lib/spawn.js'
import {launchTerminal} from '../lib/terminal.js'
import {enableTmuxColors, enableTmuxMouse, findToolPath, launchInTmuxSession} from '../lib/tmux-session.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code or Codex with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * or Codex CLI with --yolo flag, enabling unattended execution.
 * Supports multiple parallel sessions.
 *
 * When already inside tmux, splits a new pane (absorbs template pane-driver logic).
 * Use --wait to block until the pane exits, --json for machine-readable output.
 */
export default class LaunchCommand extends BaseCommand {
  static override description =
    'Launch Claude Code or Codex with AIW configuration (sandbox disabled, tmux-first; Windows opens mintty window first with inline fallback)\n\n' +
    'FLAGS\n' +
    '  --codex/-c: Launch Codex instead of Claude Code (uses --yolo flag)\n' +
    '  --new/-n: Open a new terminal in the current directory and launch there\n' +
    '  --no-tmux/-t: Launch directly in current shell instead of auto-launching tmux\n' +
    '  --tmux-session/-s: tmux session name to reuse when auto-launching tmux\n' +
    '  --prompt/-p: Initial prompt to pass to the AI REPL at startup\n' +
    '  --wait: Block until launched pane exits (for scripted callers)\n' +
    '  --json: JSON output (paneId, backend, exitCode, sentinel)\n' +
    '  --split: Split direction when in tmux (auto|h|v, default: auto)\n' +
    '  --env: Extra env vars as JSON string\n' +
    '  --prompt-path: Path to prompt file for REPL-mode tools\n\n' +
    'EXIT CODES\n' +
    '  0  Success - AI assistant launched and exited successfully\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - check your arguments and flags\n' +
    '  3  Environment error - CLI not found (install Claude Code from https://claude.ai/download, Codex from npm)'
static override examples = [
    '<%= config.bin %> <%= command.id %>  # Auto-launches tmux with a fresh session when not already in tmux',
    '<%= config.bin %> <%= command.id %> --codex  # Launch Codex with --yolo flag',
    '<%= config.bin %> <%= command.id %> --new  # Launch in a new terminal window',
    '<%= config.bin %> <%= command.id %> --no-tmux  # Run directly in current shell',
    '<%= config.bin %> <%= command.id %> --tmux-session aiw-main  # Reuse/attach explicit tmux session name',
    '<%= config.bin %> <%= command.id %> --prompt "Fix the login bug"  # Launch with initial prompt',
    '<%= config.bin %> <%= command.id %> --wait --json  # Block until pane exits, output JSON result',
    '<%= config.bin %> <%= command.id %> --split h  # Force horizontal split in tmux',
    '<%= config.bin %> <%= command.id %> --debug  # Enable verbose logging',
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    codex: Flags.boolean({
      char: 'c',
      description: 'Launch Codex instead of Claude Code (uses --yolo flag for full auto mode)',
      default: false,
    }),
    env: Flags.string({
      description: 'Extra env vars as JSON object string (e.g. \'{"FOO":"bar"}\')',
      required: false,
    }),
    json: Flags.boolean({
      description: 'JSON output (paneId, backend, exitCode, sentinel)',
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
    'spawned-window': Flags.boolean({
      description: 'Internal: marks launch as re-entered in a spawned terminal window',
      required: false,
      hidden: true,
      default: false,
    }),
    'prompt-path': Flags.string({
      description: 'Path to prompt file for REPL-mode tools',
      required: false,
    }),
    split: Flags.string({
      description: 'Split direction when in tmux (auto|h|v, default: auto)',
      options: ['auto', 'h', 'v'],
      required: false,
    }),
    'tmux-session': Flags.string({
      char: 's',
      description: 'tmux session name to reuse when auto-launching tmux (default: new aiw-<current-dir>-<unique> session)',
      required: false,
    }),
    wait: Flags.boolean({
      description: 'Block until launched pane exits; output result',
      default: false,
    }),
  }

  // eslint-disable-next-line complexity
  async run(): Promise<void> {
    const {flags} = await this.parse(LaunchCommand)

    // Clear Claude Code nesting-detection vars so the spawned REPL doesn't
    // refuse to start with "cannot launch claude within claude".
    delete process.env['CLAUDECODE']
    delete process.env['CLAUDE_CODE_ENTRYPOINT']

    // Patch Claude Code's LSP spawn on Windows (adds shell:true for .cmd shims)
    if (process.platform === 'win32') {
      await ensureLspPatch({
        debugLog: (msg) => this.debug(msg),
        warn: (msg) => this.warn(msg),
      })
    }

    // Determine which CLI to launch
    const useCodex = flags.codex
    const cliCommand = useCodex ? 'codex' : 'claude'
    const cliArgs = useCodex ? this.buildCodexArgs() : ['--dangerously-skip-permissions']
    const launchFlag = useCodex ? '--codex' : ''
    const disableTmux = flags['no-tmux']
    const insideTmux = Boolean(process.env.TMUX)
    const spawnedWindow = Boolean(flags['spawned-window'])
    const interactiveTty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    const wantJson = flags.json
    const wantWait = flags.wait

    // Parse extra env vars
    let extraEnv: Record<string, string> = {}
    if (flags.env) {
      try {
        extraEnv = JSON.parse(flags.env)
      } catch {
        this.error('--env must be a valid JSON object string', {exit: EXIT_CODES.INVALID_USAGE})
      }
    }

    // Resolve prompt from --prompt flag, --prompt-file, or --prompt-path
    let promptText = flags.prompt?.trim() || undefined
    const promptPath = flags['prompt-path']?.trim() || undefined
    if (!promptText && flags['prompt-file']) {
      const pf = flags['prompt-file'].trim()
      try {
        if (existsSync(pf)) promptText = readFileSync(pf, 'utf8').trim() || undefined
      } catch { /* ignore — prompt is best-effort enhancement */ }
    }

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      const launchCmd = this.buildSpawnedWindowCommand({
        useCodex,
        disableTmux,
        ...(promptPath ? {promptPath} : {}),
        ...(promptText ? {promptText} : {}),
        ...(flags.env ? {rawEnvJson: flags.env} : {}),
        ...(flags['tmux-session'] ? {tmuxSessionFlag: flags['tmux-session']} : {}),
      })

      const result = await launchTerminal({
        cwd,
        command: launchCmd,
        windowsShellPreference: process.platform === 'win32' ? 'mintty' : 'default',
        debugLog: (msg) => this.debug(msg),
      })

      if (!result.success) {
        this.error(`Failed to launch new terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
      }

      this.log(`New terminal launched with aiw launch${launchFlag ? ` ${launchFlag}` : ''}`)
      return
    }

    // ── Pane splitting (new behavior) ──
    // When a pane manager is available (tmux, Windows Terminal, etc.),
    // use pane-driver to split a new pane instead of spawning directly.
    // Uses the abstract factory to detect the backend automatically.
    const shouldUsePaneLauncher = !disableTmux
    const paneLauncher = shouldUsePaneLauncher
      ? await createPaneLauncher({requireTmuxSession: true})
      : null
    if (paneLauncher && !flags.new) {
      this.logInfo(`Pane manager detected (${paneLauncher.backend}); splitting new pane`)
      if (insideTmux) {
        enableTmuxMouse()
        enableTmuxColors()
      }

      const splitFlag = flags.split === 'v' ? '-v' as const
        : flags.split === 'h' ? '-h' as const
          : 'auto' as const

      // Build prompt path if we have prompt text
      let effectivePromptPath = promptPath
      if (!effectivePromptPath && promptText) {
        const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
        writeFileSync(tmpFile, promptText, {encoding: 'utf8', mode: 0o600})
        effectivePromptPath = tmpFile
      }

      const driverResult = await launchDriverInTmuxOrFallback({
        toolName: cliCommand,
        mode: 'repl',
        args: cliArgs,
        env: extraEnv,
        cwd: process.cwd(),
        splitFlag,
        promptPath: effectivePromptPath,
        allowExecFallback: false,
      })

      if (wantJson) {
        await this.handleJsonOutput(driverResult, wantWait)
        return
      }

      if (!driverResult.launched) {
        // Fall back to direct spawn if pane-driver fails
        this.warn(`Pane split failed (${driverResult.reason}), launching directly`)
        const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
        const exitCode = await spawnProcess(cliCommand, finalArgs)
        this.exit(exitCode)
        return
      }

      if (driverResult.paneId) {
        this.logInfo(`Launched in tmux pane: ${driverResult.paneId}`)
      } else {
        this.logInfo(`Launched in ${driverResult.backend}`)
      }

      if (wantWait && driverResult.sentinelPath) {
        await this.waitForSentinel(driverResult)
      }

      return
    }

    // ── Normal launch flow (no pane manager detected) ──
    const shouldAutoTmux = !disableTmux && !insideTmux && interactiveTty
    if (
      process.platform === 'win32' &&
      shouldAutoTmux &&
      !spawnedWindow &&
      !wantJson &&
      !wantWait
    ) {
      const launchCmd = this.buildSpawnedWindowCommand({
        useCodex,
        disableTmux: false,
        ...(promptPath ? {promptPath} : {}),
        ...(promptText ? {promptText} : {}),
        ...(flags.env ? {rawEnvJson: flags.env} : {}),
        ...(flags['tmux-session'] ? {tmuxSessionFlag: flags['tmux-session']} : {}),
      })

      const windowResult = await launchTerminal({
        cwd: process.cwd(),
        command: launchCmd,
        windowsShellPreference: 'mintty',
        debugLog: (msg) => this.debug(msg),
      })

      if (windowResult.success) {
        this.logInfo('Opened new mintty window for tmux-first launch on Windows')
        this.exit(0)
      }

      this.logWarning(`${windowResult.error ?? 'failed to open new window'} — launching inline without tmux`)
      const fallbackExit = await this.launchInline(cliCommand, cliArgs, promptText)
      this.exit(fallbackExit)
      return
    }

    let exitCode: number

    try {
      if (useCodex) {
        this.debug('Launching Codex with --yolo flag')
      } else {
        const version = await getClaudeCodeVersion()
        const versionCheck = checkVersionCompatibility(version)
        this.debug(`Claude Code version: ${versionCheck.version ?? 'unknown'}`)
        this.debug(`Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`)
        if (versionCheck.warning) {
          this.warn(versionCheck.warning)
        }
      }

      if (shouldAutoTmux) {
        exitCode = await this.launchViaAutoTmuxOrInline({
          cliCommand,
          cliArgs,
          ...(promptText ? {promptText} : {}),
          ...(flags['tmux-session'] ? {tmuxSessionFlag: flags['tmux-session']} : {}),
        })
      } else {
        if (disableTmux) {
          this.logInfo('Tmux disabled via --no-tmux — launching inline')
        } else if (!interactiveTty) {
          this.logInfo('Non-interactive terminal — launching inline')
        }

        const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
        exitCode = await spawnProcess(cliCommand, finalArgs)
      }
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        this.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
      }

      this.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
    }

    this.exit(exitCode)
  }

  private buildCodexArgs(): string[] {
    if (process.platform !== 'win32') return ['--yolo']
    return ['-c', 'shell_type="bash"', '--yolo']
  }

  private buildSpawnedWindowCommand(params: {
    disableTmux: boolean;
    promptPath?: string;
    promptText?: string;
    rawEnvJson?: string;
    tmuxSessionFlag?: string;
    useCodex: boolean;
  }): string {
    const {useCodex, disableTmux, promptText, promptPath, rawEnvJson, tmuxSessionFlag} = params
    const parts = ['aiw', 'launch', '--spawned-window']

    if (useCodex) parts.push('--codex')
    if (disableTmux) parts.push('--no-tmux')
    if (tmuxSessionFlag?.trim()) {
      parts.push('--tmux-session', this.shellQuote(tmuxSessionFlag.trim()))
    }

    if (rawEnvJson?.trim()) {
      parts.push('--env', this.shellQuote(rawEnvJson))
    }

    if (promptPath) {
      parts.push('--prompt-path', this.shellQuote(promptPath))
    } else if (promptText) {
      const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
      writeFileSync(tmpFile, promptText, {encoding: 'utf8', mode: 0o600})
      parts.push('--prompt-file', this.shellQuote(tmpFile))
    }

    return parts.join(' ')
  }

  private buildUniqueTmuxSessionName(base: string): string {
    const safeBase = this.sanitizeTmuxSessionName(base)
    const timestamp = Date.now().toString(36)
    const pid = process.pid.toString(36)
    return this.sanitizeTmuxSessionName(`${safeBase}-${timestamp}-${pid}`)
  }

  private async handleJsonOutput(result: LaunchDriverResult, wait: boolean): Promise<void> {
    let {exitCode} = result

    if (wait && result.launched && result.sentinelPath) {
      const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
      exitCode = finished ? readSentinelExitCode(result.sentinelPath, 1) : -1;
    }

    const output = {
      launched: result.launched,
      backend: result.backend,
      paneId: result.paneId ?? null,
      sentinelPath: result.sentinelPath ?? null,
      exitCode: exitCode ?? null,
      reason: result.reason ?? null,
    }
    this.log(JSON.stringify(output))
    this.exit(exitCode ?? 0)
  }

  private async launchInline(
    cliCommand: string,
    cliArgs: string[],
    promptText?: string,
  ): Promise<number> {
    this.logInfo(`Launching ${cliCommand} inline`)
    const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
    return spawnProcess(cliCommand, finalArgs)
  }

  private async launchViaAutoTmuxOrInline(params: {
    cliArgs: string[];
    cliCommand: string;
    promptText?: string;
    tmuxSessionFlag?: string;
  }): Promise<number> {
    const {cliCommand, cliArgs, promptText, tmuxSessionFlag} = params
    const resolvedPath = findToolPath(cliCommand)

    if (!resolvedPath) {
      this.logWarning(`${cliCommand} not found on PATH (install from https://claude.ai/download)`)
      return this.launchInline(cliCommand, cliArgs, promptText)
    }

    const sessionFromFlag = tmuxSessionFlag?.trim()
    const reattach = Boolean(sessionFromFlag && sessionFromFlag.length > 0)
    const sessionName = reattach
      ? this.sanitizeTmuxSessionName(sessionFromFlag!)
      : this.buildUniqueTmuxSessionName(`aiw-${path.basename(process.cwd())}`)

    if (reattach) {
      this.logInfo(`Launching in tmux session: ${sessionName} (reuse/attach)`)
    } else {
      this.logInfo(`Launching in new tmux session: ${sessionName}`)
    }

    const result = await launchInTmuxSession({
      sessionName,
      reattach,
      toolPath: resolvedPath,
      toolArgs: cliArgs,
      promptText,
    })

    if (result.usedTmux) return result.exitCode

    if (result.reason) this.logWarning(`${result.reason} — launching inline`)
    return this.launchInline(cliCommand, cliArgs, promptText)
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

  private async waitForSentinel(result: LaunchDriverResult): Promise<void> {
    if (!result.sentinelPath) return
    const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
    if (finished) {
      const exitCode = readSentinelExitCode(result.sentinelPath, 1)
      this.exit(exitCode)
    } else {
      this.exit(1)
    }
  }
}



