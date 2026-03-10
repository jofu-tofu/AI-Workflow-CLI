import path from 'node:path'

import {
  checkVersionCompatibility,
  detectMultiplexer,
  ensureLspPatch,
  findExecutable,
  findToolPath,
  getClaudeCodeVersion,
  launchTerminal,
  ProcessSpawnError,
  quoteForSh,
  spawnProcess,
  type LaunchResult,
} from '../../../platform/launch.js'
import {EXIT_CODES} from '../../../types/index.js'
import {clearProcessNestingVars, isCalledFromRepl} from '../../../lib/env-sanitizer.js'
import {PromptFileManager} from '../../../lib/prompt-file-manager.js'
import {SentinelManager} from '../../../lib/sentinel-manager.js'
import type {JsonLaunchResult, LaunchDependencies, LaunchRequest} from '../contracts.js'
import {
  buildSpawnedWindowArgs,
  buildUniqueSessionName,
  parseExtraEnv,
  resolvePromptText,
  sanitizeSessionName,
} from '../runtime-core/launch-options.js'

function buildCodexArgs(platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return ['--yolo']
  return ['-c', 'shell_type="bash"', '--yolo']
}

function buildDevinArgs(): string[] {
  return ['--permission-mode', 'dangerous']
}

const QUICK_EXIT_THRESHOLD_MS = 10_000

async function runPreflightWarmup(command: string, host: LaunchDependencies['host']): Promise<void> {
  try {
    const result = await spawnProcess(command, ['--version'], {stdio: 'pipe'})
    host.debug(`${command} preflight: exit=${result}`)
  } catch {
    host.debug(`${command} preflight failed (non-fatal)`)
  }
}

async function spawnInlineWithRetry(
  command: string,
  args: string[],
  retryOnQuickExit: boolean,
  host: LaunchDependencies['host'],
): Promise<number> {
  if (retryOnQuickExit) {
    await runPreflightWarmup(command, host)
  }

  const start = Date.now()
  let exitCode = await spawnProcess(command, args)
  if (retryOnQuickExit && Date.now() - start < QUICK_EXIT_THRESHOLD_MS) {
    host.debug(`${command} exited in <${QUICK_EXIT_THRESHOLD_MS}ms — retrying (first-run init behavior)`)
    exitCode = await spawnProcess(command, args)
  }

  return exitCode
}

function toJsonLaunchResult(result: LaunchResult, exitCode: null | number): JsonLaunchResult {
  return {
    launched: result.launched,
    backend: result.backend,
    handle: result.handle ?? null,
    sentinelPath: result.sentinelPath ?? null,
    exitCode,
    reason: result.reason ?? null,
  }
}

