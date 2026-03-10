import {type ChildProcess, spawn} from 'node:child_process'

import type {CreateSessionResult} from './multiplexer.js'

const CELL_ASPECT_RATIO = 2

export function getLastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.at(-1) ?? ''
}

export function spawnAttached(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv | undefined,
  backendLabel: string,
): Promise<CreateSessionResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, {stdio: 'inherit', env: env ?? process.env})
    } catch (error) {
      resolve({exitCode: -1, usedMux: false, reason: error instanceof Error ? error.message : String(error)})
      return
    }

    child.on('error', (error) => {
      resolve({exitCode: -1, usedMux: false, reason: error.message})
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({exitCode: 0, usedMux: true})
      } else {
        resolve({exitCode: code ?? 1, usedMux: false, reason: `${backendLabel} exited with code ${code ?? 1}`})
      }
    })
  })
}

export function splitFlagFromDimensions(width: number, height: number): '-h' | '-v' {
  return width >= height * CELL_ASPECT_RATIO ? '-h' : '-v'
}

/**
 * Env vars set by REPL tools (Claude Code, Codex, Devin) that trigger
 * nesting detection. Must be cleared when spawning a new REPL pane so
 * the child tool starts fresh instead of refusing to launch.
 */
export const REPL_NESTING_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_SESSION_ID',
  'CODEX_THREAD_ID',
  'AIWCLI_INTERNAL_CALL',
] as const

/** Shell snippet that unsets all REPL nesting vars (for bash -lc commands). */
export const UNSET_NESTING_SH = `unset ${REPL_NESTING_VARS.join(' ')};`

export function cleanClaudeEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
  }

  for (const key of REPL_NESTING_VARS) {
    delete env[key]
  }
  return env
}
