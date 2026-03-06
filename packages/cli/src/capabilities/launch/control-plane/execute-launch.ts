import path from 'node:path'

import {
  checkVersionCompatibility,
  configureTmuxSession,
  detectMultiplexer,
  ensureLspPatch,
  findExecutable,
  findToolPath,
  getClaudeCodeVersion,
  launchTerminal,
  ProcessSpawnError,
  quoteForSh,
  readSentinelExitCode,
  spawnProcess,
  type SplitPaneResult,
  waitForSentinelFile,
} from '../../../platform/launch.js'
import {EXIT_CODES} from '../../../types/index.js'
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

function toJsonLaunchResult(result: SplitPaneResult, exitCode: null | number): JsonLaunchResult {
  return {
    launched: result.launched,
    backend: result.backend,
    paneId: result.paneId ?? null,
    sentinelPath: result.sentinelPath ?? null,
    exitCode,
    reason: result.reason ?? null,
  }
}

async function resolveWaitExitCode(result: SplitPaneResult, wait: boolean): Promise<null | number> {
  if (!wait || !result.launched || !result.sentinelPath) {
    return result.exitCode ?? null
  }

  const finished = await waitForSentinelFile(result.sentinelPath, 14_400_000)
  return finished ? readSentinelExitCode(result.sentinelPath, 1) : -1
}

export async function executeLaunch(request: LaunchRequest, dependencies: LaunchDependencies): Promise<void> {
  const {cwd, flags, interactiveTty, platform, readPromptFile} = request
  const {host, now, pid, tempDir, writePromptFile} = dependencies

  delete process.env['CLAUDECODE']
  delete process.env['CLAUDE_CODE_ENTRYPOINT']

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
  const disableTmux = flags['no-tmux']
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
      disableTmux,
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

  const [versionCheck, mux] = await Promise.all([
    useCodex || useDevin
      ? null
      : getClaudeCodeVersion().then((v) => checkVersionCompatibility(v)),
    disableTmux ? null : detectMultiplexer(platform),
  ])

  if (versionCheck) {
    host.debug(`Claude Code version: ${versionCheck.version ?? 'unknown'}`)
    host.debug(`Compatibility status: ${versionCheck.compatible ? 'compatible' : 'incompatible'}`)
    if (versionCheck.warning) {
      host.warn(versionCheck.warning)
    }
  }

  let exitCode = 0

  try {
    if (!mux) {
      if (disableTmux) {
        host.logInfo('Multiplexer disabled via --no-tmux — launching inline')
      } else if (!interactiveTty) {
        host.logInfo('Non-interactive terminal — launching inline')
      } else if (platform === 'win32') {
        host.logInfo('No multiplexer found — launching inline. Install psmux for session management: winget install psmux')
      } else {
        host.logInfo('No multiplexer found — launching inline. Install tmux for session management.')
      }

      exitCode = await spawnProcess(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs)
    } else if (mux.isInsideSession()) {
      host.logInfo(`Inside ${mux.backend} session — splitting new pane`)
      if (mux.backend === 'tmux') {
        configureTmuxSession()
      }

      let effectivePromptPath = promptPath
      if (!effectivePromptPath && promptText) {
        effectivePromptPath = path.join(tempDir, `aiwcli-prompt-${now()}-${pid}.txt`)
        writePromptFile(effectivePromptPath, promptText)
      }

      const splitResult = await mux.splitPane({
        toolName: cliCommand,
        args: cliArgs,
        env: extraEnv,
        cwd,
        split: flags.split ?? 'auto',
        promptPath: effectivePromptPath,
        sentinel: wantWait || wantJson,
      })

      if (wantJson) {
        const jsonExitCode = await resolveWaitExitCode(splitResult, wantWait)
        host.log(JSON.stringify(toJsonLaunchResult(splitResult, jsonExitCode)))
        host.exit(jsonExitCode ?? 0)
      }

      if (splitResult.launched) {
        if (splitResult.paneId) {
          host.logInfo(`Launched in ${mux.backend} pane: ${splitResult.paneId}`)
        } else {
          host.logInfo(`Launched in ${mux.backend}`)
        }

        if (wantWait && splitResult.sentinelPath) {
          const waitedExitCode = await resolveWaitExitCode(splitResult, true)
          host.exit(waitedExitCode ?? 1)
        }

        return
      }

      host.logWarning(`Pane split failed (${splitResult.reason}), launching directly`)
      exitCode = await spawnProcess(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs)
    } else {
      const resolvedPath = mux.backend === 'psmux' ? findExecutable(cliCommand) : findToolPath(cliCommand)
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
              host.logWarning(`${mux.backend} unavailable — launching inline. ${mux.backend === 'psmux' ? 'Install with: winget install psmux' : ''}`)
            } else if (result.reason.includes('too old')) {
              host.logWarning(`${result.reason} — launching inline. ${mux.backend === 'psmux' ? 'Update with: winget upgrade psmux' : ''}`)
            } else if (mux.backend === 'psmux' && result.reason.includes('attach failed')) {
              host.logWarning(`${result.reason} — launching inline. Recovery: run "psmux kill-server" and relaunch if this persists.`)
            } else {
              host.logWarning(`${result.reason} — launching inline`)
            }
          }

          exitCode = await spawnProcess(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs)
        }
      } else {
        host.logWarning(`${cliCommand} not found on PATH (install from https://claude.ai/download)`)
        exitCode = await spawnProcess(cliCommand, promptText ? [...cliArgs, promptText] : cliArgs)
      }
    }
  } catch (error) {
    if (error instanceof ProcessSpawnError) {
      host.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
    }

    host.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
  }

  host.exit(exitCode)
}
