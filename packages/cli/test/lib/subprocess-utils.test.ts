import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

/* ------------------------------------------------------------------ *
 *  Hoisted mocks – declared before any vi.mock() or module import    *
 * ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  const stdinWrite = vi.fn()
  const stdinEnd = vi.fn()

  return {
    execFile: vi.fn(),
    resolveExecutable: vi.fn(() => null),
    stdinWrite,
    stdinEnd,
  }
})

/* ------------------------------------------------------------------ *
 *  Module-level mocks – run before the SUT is imported so the        *
 *  top-level signal-handler registrations use the fake execFile.     *
 * ------------------------------------------------------------------ */

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
}))

vi.mock('../../src/lib/runtime/executable-policy.js', () => ({
  resolveExecutable: mocks.resolveExecutable,
}))

/* ------------------------------------------------------------------ *
 *  Import SUT – after mocks are in place                             *
 * ------------------------------------------------------------------ */

import {
  execFileAsync,
  findExecutable,
  getInternalSubprocessEnv,
  isExecSyncError,
  isInternalCall,
  normalizePathForCli,
  shellQuoteWin,
} from '../../src/lib/runtime/subprocess-utils.js'

/* ================================================================== *
 *  Tests                                                             *
 * ================================================================== */

describe('subprocess-utils', () => {
  /* -------------------------------------------------------------- *
   *  isInternalCall                                                 *
   * -------------------------------------------------------------- */
  describe('isInternalCall', () => {
    const envKey = 'AIWCLI_INTERNAL_CALL'
    let saved: string | undefined

    beforeEach(() => {
      saved = process.env[envKey]
    })

    afterEach(() => {
      if (saved === undefined) {
        delete process.env[envKey]
      } else {
        process.env[envKey] = saved
      }
    })

    it('returns true when AIWCLI_INTERNAL_CALL is "true"', () => {
      process.env[envKey] = 'true'
      expect(isInternalCall()).toBe(true)
    })

    it('returns false when AIWCLI_INTERNAL_CALL is unset', () => {
      delete process.env[envKey]
      expect(isInternalCall()).toBe(false)
    })

    it('returns false when AIWCLI_INTERNAL_CALL is "false"', () => {
      process.env[envKey] = 'false'
      expect(isInternalCall()).toBe(false)
    })
  })

  /* -------------------------------------------------------------- *
   *  getInternalSubprocessEnv                                       *
   * -------------------------------------------------------------- */
  describe('getInternalSubprocessEnv', () => {
    const keysToClean = ['AIWCLI_INTERNAL_CALL', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']
    const saved: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const k of keysToClean) {
        saved[k] = process.env[k]
      }
    })

    afterEach(() => {
      for (const k of keysToClean) {
        if (saved[k] === undefined) {
          delete process.env[k]
        } else {
          process.env[k] = saved[k]
        }
      }
    })

    it('sets AIWCLI_INTERNAL_CALL to "true"', () => {
      const env = getInternalSubprocessEnv()
      expect(env.AIWCLI_INTERNAL_CALL).toBe('true')
    })

    it('strips CLAUDECODE from result', () => {
      process.env.CLAUDECODE = '1'
      const env = getInternalSubprocessEnv()
      expect(env.CLAUDECODE).toBeUndefined()
    })

    it('strips CLAUDE_CODE_ENTRYPOINT from result', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'some-value'
      const env = getInternalSubprocessEnv()
      expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
    })

    it('preserves other env vars', () => {
      const env = getInternalSubprocessEnv()
      expect(env.PATH).toBe(process.env.PATH)
    })
  })

  /* -------------------------------------------------------------- *
   *  findExecutable                                                 *
   * -------------------------------------------------------------- */
  describe('findExecutable', () => {
    afterEach(() => {
      mocks.resolveExecutable.mockReset()
    })

    it('delegates to resolveExecutable with windowsProfile cmdOrExeFirst', () => {
      mocks.resolveExecutable.mockReturnValue('/usr/bin/node')
      const result = findExecutable('node')
      expect(mocks.resolveExecutable).toHaveBeenCalledWith('node', {windowsProfile: 'cmdOrExeFirst'})
      expect(result).toBe('/usr/bin/node')
    })

    it('returns null when resolveExecutable returns null', () => {
      mocks.resolveExecutable.mockReturnValue(null)
      expect(findExecutable('missing-bin')).toBeNull()
    })
  })

  /* -------------------------------------------------------------- *
   *  isExecSyncError                                                *
   * -------------------------------------------------------------- */
  describe('isExecSyncError', () => {
    it('returns true for object with killed and signal', () => {
      expect(isExecSyncError({killed: false, signal: null})).toBe(true)
    })

    it('returns false for null', () => {
      expect(isExecSyncError(null)).toBe(false)
    })

    it('returns false for non-objects', () => {
      expect(isExecSyncError('string')).toBe(false)
      expect(isExecSyncError(42)).toBe(false)
    })

    it('returns false for object missing killed', () => {
      expect(isExecSyncError({signal: null})).toBe(false)
    })

    it('returns false for object missing signal', () => {
      expect(isExecSyncError({killed: false})).toBe(false)
    })
  })

  /* -------------------------------------------------------------- *
   *  normalizePathForCli                                            *
   * -------------------------------------------------------------- */
  describe('normalizePathForCli', () => {
    let platformSpy: ReturnType<typeof vi.spyOn>

    afterEach(() => {
      platformSpy?.mockRestore()
    })

    it('returns path unchanged on non-win32', () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      expect(normalizePathForCli('C:\\Users\\test\\file.txt')).toBe('C:\\Users\\test\\file.txt')
    })

    it('replaces backslashes with forward slashes on win32', () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      expect(normalizePathForCli('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt')
    })
  })

  /* -------------------------------------------------------------- *
   *  shellQuoteWin                                                  *
   * -------------------------------------------------------------- */
  describe('shellQuoteWin', () => {
    let platformSpy: ReturnType<typeof vi.spyOn>

    afterEach(() => {
      platformSpy?.mockRestore()
    })

    it('returns arg unchanged on non-win32', () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      expect(shellQuoteWin('hello world')).toBe('hello world')
    })

    it('wraps in double quotes on win32', () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      expect(shellQuoteWin('hello world')).toBe('"hello world"')
    })

    it('doubles embedded double quotes on win32', () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      expect(shellQuoteWin('say "hi"')).toBe('"say ""hi"""')
    })
  })

  /* -------------------------------------------------------------- *
   *  execFileAsync                                                  *
   * -------------------------------------------------------------- */
  describe('execFileAsync', () => {
    afterEach(() => {
      mocks.execFile.mockReset()
    })

    /**
     * Helper: configure the execFile mock to invoke its callback with the
     * given error / stdout / stderr, and return a fake ChildProcess.
     */
    // eslint-disable-next-line unicorn/consistent-function-scoping
    function setupExecFile(
      error: (Error & Record<string, unknown>) | null,
      stdout = '',
      stderr = '',
    ) {
      const exitHandlers: Array<() => void> = []

      const child = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'exit') exitHandlers.push(handler)
          return child
        }),
        stdin: {
          write: mocks.stdinWrite,
          end: mocks.stdinEnd,
        },
      }

      mocks.execFile.mockImplementation(
        (
          _file: string,
          _args: string[],
          _opts: Record<string, unknown>,
          callback: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          // Invoke callback asynchronously to mimic real behaviour
          process.nextTick(() => {
            callback(error, stdout, stderr)
            // Fire exit handlers
            for (const h of exitHandlers) h()
          })
          return child
        },
      )

      return child
    }

    it('resolves with exitCode 0 for successful command', async () => {
      setupExecFile(null, 'output', '')
      const result = await execFileAsync('echo', ['hello'])
      expect(result).toEqual({
        stdout: 'output',
        stderr: '',
        exitCode: 0,
        killed: false,
        signal: null,
      })
    })

    it('resolves with non-zero exitCode for failed command', async () => {
      const err = Object.assign(new Error('fail'), {code: 2, killed: false, signal: null})
      setupExecFile(err, '', 'error output')
      const result = await execFileAsync('false', [])
      expect(result.exitCode).toBe(2)
    })

    it('passes stdout and stderr strings through', async () => {
      const err = Object.assign(new Error('fail'), {code: 1, killed: false, signal: null})
      setupExecFile(err, 'my stdout', 'my stderr')
      const result = await execFileAsync('cmd', [])
      expect(result.stdout).toBe('my stdout')
      expect(result.stderr).toBe('my stderr')
    })

    it('handles error objects with numeric "code" property', async () => {
      const err = Object.assign(new Error('fail'), {code: 42, killed: false, signal: null})
      setupExecFile(err)
      const result = await execFileAsync('cmd', [])
      expect(result.exitCode).toBe(42)
    })

    it('handles error objects with "status" property as fallback', async () => {
      const err = Object.assign(new Error('fail'), {
        code: 'ERR_SOMETHING', // non-numeric → skip
        status: 7,
        killed: false,
        signal: null,
      })
      setupExecFile(err)
      const result = await execFileAsync('cmd', [])
      expect(result.exitCode).toBe(7)
    })

    it('defaults to exitCode 1 when error has neither numeric code nor status', async () => {
      const err = Object.assign(new Error('fail'), {
        code: 'ENOENT', // non-numeric
        killed: false,
        signal: null,
      })
      setupExecFile(err)
      const result = await execFileAsync('cmd', [])
      expect(result.exitCode).toBe(1)
    })

    it('surfaces killed and signal from error object', async () => {
      const err = Object.assign(new Error('killed'), {
        code: 1,
        killed: true,
        signal: 'SIGTERM',
      })
      setupExecFile(err)
      const result = await execFileAsync('cmd', [])
      expect(result.killed).toBe(true)
      expect(result.signal).toBe('SIGTERM')
    })

    it('writes input to stdin when provided', async () => {
      mocks.stdinWrite.mockReset()
      mocks.stdinEnd.mockReset()
      setupExecFile(null)
      await execFileAsync('cat', [], {input: 'hello stdin'})
      expect(mocks.stdinWrite).toHaveBeenCalledWith('hello stdin')
      expect(mocks.stdinEnd).toHaveBeenCalled()
    })

    it('does not write to stdin when input is not provided', async () => {
      mocks.stdinWrite.mockReset()
      mocks.stdinEnd.mockReset()
      setupExecFile(null)
      await execFileAsync('echo', ['hi'])
      expect(mocks.stdinWrite).not.toHaveBeenCalled()
      expect(mocks.stdinEnd).not.toHaveBeenCalled()
    })

    it('tracks child in set and removes on exit', async () => {
      // We can verify indirectly: the exit handler registered via child.on('exit', ...)
      // should have been called (our setupExecFile fires it).
      const child = setupExecFile(null)
      await execFileAsync('echo', [])
      // child.on should have been called with 'exit'
      expect(child.on).toHaveBeenCalledWith('exit', expect.any(Function))
    })
  })
})
