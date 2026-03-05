import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {Flags} from '@oclif/core'

import BaseCommand from '../lib/base-command.js'
import {ProcessSpawnError} from '../lib/errors.js'
import {
  buildSpawnedWindowArgs,
  buildUniqueSessionName as buildUniqueSessionNameValue,
  parseExtraEnv,
  resolvePromptText,
  sanitizeSessionName as sanitizeSessionNameValue,
} from '../lib/launch-options.js'
import {ensureLspPatch} from '../lib/lsp-patch.js'
import {detectMultiplexer, type SplitPaneResult} from '../lib/multiplexer.js'
import {readSentinelExitCode, waitForSentinelFile} from '../lib/runtime/sentinel-ipc.js'
import {findExecutable} from '../lib/runtime/subprocess-utils.js'
import {quoteForSh} from '../lib/shell-quoting.js'
import {spawnProcess} from '../lib/spawn.js'
import {launchTerminal} from '../lib/terminal.js'
import {enableTmuxColors, enableTmuxMouse, findToolPath} from '../lib/tmux-session.js'
import {checkVersionCompatibility, getClaudeCodeVersion} from '../lib/version.js'
import {EXIT_CODES} from '../types/index.js'

/**
 * Launch Claude Code or Codex with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * or Codex CLI with --yolo flag, enabling unattended execution.
 * Supports multiple parallel sessions.
 *
 * ## Multiplexer-first launch (preferred)
 *
 * When a terminal multiplexer is available (psmux on Windows, tmux on Unix),
 * the launch flow is:
 *   - **Inside an existing session** → split a new pane in the current session
 *   - **Outside any session** → create a new multiplexer session with the REPL
 *
 * This gives persistent sessions, pane splitting, and scrollback.
 * Use `--no-tmux` to bypass the multiplexer and launch inline.
 *
 * ## Inline fallback
 *
 * When no multiplexer is available (or `--no-tmux` is set), the REPL launches
 * directly in the current terminal.
 *
 * ## Install multiplexer
 *   - Windows: `winget install psmux`  (native ConPTY multiplexer)
 *   - Unix:    `apt install tmux` / `brew install tmux`
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
    const interactiveTty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    const wantJson = flags.json
    const wantWait = flags.wait

    // Parse extra env vars
    let extraEnv: Record<string, string> = {}
    try {
      extraEnv = parseExtraEnv(flags.env)
    } catch (error) {
      this.error(error instanceof Error ? error.message : '--env must be a valid JSON object string', {exit: EXIT_CODES.INVALID_USAGE})
    }

    // Resolve prompt from --prompt flag, --prompt-file, or --prompt-path
    const promptPath = flags['prompt-path']?.trim() || undefined
    const promptText = resolvePromptText(
      flags.prompt,
      flags['prompt-file'],
      (filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined),
    )

    // Handle --new flag: launch in a new terminal
    if (flags.new) {
      const cwd = process.cwd()
      this.debug(`Launching new terminal in: ${cwd}`)

      let promptFilePath: string | undefined
      if (!promptPath && promptText) {
        promptFilePath = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
        writeFileSync(promptFilePath, promptText, {encoding: 'utf8', mode: 0o600})
      }

      const launchArgs = buildSpawnedWindowArgs({
        useCodex,
        disableTmux,
        ...(promptPath ? {promptPath} : {}),
        ...(promptFilePath ? {promptFilePath} : {}),
        ...(flags.env ? {rawEnvJson: flags.env} : {}),
        ...(flags['tmux-session'] ? {tmuxSessionFlag: flags['tmux-session']} : {}),
      })
      const launchCmd = launchArgs.map((arg) => this.shellQuote(arg)).join(' ')

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

    // Version check for Claude Code
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

    // ── Unified multiplexer flow ──
    // detectMultiplexer(): Windows → psmux, Unix → tmux, null if unavailable
    const mux = disableTmux ? null : await detectMultiplexer()

    let exitCode: number

    try {
      if (!mux) {
        // No multiplexer available or disabled — inline launch
        if (disableTmux) {
          this.logInfo('Multiplexer disabled via --no-tmux — launching inline')
        } else if (!interactiveTty) {
          this.logInfo('Non-interactive terminal — launching inline')
        } else if (process.platform === 'win32') {
          this.logInfo('No multiplexer found — launching inline. Install psmux for session management: winget install psmux')
        } else {
          this.logInfo('No multiplexer found — launching inline. Install tmux for session management.')
        }

        const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
        exitCode = await spawnProcess(cliCommand, finalArgs)
      } else if (mux.isInsideSession()) {
        // Inside session — split a new pane
        this.logInfo(`Inside ${mux.backend} session — splitting new pane`)
        if (mux.backend === 'tmux') {
          enableTmuxMouse()
          enableTmuxColors()
        }

        // Build prompt path if we have prompt text but no path
        let effectivePromptPath = promptPath
        if (!effectivePromptPath && promptText) {
          const tmpFile = path.join(os.tmpdir(), `aiwcli-prompt-${Date.now()}-${process.pid}.txt`)
          writeFileSync(tmpFile, promptText, {encoding: 'utf8', mode: 0o600})
          effectivePromptPath = tmpFile
        }

        const splitResult = await mux.splitPane({
          toolName: cliCommand,
          args: cliArgs,
          env: extraEnv,
          cwd: process.cwd(),
          split: (flags.split as 'auto' | 'h' | 'v') ?? 'auto',
          promptPath: effectivePromptPath,
          sentinel: wantWait || wantJson,
        })

        if (wantJson) {
          await this.handleJsonOutput(splitResult, wantWait)
          return
        }

        if (splitResult.launched) {
          if (splitResult.paneId) {
            this.logInfo(`Launched in ${mux.backend} pane: ${splitResult.paneId}`)
          } else {
            this.logInfo(`Launched in ${mux.backend}`)
          }

          if (wantWait && splitResult.sentinelPath) {
            await this.waitForSentinel(splitResult)
          }

          return
        }

        this.warn(`Pane split failed (${splitResult.reason}), launching directly`)
        const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
        exitCode = await spawnProcess(cliCommand, finalArgs)
      } else {
        // Outside session — create new session
        // psmux runs commands via PowerShell, which needs .cmd shims (not POSIX shims).
        // findExecutable prefers .cmd on Windows; findToolPath prefers extensionless (for bash/tmux).
        const resolvedPath = mux.backend === 'psmux' ? findExecutable(cliCommand) : findToolPath(cliCommand)
        if (resolvedPath) {
          const sessionFromFlag = flags['tmux-session']?.trim()
          const reattach = Boolean(sessionFromFlag && sessionFromFlag.length > 0)
          const sessionName = reattach
            ? this.sanitizeSessionName(sessionFromFlag!)
            : this.buildUniqueSessionName(`aiw-${path.basename(process.cwd())}`)

          if (reattach) {
            this.logInfo(`Launching in ${mux.backend} session: ${sessionName} (reuse/attach)`)
          } else {
            this.logInfo(`Launching in new ${mux.backend} session: ${sessionName}`)
          }

          const result = await mux.createSession({
            sessionName,
            reattach,
            toolPath: resolvedPath,
            toolArgs: cliArgs,
            promptText,
          })

          if (result.usedMux) {
            exitCode = result.exitCode
          } else {
            if (result.reason) {
              if (result.reason.includes('not found') || result.reason.includes('unavailable')) {
                this.logWarning(`${mux.backend} unavailable — launching inline. ${mux.backend === 'psmux' ? 'Install with: winget install psmux' : ''}`)
              } else if (result.reason.includes('too old')) {
                this.logWarning(`${result.reason} — launching inline. ${mux.backend === 'psmux' ? 'Update with: winget upgrade psmux' : ''}`)
              } else {
                this.logWarning(`${result.reason} — launching inline`)
              }
            }

            const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
            exitCode = await spawnProcess(cliCommand, finalArgs)
          }
        } else {
          this.logWarning(`${cliCommand} not found on PATH (install from https://claude.ai/download)`)
          const finalArgs = promptText ? [...cliArgs, promptText] : cliArgs
          exitCode = await spawnProcess(cliCommand, finalArgs)
        }
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

  private buildUniqueSessionName(base: string): string {
    return buildUniqueSessionNameValue(base)
  }

  private async handleJsonOutput(result: SplitPaneResult, wait: boolean): Promise<void> {
    let {exitCode} = result

    if (wait && result.launched && result.sentinelPath) {
      const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
      exitCode = finished ? readSentinelExitCode(result.sentinelPath, 1) : -1
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

  private sanitizeSessionName(input: string): string {
    return sanitizeSessionNameValue(input)
  }

  private shellQuote(input: string): string {
    return quoteForSh(input)
  }

  private async waitForSentinel(result: SplitPaneResult): Promise<void> {
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
