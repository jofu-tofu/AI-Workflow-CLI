import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

import { resolveExecutable } from './executable-policy.js'

const childProcesses = new Set<ChildProcess>()

function cleanupChildren(): void {
  for (const child of childProcesses) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Child may have already exited.
    }
  }

  childProcesses.clear()
}

process.on('exit', () => {
  cleanupChildren()
})

process.on('SIGINT', () => {
  cleanupChildren()
  process.exit(130)
})

process.on('SIGTERM', () => {
  cleanupChildren()
  process.exit(143)
})

export function isInternalCall(): boolean {
  return process.env.AIWCLI_INTERNAL_CALL === 'true'
}

export function getInternalSubprocessEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    AIWCLI_INTERNAL_CALL: 'true',
  }

  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  return env
}

export function findExecutable(name: string): string | null {
  return resolveExecutable(name, { windowsProfile: 'cmdOrExeFirst' })
}

export interface ExecSyncError {
  killed: boolean
  signal: string | null
  stdout: Buffer | string
  stderr: Buffer | string
  status: number | null
  message: string
}

export function isExecSyncError(error: unknown): error is ExecSyncError {
  return typeof error === 'object' && error !== null && 'killed' in error && 'signal' in error
}

export function normalizePathForCli(pathValue: string): string {
  if (process.platform !== 'win32') return pathValue
  return pathValue.replaceAll('\\', '/')
}

export function shellQuoteWin(arg: string): string {
  if (process.platform !== 'win32') return arg
  return '"' + arg.replaceAll('"', '""') + '"'
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  killed: boolean
  signal: string | null
}

export interface ExecAsyncOptions {
  input?: string | undefined
  timeout?: number | undefined
  env?: Record<string, string | undefined> | undefined
  maxBuffer?: number | undefined
  shell?: boolean | undefined
}

export function execFileAsync(
  file: string,
  args: string[],
  options?: ExecAsyncOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        encoding: 'utf8',
        timeout: options?.timeout ?? 0,
        env: options?.env as NodeJS.ProcessEnv,
        maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
        shell: options?.shell,
      },
      (error, stdout, stderr) => {
        if (error) {
          const errObj = error as unknown as Record<string, unknown>
          resolve({
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            exitCode:
              typeof errObj.code === 'number'
                ? errObj.code
                : typeof errObj.status === 'number'
                  ? errObj.status
                  : 1,
            killed: Boolean(errObj.killed),
            signal: typeof errObj.signal === 'string' ? errObj.signal : null,
          })
        } else {
          resolve({
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            exitCode: 0,
            killed: false,
            signal: null,
          })
        }
      },
    )

    childProcesses.add(child)
    child.on('exit', () => {
      childProcesses.delete(child)
    })

    if (options?.input !== null && options?.input !== undefined && child.stdin) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}


