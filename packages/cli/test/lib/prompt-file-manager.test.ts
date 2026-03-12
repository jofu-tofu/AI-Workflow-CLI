import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

import * as fs from 'node:fs'

import {PromptFileManager} from '../../src/lib/prompt-file-manager.js'

describe('PromptFileManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('materialize', () => {
    it('writes prompt text to temp file and returns path', () => {
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => 1000, pid: 42})

      const filePath = mgr.materialize('hello world')

      expect(filePath).toBe('/tmp/aiwcli-prompt-1000-42.txt')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/aiwcli-prompt-1000-42.txt',
        'hello world',
        {encoding: 'utf8', mode: 0o600},
      )
    })

    it('generates different paths with different timestamps', () => {
      let counter = 0
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => ++counter, pid: 42})

      const path1 = mgr.materialize('first')
      const path2 = mgr.materialize('second')

      expect(path1).toBe('/tmp/aiwcli-prompt-1-42.txt')
      expect(path2).toBe('/tmp/aiwcli-prompt-2-42.txt')
    })
  })

  describe('cleanup', () => {
    it('deletes all materialized files', () => {
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => 1000, pid: 42})
      mgr.materialize('hello')

      mgr.cleanup()

      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/aiwcli-prompt-1000-42.txt')
    })

    it('handles cleanup errors gracefully', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => 1000, pid: 42})
      mgr.materialize('hello')

      // Should not throw
      expect(() => mgr.cleanup()).not.toThrow()
    })

    it('cleans up multiple materialized files', () => {
      let counter = 0
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => ++counter, pid: 42})
      mgr.materialize('first')
      mgr.materialize('second')

      mgr.cleanup()

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2)
    })

    it('clears tracked files after cleanup', () => {
      const mgr = new PromptFileManager({tempDir: '/tmp', now: () => 1000, pid: 42})
      mgr.materialize('hello')
      mgr.cleanup()

      // Second cleanup should not try to delete anything
      vi.mocked(fs.unlinkSync).mockClear()
      mgr.cleanup()
      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })
  })
})
