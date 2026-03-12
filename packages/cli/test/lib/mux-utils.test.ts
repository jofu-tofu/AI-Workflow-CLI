import {EventEmitter} from 'node:events'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

import {getLastLine, spawnAttached, splitFlagFromDimensions} from '../../src/lib/mux-utils.js'

describe('mux-utils', () => {
  describe('getLastLine', () => {
    it('returns last non-empty line from multi-line text', () => {
      const input = 'first line\nsecond line\nthird line'
      expect(getLastLine(input)).toBe('third line')
    })

    it('returns empty string for empty input', () => {
      expect(getLastLine('')).toBe('')
    })

    it('returns empty string for whitespace-only input', () => {
      expect(getLastLine('   \n  \n\t\n  ')).toBe('')
    })

    it('handles \\r\\n line endings (Windows)', () => {
      const input = 'first line\r\nsecond line\r\nlast line'
      expect(getLastLine(input)).toBe('last line')
    })

    it('handles trailing newlines (common in subprocess stdout)', () => {
      const input = 'first line\nsecond line\nlast line\n\n'
      expect(getLastLine(input)).toBe('last line')
    })

    it('trims whitespace from the returned line', () => {
      const input = 'first line\n   last line with spaces   \n'
      expect(getLastLine(input)).toBe('last line with spaces')
    })

    it('handles single-line input', () => {
      expect(getLastLine('only line')).toBe('only line')
      expect(getLastLine('  only line  ')).toBe('only line')
    })

    it('handles ANSI color codes in lines (preserves them)', () => {
      const input = 'plain line\n\u001B[31mred text\u001B[0m\n'
      expect(getLastLine(input)).toBe('\u001B[31mred text\u001B[0m')
    })
  })

  describe('splitFlagFromDimensions', () => {
    it("returns '-h' for wide pane (width >= height * 2)", () => {
      expect(splitFlagFromDimensions(220, 80)).toBe('-h')
    })

    it("returns '-v' for tall pane (width < height * 2)", () => {
      expect(splitFlagFromDimensions(120, 90)).toBe('-v')
    })

    it("returns '-h' at exact boundary (width === height * 2)", () => {
      expect(splitFlagFromDimensions(200, 100)).toBe('-h')
    })

    it("returns '-h' for zero-height (width >= 0)", () => {
      expect(splitFlagFromDimensions(80, 0)).toBe('-h')
      expect(splitFlagFromDimensions(0, 0)).toBe('-h')
    })

    it("returns '-v' for zero-width, non-zero height", () => {
      expect(splitFlagFromDimensions(0, 50)).toBe('-v')
    })
  })

  describe('spawnAttached', () => {
    let mockChild: EventEmitter

    beforeEach(() => {
      vi.clearAllMocks()
      // eslint-disable-next-line unicorn/prefer-event-target -- ChildProcess mock needs EventEmitter.emit()
      mockChild = new EventEmitter()
      mocks.spawn.mockReturnValue(mockChild)
    })

    afterEach(() => {
      mockChild.removeAllListeners()
    })

    it('returns launched=true with exitCode=0 when child exits with 0', async () => {
      const promise = spawnAttached('claude', ['--flag'], undefined, 'tmux')
      mockChild.emit('close', 0)

      const result = await promise
      expect(result).toEqual({launched: true, exitCode: 0, backend: 'tmux'})
    })

    it('returns launched=false with exitCode and reason when child exits non-zero', async () => {
      const promise = spawnAttached('claude', ['--flag'], undefined, 'tmux')
      mockChild.emit('close', 42)

      const result = await promise
      expect(result).toEqual({
        launched: false,
        exitCode: 42,
        backend: 'tmux',
        reason: 'tmux exited with code 42',
      })
    })

    it('returns launched=false with exitCode=-1 when spawn throws', async () => {
      mocks.spawn.mockImplementation(() => {
        throw new Error('ENOENT: command not found')
      })

      const result = await spawnAttached('nonexistent', [], undefined, 'wezterm')
      expect(result).toEqual({
        launched: false,
        exitCode: -1,
        backend: 'wezterm',
        reason: 'ENOENT: command not found',
      })
    })

    it("returns launched=false with exitCode=-1 when child emits 'error' event", async () => {
      const promise = spawnAttached('claude', [], undefined, 'tmux')
      mockChild.emit('error', new Error('spawn EACCES'))

      const result = await promise
      expect(result).toEqual({
        launched: false,
        exitCode: -1,
        backend: 'tmux',
        reason: 'spawn EACCES',
      })
    })

    it('returns exitCode=1 when close code is null (process killed by signal)', async () => {
      const promise = spawnAttached('claude', [], undefined, 'tmux')
      mockChild.emit('close', null)

      const result = await promise
      expect(result).toEqual({
        launched: false,
        exitCode: 1,
        backend: 'tmux',
        reason: 'tmux exited with code 1',
      })
    })

    it('uses provided env when given', async () => {
      const customEnv = {FOO: 'bar', PATH: '/usr/bin'}
      const promise = spawnAttached('claude', ['--flag'], customEnv, 'tmux')
      mockChild.emit('close', 0)
      await promise

      expect(mocks.spawn).toHaveBeenCalledWith('claude', ['--flag'], {stdio: 'inherit', env: customEnv})
    })

    it('uses process.env as default when env is undefined', async () => {
      const promise = spawnAttached('claude', ['--flag'], undefined, 'tmux')
      mockChild.emit('close', 0)
      await promise

      expect(mocks.spawn).toHaveBeenCalledWith('claude', ['--flag'], {stdio: 'inherit', env: process.env})
    })

    it('passes backendLabel through to result.backend', async () => {
      const promise = spawnAttached('cmd', [], undefined, 'my-custom-backend')
      mockChild.emit('close', 0)

      const result = await promise
      expect(result.backend).toBe('my-custom-backend')
    })
  })
})
