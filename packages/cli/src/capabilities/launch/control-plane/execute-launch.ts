import path from 'node:path'

import {
  checkVersionCompatibility,
  detectMultiplexer,
  findExecutable,
  findToolPath,
  getClaudeCodeVersion,
  launchTerminal,
  ProcessSpawnError,
  quoteForSh,
  spawnProcess,
} from '../../../platform/launch.js'
import {EXIT_CODES} from '../../../types/index.js'
import {clearProcessNestingVars, isCalledFromRepl} from '../../../lib/env-sanitizer.js'
import {PromptFileManager} from '../../../lib/prompt-file-manager.js'
import {SentinelManager} from '../../../lib/sentinel-manager.js'
import {formatPathWarning} from '../../../lib/spawn-errors.js'
import type {LaunchDependencies, LaunchRequest} from '../contracts.js'
import {
  buildSpawnedWindowArgs,
  parseExtraEnv,
  resolvePromptText,
} from '../runtime-core/launch-options.js'
import {
  buildInlineArgs,
  buildSessionRequest,
  buildSplitRequest,
  formatSessionLaunchMessage,
  formatSplitSuccessMessage,
  formatVersionCheckMessages,
  QUICK_EXIT_THRESHOLD_MS,
  resolveInlineFallbackMessage,
  resolveSessionFallbackWarning,
  resolveToolConfig,
  resolveToolModeDebugMessage,
  shouldRetry,
  toJsonLaunchResult,
} from '../runtime-core/launch-decisions.js'

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
  if (retryOnQuickExit && shouldRetry(Date.now() - start)) {
    host.debug(`${command} exited in <${QUICK_EXIT_THRESHOLD_MS}ms — retrying (first-run init behavior)`)
    exitCode = await spawnProcess(command, args)
  }

  return exitCode
}

