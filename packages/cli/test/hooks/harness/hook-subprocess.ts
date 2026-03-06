import {spawn} from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 10_000

export interface SubprocessHookResult {
  exitCode: number
  parsedOutput: null | Record<string, unknown>
  stderr: string
  stdout: string
}

function parseHookOutput(stdout: string): null | Record<string, unknown> {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    // Some hooks may print extra lines before JSON output.
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const lastLine = lines.at(-1)
    if (!lastLine) return null

    try {
      const parsed = JSON.parse(lastLine) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
}

export async function runHookSubprocess(
  hookPath: string,
  input: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<SubprocessHookResult> {
  return await new Promise<SubprocessHookResult>((resolve, reject) => {
    const child = spawn(
      'bun',
      ['run', hookPath],
      {
        env: {
          ...process.env,
          ...env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let stdout = ''
    let stderr = ''
    let didTimeOut = false

    const timeout = setTimeout(() => {
      didTimeOut = true
      child.kill('SIGTERM')
    }, DEFAULT_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.once('close', (code) => {
      clearTimeout(timeout)

      const timeoutMessage = didTimeOut
        ? `Hook subprocess timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : ''
      const mergedStderr = timeoutMessage
        ? `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}${timeoutMessage}\n`
        : stderr

      resolve({
        stdout,
        stderr: mergedStderr,
        exitCode: code ?? (didTimeOut ? 124 : 1),
        parsedOutput: parseHookOutput(stdout),
      })
    })

    child.stdin.write(JSON.stringify(input))
    child.stdin.end()
  })
}
