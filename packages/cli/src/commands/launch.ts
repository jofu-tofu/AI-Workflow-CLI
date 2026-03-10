import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'

import {Flags} from '@oclif/core'

import type {LaunchFlags} from '../capabilities/launch/contracts.js'
import {executeLaunch} from '../capabilities/launch/control-plane/execute-launch.js'
import {buildUniqueSessionName, sanitizeSessionName} from '../capabilities/launch/runtime-core/launch-options.js'
import BaseCommand from '../cli/base-command.js'
import {quoteForSh, readSentinelExitCode, type LaunchResult, waitForSentinelFile} from '../platform/launch.js'

/**
 * Launch Claude Code, Codex, or Devin with AIW configuration.
 *
 * Spawns Claude Code CLI with --dangerously-skip-permissions flag,
 * Codex CLI with --yolo flag, or Devin CLI with --permission-mode dangerous,
 * enabling unattended execution. Supports multiple parallel sessions.
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
    'Launch Claude Code, Codex, or Devin with AIW configuration (sandbox disabled, tmux-first; Windows opens mintty window first with inline fallback)\n\n' +
    'FLAGS\n' +
    '  --codex/-c: Launch Codex instead of Claude Code (uses --yolo flag)\n' +
    '  --devin/-e: Launch Devin CLI instead of Claude Code (uses --permission-mode dangerous)\n' +
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
    '  3  Environment error - CLI not found (install Claude Code from https://claude.ai/download, Codex from npm, Devin from https://cli.devin.ai)'
  static override examples = [
    '<%= config.bin %> <%= command.id %>  # Auto-launches tmux with a fresh session when not already in tmux',
    '<%= config.bin %> <%= command.id %> --codex  # Launch Codex with --yolo flag',
    '<%= config.bin %> <%= command.id %> --devin  # Launch Devin CLI with --permission-mode dangerous',
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
      exclusive: ['devin'],
    }),
    devin: Flags.boolean({
      char: 'e',
      description: 'Launch Devin CLI instead of Claude Code (uses --permission-mode dangerous)',
      default: false,
      exclusive: ['codex'],
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
      description: 'Split direction when in multiplexer (auto|horizontal|vertical, default: auto)',
      options: ['auto', 'horizontal', 'vertical'],
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

    await executeLaunch(
      {
        cwd: process.cwd(),
        flags: flags as LaunchFlags,
        interactiveTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
        platform: process.platform,
        readPromptFile: (filePath: string) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined),
      },
      {
        host: {
          debug: (message: string, ...args: unknown[]) => this.debug([message, ...args.map(String)].join(' ')),
          error: (input: Error | string, options?: {exit?: number}) => this.error(input, options),
          exit: (code?: number) => this.exit(code),
          log: (message?: string) => this.log(message),
          logInfo: (message: string) => this.logInfo(message),
          logWarning: (message: string) => this.logWarning(message),
          warn: (input: Error | string) => this.warn(input),
        },
        now: () => Date.now(),
        pid: process.pid,
        tempDir: os.tmpdir(),
        writePromptFile(filePath: string, content: string) {
          writeFileSync(filePath, content, {encoding: 'utf8', mode: 0o600})
        },
      },
    )
  }

  // Compatibility wrappers kept on the command prototype while launch
  // orchestration now lives in the capability control-plane.
  private buildUniqueSessionName(base: string): string {
    return buildUniqueSessionName(base)
  }

  private async handleJsonOutput(result: LaunchResult, wait: boolean): Promise<void> {
    let {exitCode} = result

    if (wait && result.launched && result.sentinelPath) {
      const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
      exitCode = finished ? readSentinelExitCode(result.sentinelPath, 1) : -1
    }

    this.log(JSON.stringify({
      launched: result.launched,
      backend: result.backend,
      handle: result.handle ?? null,
      sentinelPath: result.sentinelPath ?? null,
      exitCode: exitCode ?? null,
      reason: result.reason ?? null,
    }))
    this.exit(exitCode ?? 0)
  }

  private sanitizeSessionName(input: string): string {
    return sanitizeSessionName(input)
  }

  private shellQuote(input: string): string {
    return quoteForSh(input)
  }

  private async waitForSentinel(result: LaunchResult): Promise<void> {
    if (!result.sentinelPath) return
    const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
    this.exit(finished ? readSentinelExitCode(result.sentinelPath, 1) : 1)
  }
}
