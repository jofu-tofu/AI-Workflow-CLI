import {afterEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  findExecutable: vi.fn(),
  toMsysPosixPath: vi.fn((input: string) => input),
  wrapSentinelSh: vi.fn(({command}: {command: string}) => `WRAP(${command})`),
}))

vi.mock('../../../src/lib/runtime/subprocess-utils.js', () => ({
  execFileAsync: mocks.execFileAsync,
  findExecutable: mocks.findExecutable,
}))

vi.mock('../../../src/lib/tmux-primitives.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/tmux-primitives.js')>()
  return {
    ...actual,
    toMsysPosixPath: mocks.toMsysPosixPath,
  }
})

vi.mock('../../../src/lib/sentinel-wrapper.js', () => ({
  wrapSentinelSh: mocks.wrapSentinelSh,
}))

import {BashAdapter} from '../../../src/lib/shell-adapters/bash-adapter.js'

describe('BashAdapter', () => {
  const adapter = new BashAdapter()

  describe('quote', () => {
    it('wraps value in single quotes', () => {
      expect(adapter.quote('hello')).toBe("'hello'")
    })

    it('escapes single quotes within value', () => {
      const result = adapter.quote("it's")
      expect(result).toContain("it")
      expect(result).toContain("s")
    })
  })

  describe('buildEnvPreamble', () => {
    it('returns empty string for empty env', () => {
      expect(adapter.buildEnvPreamble({})).toBe('')
    })

    it('builds KEY=value pairs with sh quoting', () => {
      const result = adapter.buildEnvPreamble({FOO: 'bar', BAZ: 'qux'})
      expect(result).toContain("FOO='bar'")
      expect(result).toContain("BAZ='qux'")
    })
  })

  describe('buildToolCommand', () => {
    it('builds repl command with env and tool path', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: ['--flag'],
        env: {COLORTERM: 'truecolor'},
        mode: 'repl',
      })
      expect(result).toContain('COLORTERM=')
      expect(result).toContain('/usr/bin/claude')
      expect(result).toContain('--flag')
    })

    it('builds exec command with prompt redirect', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'exec',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).toContain('< ')
      expect(result).toContain('/tmp/prompt.md')
    })

    it('does not redirect in repl mode even with promptPath', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptPath: '/tmp/prompt.md',
      })
      expect(result).not.toContain('< ')
    })

    it('appends prompt text as argument in repl mode', () => {
      const result = adapter.buildToolCommand({
        toolPath: '/usr/bin/claude',
        args: [],
        env: {},
        mode: 'repl',
        promptText: 'hello world',
      })
      expect(result).toContain('hello world')
    })
  })

  describe('buildNestingCleanup', () => {
    it('includes PATH fix', () => {
      expect(adapter.buildNestingCleanup()).toContain('export PATH=')
    })

    it('includes unset for nesting vars', () => {
      const result = adapter.buildNestingCleanup()
      expect(result).toContain('unset CLAUDECODE')
      expect(result).toContain('CLAUDE_CODE_ENTRYPOINT')
    })
  })

  describe('wrapQuickExitRetry', () => {
    it('includes warmup command and retry logic', () => {
      const result = adapter.wrapQuickExitRetry('run-cmd', '/usr/bin/tool')
      expect(result).toContain('/usr/bin/tool --version')
      expect(result).toContain('run-cmd')
      expect(result).toContain('SECONDS')
    })
  })

  describe('encodeForExecution', () => {
    it('returns command unchanged (no encoding for bash)', () => {
      expect(adapter.encodeForExecution('some command')).toBe('some command')
    })
  })

  describe('resolveToolPath', () => {
    let platformSpy: ReturnType<typeof vi.spyOn>

    afterEach(() => {
      platformSpy?.mockRestore()
      mocks.findExecutable.mockReset()
      mocks.execFileAsync.mockReset()
    })

    it('returns nativePath unchanged on non-win32 platform', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      const result = await adapter.resolveToolPath('claude', '/usr/bin/claude')
      expect(result).toBe('/usr/bin/claude')
      expect(mocks.findExecutable).not.toHaveBeenCalled()
    })

    it('returns null on win32 when bash is not found', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.findExecutable.mockReturnValue(null)
      const result = await adapter.resolveToolPath('claude', 'C:\\Program Files\\claude.exe')
      expect(result).toBeNull()
      expect(mocks.findExecutable).toHaveBeenCalledWith('bash')
      expect(mocks.execFileAsync).not.toHaveBeenCalled()
    })

    it('returns resolved path on win32 when command -v succeeds', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.findExecutable.mockReturnValue('/usr/bin/bash')
      mocks.execFileAsync.mockResolvedValue({
        exitCode: 0,
        stdout: '  /usr/bin/claude  \n',
        stderr: '',
        killed: false,
        signal: null,
      })
      const result = await adapter.resolveToolPath('claude', 'C:\\Program Files\\claude.exe')
      expect(result).toBe('/usr/bin/claude')
      expect(mocks.execFileAsync).toHaveBeenCalledWith(
        '/usr/bin/bash',
        ['-lc', 'command -v claude'],
        expect.objectContaining({
          timeout: 3000,
          env: expect.objectContaining({MSYS_NO_PATHCONV: '1'}),
        }),
      )
    })

    it('returns null on win32 when command -v fails', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.findExecutable.mockReturnValue('/usr/bin/bash')
      mocks.execFileAsync.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'bash: command not found',
        killed: false,
        signal: null,
      })
      const result = await adapter.resolveToolPath('claude', 'C:\\Program Files\\claude.exe')
      expect(result).toBeNull()
    })

    it('returns null on win32 when command -v returns empty stdout', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.findExecutable.mockReturnValue('/usr/bin/bash')
      mocks.execFileAsync.mockResolvedValue({
        exitCode: 0,
        stdout: '   \n',
        stderr: '',
        killed: false,
        signal: null,
      })
      const result = await adapter.resolveToolPath('claude', 'C:\\Program Files\\claude.exe')
      expect(result).toBeNull()
    })
  })

  describe('normalizeCwd', () => {
    afterEach(() => {
      mocks.toMsysPosixPath.mockReset()
      mocks.toMsysPosixPath.mockImplementation((input: string) => input)
    })

    it('delegates to toMsysPosixPath', () => {
      mocks.toMsysPosixPath.mockReturnValue('/c/Users/test')
      const result = adapter.normalizeCwd('C:\\Users\\test')
      expect(mocks.toMsysPosixPath).toHaveBeenCalledWith('C:\\Users\\test')
      expect(result).toBe('/c/Users/test')
    })
  })

  describe('wrapSentinel', () => {
    afterEach(() => {
      mocks.wrapSentinelSh.mockReset()
      mocks.wrapSentinelSh.mockImplementation(({command}: {command: string}) => `WRAP(${command})`)
    })

    it('delegates to wrapSentinelSh', () => {
      const params = {
        command: 'run-tool',
        sentinelPath: '/tmp/sentinel',
        autoClose: false,
        holdPane: false,
        holdMessage: 'Done',
      }
      const result = adapter.wrapSentinel(params)
      expect(mocks.wrapSentinelSh).toHaveBeenCalledWith(params)
      expect(result).toBe('WRAP(run-tool)')
    })
  })
})