export async function executeLaunch(request: LaunchRequest, dependencies: LaunchDependencies): Promise<void> {
  const {cwd, flags, interactiveTty, platform, readPromptFile} = request
  const {host, now, pid, tempDir, writePromptFile} = dependencies

  // 1. Capture REPL context BEFORE clearing env vars
  const calledFromRepl = isCalledFromRepl()
  clearProcessNestingVars()

  const useCodex = flags.codex
  const useDevin = flags.devin

  if (platform === 'win32' && !useCodex && !useDevin) {
    await ensureLspPatch({
      debugLog: (message) => host.debug(message),
      warn(message) {
        host.warn(message)
      },
    })
  }

  const cliCommand = useDevin ? 'devin' : useCodex ? 'codex' : 'claude'
  const cliArgs = useDevin ? buildDevinArgs() : useCodex ? buildCodexArgs(platform) : ['--dangerously-skip-permissions']
  const launchFlag = useDevin ? '--devin' : useCodex ? '--codex' : ''
  const disableMux = flags['no-tmux']
  const wantJson = flags.json
  const wantWait = flags.wait

  let extraEnv: Record<string, string> = {}
  try {
    extraEnv = parseExtraEnv(flags.env)
  } catch (error) {
    host.error(error instanceof Error ? error.message : '--env must be a valid JSON object string', {
      exit: EXIT_CODES.INVALID_USAGE,
    })
  }

  const promptPath = flags['prompt-path']?.trim() || undefined
  const promptText = resolvePromptText(flags.prompt, flags['prompt-file'], readPromptFile)

  // 2. Handle --new (terminal window) — unchanged
  if (flags.new) {
    host.debug(`Launching new terminal in: ${cwd}`)

    let promptFilePath: string | undefined
    if (!promptPath && promptText) {
      promptFilePath = path.join(tempDir, `aiwcli-prompt-${now()}-${pid}.txt`)
      writePromptFile(promptFilePath, promptText)
    }

    const launchArgs = buildSpawnedWindowArgs({
      useCodex,
      useDevin,
      disableTmux: disableMux,
      ...(promptPath ? {promptPath} : {}),
      ...(promptFilePath ? {promptFilePath} : {}),
      ...(flags.env ? {rawEnvJson: flags.env} : {}),
      ...(flags['tmux-session'] ? {tmuxSessionFlag: flags['tmux-session']} : {}),
    })
    const launchCmd = launchArgs.map((arg) => quoteForSh(arg)).join(' ')

    const result = await launchTerminal({
      cwd,
      command: launchCmd,
      windowsShellPreference: platform === 'win32' ? 'mintty' : 'default',
      debugLog: (message) => host.debug(message),
    })

    if (!result.success) {
      host.error(`Failed to launch new terminal: ${result.error}`, {exit: EXIT_CODES.GENERAL_ERROR})
    }

    host.log(`New terminal launched with aiw launch${launchFlag ? ` ${launchFlag}` : ''}`)
    return
  }

  if (useCodex) {
    host.debug('Launching Codex with --yolo flag')
  } else if (useDevin) {
    host.debug('Launching Devin with --permission-mode dangerous')
  }

  // 3. Detect multiplexer
  const [versionCheck, mux] = await Promise.all([
    useCodex || useDevin
      ? null
      : getClaudeCodeVersion().then((v) => checkVersionCompatibility(v)),
    disableMux ? null : detectMultiplexer(platform),
  ])

  if (versionCheck) {
    host.debug(`Claude Code version: ${versionCheck.version ?? 'unknown'}`)
    host.debug(`Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`)
    if (versionCheck.warning) {
      host.warn(versionCheck.warning)
    }
  }

  // 4. Resolve strategy — backend decides
  const resolved = mux?.resolveStrategy({calledFromRepl, platform, disableMux})
    ?? {strategy: 'inline' as const, reason: 'No multiplexer available'}

  if (!mux || resolved.strategy === 'inline' || resolved.strategy === 'unavailable') {
    if (!mux) {
      if (disableMux) {
        host.logInfo('Multiplexer disabled via --no-tmux — launching inline')
      } else if (!interactiveTty) {
        host.logInfo('Non-interactive terminal — launching inline')
      } else if (platform === 'win32') {
        host.logInfo('No multiplexer found — launching inline. Run inside WezTerm or install psmux for session management.')
      } else {
        host.logInfo('No multiplexer found — launching inline. Install tmux for session management.')
      }
    } else {
      host.logInfo(resolved.reason)
    }

    try {
      const inlineArgs = useDevin && promptPath
        ? [...cliArgs, '--prompt-file', promptPath]
        : promptText ? [...cliArgs, promptText] : cliArgs
      const exitCode = await spawnInlineWithRetry(cliCommand, inlineArgs, useDevin, host)
      host.exit(exitCode)
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        host.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
      }
      host.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
    }

    return // unreachable but narrows mux to non-null below
  }

  // Lifecycle managers
  const sentinelMgr = new SentinelManager()
  const promptMgr = new PromptFileManager({tempDir, now, pid})

  let exitCode = 0

  try {
    const strategy = resolved.strategy

    if (strategy === 'split') {
      // 5a. Split pane
      host.logInfo(`Inside ${mux.backend} session — splitting new pane`)

      const sentinelPath = sentinelMgr.create(cliCommand)!

      let effectivePromptPath = promptPath
      if (!effectivePromptPath && promptText) {
        effectivePromptPath = promptMgr.materialize(promptText)
      }

      // Devin CLI uses --prompt-file <path> instead of trailing positional prompt text
      let splitPromptPath = effectivePromptPath
      if (useDevin && effectivePromptPath) {
        cliArgs.push('--prompt-file', effectivePromptPath)
        splitPromptPath = undefined
      }

      const splitResult = await mux.split({
        toolName: cliCommand,
        args: cliArgs,
        env: extraEnv,
        cwd,
        mode: 'repl',
        split: flags.split ?? 'auto',
        promptPath: splitPromptPath,
        sentinelPath,
        holdPane: false,
        retryOnQuickExit: useDevin,
      })

      if (wantJson) {
        const jsonExitCode = wantWait && splitResult.launched && splitResult.sentinelPath
          ? await sentinelMgr.waitForExit(splitResult.sentinelPath)
          : splitResult.exitCode ?? null
        host.log(JSON.stringify(toJsonLaunchResult(splitResult, jsonExitCode)))
        host.exit(jsonExitCode ?? 0)
      }

      if (splitResult.launched) {
        if (splitResult.handle) {
          host.logInfo(`Launched in ${mux.backend} pane: ${splitResult.handle}`)
        } else {
          host.logInfo(`Launched in ${mux.backend}`)
        }

        if (wantWait && splitResult.sentinelPath) {
          const waitedExitCode = await sentinelMgr.waitForExit(splitResult.sentinelPath)
          host.exit(waitedExitCode ?? 1)
        }

        return
      }

      host.logWarning(`Pane split failed (${splitResult.reason}), launching directly`)
      exitCode = await spawnInlineWithRetry(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs, useDevin, host)
    } else {
      // 5b. Create session
      const resolvedPath = findToolPath(cliCommand) ?? findExecutable(cliCommand)
      if (resolvedPath) {
        const sessionFromFlag = flags['tmux-session']?.trim()
        const reattach = Boolean(sessionFromFlag && sessionFromFlag.length > 0)
        const sessionName = reattach
          ? sanitizeSessionName(sessionFromFlag!)
          : buildUniqueSessionName(`aiw-${path.basename(cwd)}`, now(), pid)

        if (reattach) {
          host.logInfo(`Launching in ${mux.backend} session: ${sessionName} (reuse/attach)`)
        } else {
          host.logInfo(`Launching in new ${mux.backend} session: ${sessionName}`)
        }

        const sessionToolArgs = useDevin && promptPath
          ? [...cliArgs, '--prompt-file', promptPath]
          : cliArgs
        const sessionPromptText = useDevin ? undefined : promptText

        const result = await mux.createSession({
          sessionName,
          reattach,
          toolPath: resolvedPath,
          toolArgs: sessionToolArgs,
          cwd,
          promptText: sessionPromptText,
        })

        if (result.launched) {
          exitCode = result.exitCode ?? 0

          if (wantJson) {
            host.log(JSON.stringify({
              launched: true,
              backend: mux.backend,
              handle: null,
              sentinelPath: null,
              exitCode,
              reason: null,
            }))
            host.exit(exitCode)
          }
        } else {
          if (result.reason) {
            if (result.reason.includes('not found') || result.reason.includes('unavailable')) {
              host.logWarning(`${mux.backend} unavailable — launching inline. ${mux.backend === 'psmux' ? 'Install with: winget install psmux' : ''}`)
            } else if (result.reason.includes('too old')) {
              host.logWarning(`${result.reason} — launching inline. ${mux.backend === 'psmux' ? 'Update with: winget upgrade psmux' : ''}`)
            } else if (mux.backend === 'psmux' && result.reason.includes('attach failed')) {
              host.logWarning(`${result.reason} — launching inline. Recovery: run "psmux kill-server" and relaunch if this persists.`)
            } else {
              host.logWarning(`${result.reason} — launching inline`)
            }
          }

          exitCode = await spawnInlineWithRetry(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs, useDevin, host)
        }
      } else {
        host.logWarning(`${cliCommand} not found on PATH (install from https://claude.ai/download)`)
        exitCode = await spawnInlineWithRetry(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs, useDevin, host)
      }
    }
  } catch (error) {
    if (error instanceof ProcessSpawnError) {
      host.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
    }

    host.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
  } finally {
    sentinelMgr.cleanupAll()
    promptMgr.cleanup()
  }

  host.exit(exitCode)
}