export async function executeLaunch(request: LaunchRequest, dependencies: LaunchDependencies): Promise<void> {
  const {cwd, flags, interactiveTty, platform, readPromptFile} = request
  const {host, now, pid, tempDir, writePromptFile} = dependencies

  // 1. Capture REPL context BEFORE clearing env vars (injectable for testing)
  const calledFromRepl = (dependencies.isCalledFromRepl ?? isCalledFromRepl)()
  ;(dependencies.clearNestingVars ?? clearProcessNestingVars)()

  // Pure decision: resolve tool config
  const toolConfig = resolveToolConfig(flags, platform)
  const {cliCommand, cliArgs, launchFlag, toolMode} = toolConfig

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

  // 2. Handle --new (terminal window)
  if (flags.new) {
    host.debug(`Launching new terminal in: ${cwd}`)

    let promptFilePath: string | undefined
    if (!promptPath && promptText) {
      promptFilePath = path.join(tempDir, `aiwcli-prompt-${now()}-${pid}.txt`)
      writePromptFile(promptFilePath, promptText)
    }

    const launchArgs = buildSpawnedWindowArgs({
      useCodex: flags.codex,
      useDevin: flags.devin,
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

  const toolDebugMsg = resolveToolModeDebugMessage(toolMode)
  if (toolDebugMsg) host.debug(toolDebugMsg)

  // 3. Detect multiplexer + version check
  const [versionCheck, mux] = await Promise.all([
    toolConfig.skipVersionCheck
      ? null
      : getClaudeCodeVersion().then((v) => checkVersionCompatibility(v)),
    disableMux ? null : detectMultiplexer(platform),
  ])

  if (versionCheck) {
    const msgs = formatVersionCheckMessages(versionCheck)
    for (const line of msgs.debugLines) host.debug(line)
    if (msgs.warning) host.warn(msgs.warning)
  }

  // 4. Resolve strategy — backend decides
  const resolved = mux?.resolveStrategy({calledFromRepl, platform, disableMux})
    ?? {strategy: 'inline' as const, reason: 'No multiplexer available'}

  if (!mux || resolved.strategy === 'inline' || resolved.strategy === 'unavailable') {
    // Pure decision: resolve fallback message
    host.logInfo(resolveInlineFallbackMessage({
      disableMux,
      hasMux: Boolean(mux),
      interactiveTty,
      platform,
      resolvedReason: resolved.reason,
    }))

    try {
      // Pure decision: build inline args
      const inlineArgs = buildInlineArgs(cliArgs, toolMode, promptText, promptPath)
      const exitCode = await spawnInlineWithRetry(cliCommand, inlineArgs, toolConfig.retryOnQuickExit, host)
      host.exit(exitCode)
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        host.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
      }
      host.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
    }

    return
  }

  // Lifecycle managers
  const sentinelMgr = new SentinelManager()
  const promptMgr = new PromptFileManager({tempDir, now, pid})

  // When --json is used without --wait, sentinel ownership transfers to the
  // JSON caller (e.g. skill scripts).  The CLI must NOT clean up the sentinel
  // directory because the caller polls for sentinel.txt to detect pane close.
  let sentinelOwnershipTransferred = false

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

      // Pure decision: build split request (fixes cliArgs mutation bug)
      const splitParams = buildSplitRequest({
        cliArgs,
        toolMode,
        effectivePromptPath,
        extraEnv,
        cwd,
        split: flags.split ?? 'auto',
        sentinelPath,
        retryOnQuickExit: toolConfig.retryOnQuickExit,
      })

      const splitResult = await mux.split({
        toolName: cliCommand,
        args: splitParams.toolArgs,
        env: splitParams.env,
        cwd: splitParams.cwd,
        mode: splitParams.mode,
        split: splitParams.split,
        promptPath: splitParams.splitPromptPath,
        sentinelPath: splitParams.sentinelPath,
        holdPane: splitParams.holdPane,
        retryOnQuickExit: splitParams.retryOnQuickExit,
      })

      if (wantJson) {
        const jsonExitCode = wantWait && splitResult.launched && splitResult.sentinelPath
          ? await sentinelMgr.waitForExit(splitResult.sentinelPath)
          : splitResult.exitCode ?? null

        // When returning sentinel path to caller without waiting, transfer
        // ownership so the finally block does not delete the directory.
        if (!wantWait && splitResult.launched && splitResult.sentinelPath) {
          sentinelOwnershipTransferred = true
        }

        host.log(JSON.stringify(toJsonLaunchResult(splitResult, jsonExitCode)))
        host.exit(jsonExitCode ?? 0)
      }

      if (splitResult.launched) {
        host.logInfo(formatSplitSuccessMessage(mux.backend, splitResult.handle))

        if (wantWait && splitResult.sentinelPath) {
          const waitedExitCode = await sentinelMgr.waitForExit(splitResult.sentinelPath)
          host.exit(waitedExitCode ?? 1)
        }

        return
      }

      host.logWarning(`Pane split failed (${splitResult.reason}), launching directly`)
      // Pure decision: build inline args for fallback
      const fallbackArgs = buildInlineArgs(cliArgs, toolMode, promptText, promptPath)
      exitCode = await spawnInlineWithRetry(cliCommand, fallbackArgs, toolConfig.retryOnQuickExit, host)
    } else {
      // 5b. Create session
      const resolvedPath = findToolPath(cliCommand) ?? findExecutable(cliCommand)
      if (resolvedPath) {
        // Pure decision: build session request
        const sessionParams = buildSessionRequest({
          cliArgs,
          toolMode,
          promptPath,
          promptText,
          tmuxSessionFlag: flags['tmux-session'],
          cwd,
          now: now(),
          pid,
        })

        host.logInfo(formatSessionLaunchMessage(mux.backend, sessionParams.sessionName, sessionParams.reattach))

        const result = await mux.createSession({
          sessionName: sessionParams.sessionName,
          reattach: sessionParams.reattach,
          toolPath: resolvedPath,
          toolArgs: sessionParams.toolArgs,
          cwd,
          promptText: sessionParams.promptText,
        })

        if (result.launched) {
          exitCode = result.exitCode ?? 0

          if (wantJson) {
            host.log(JSON.stringify(toJsonLaunchResult(result, exitCode)))
            host.exit(exitCode)
          }
        } else {
          // Pure decision: resolve fallback warning
          if (result.reason) {
            host.logWarning(resolveSessionFallbackWarning(mux.backend, result.reason))
          }

          const fallbackArgs = buildInlineArgs(cliArgs, toolMode, promptText, promptPath)
          exitCode = await spawnInlineWithRetry(cliCommand, fallbackArgs, toolConfig.retryOnQuickExit, host)
        }
      } else {
        host.logWarning(formatPathWarning(cliCommand))
        const fallbackArgs = buildInlineArgs(cliArgs, toolMode, promptText, promptPath)
        exitCode = await spawnInlineWithRetry(cliCommand, fallbackArgs, toolConfig.retryOnQuickExit, host)
      }
    }
  } catch (error) {
    if (error instanceof ProcessSpawnError) {
      host.error(error.message, {exit: EXIT_CODES.ENVIRONMENT_ERROR})
    }

    host.error('Unexpected launch failure.', {exit: EXIT_CODES.GENERAL_ERROR})
  } finally {
    if (!sentinelOwnershipTransferred) {
      sentinelMgr.cleanupAll()
    }

    promptMgr.cleanup()
  }

  host.exit(exitCode)
}
