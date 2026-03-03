/**
 * Subprocess utilities for pane launching.
 * Extracted from template _shared/lib-ts/base/subprocess-utils.ts.
 */

import {execFile, execSync} from 'node:child_process'
import type {ChildProcess, ExecSyncOptionsWithStringEncoding} from 'node:child_process'

// ─── Child Process Cleanup ─────────────────────────────────────────────────

const childProcesses = new Set<ChildProcess>()

function cleanupChildren(): void {
  for (const child of childProcesses) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Ignore — child may have already exited
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

/**
 * Find an executable on the system PATH.
 * Uses `where` on Windows, `which` on Unix.
 * Prefers .cmd/.exe over extensionless shims on Windows.
 */
export function findExecutable(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`
    const lines = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    } as unknown as ExecSyncOptionsWithStringEncoding)
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    if (lines.length === 0) return null

    if (process.platform === 'win32') {
      const preferred = lines.find((l) => /\.(cmd|exe)$/i.test(l))
      return preferred ?? lines[0] ?? null
    }

    return lines[0] ?? null
  } catch {
    return null
  }
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

/**
 * Async subprocess execution that does NOT block the event loop.
 * Returns ExecResult on both success and non-zero exit.
 */
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
        encoding: 'utf-8',
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
            exitCode: typeof errObj.code === 'number' ? errObj.code : (error as any).status ?? 1,
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
