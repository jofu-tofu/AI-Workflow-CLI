import {describe, expect, it, vi} from 'vitest'

import type {SentinelIO} from '../../src/lib/sentinel-manager.js'
import {SentinelManager} from '../../src/lib/sentinel-manager.js'

function createFakeIO(): SentinelIO & {
  createCalls: string[]
  cleanupCalls: string[]
  waitResults: Map<string, number | null>
} {
  const createCalls: string[] = []
  const cleanupCalls: string[] = []
  const waitResults = new Map<string, number | null>()
  let counter = 0

  return {
    createCalls,
    cleanupCalls,
    waitResults,
    create(toolName: string) {
      createCalls.push(toolName)
      counter++
      const tmpDir = `/tmp/fake-${counter}`
      return {
        tmpDir,
        inputPath: `${tmpDir}/input.txt`,
        stdoutPath: `${tmpDir}/stdout.txt`,
        stderrPath: `${tmpDir}/stderr.txt`,
        sentinelPath: `${tmpDir}/sentinel.txt`,
      }
    },
    async waitForExit(sentinelPath: string, _timeoutMs: number) {
      return waitResults.get(sentinelPath) ?? null
    },
    cleanup(paths) {
      cleanupCalls.push(paths.tmpDir)
    },
  }
}

describe('SentinelManager', () => {
  describe('create', () => {
    it('creates sentinel paths and returns sentinelPath', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)

      const result = mgr.create('claude')

      expect(result).toBe('/tmp/fake-1/sentinel.txt')
      expect(io.createCalls).toEqual(['claude'])
    })

    it('returns undefined when disabled', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)

      const result = mgr.create('claude', false)

      expect(result).toBeUndefined()
      expect(io.createCalls).toHaveLength(0)
    })
  })

  describe('waitForExit', () => {
    it('delegates to io.waitForExit', async () => {
      const io = createFakeIO()
      io.waitResults.set('/tmp/fake-1/sentinel.txt', 42)
      const mgr = new SentinelManager(io)
      mgr.create('claude')

      const exitCode = await mgr.waitForExit('/tmp/fake-1/sentinel.txt')

      expect(exitCode).toBe(42)
    })

    it('returns null when sentinel not found', async () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)

      const exitCode = await mgr.waitForExit('/nonexistent')

      expect(exitCode).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('cleans up a specific tracked sentinel', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)
      mgr.create('claude')

      mgr.cleanup('/tmp/fake-1/sentinel.txt')

      expect(io.cleanupCalls).toEqual(['/tmp/fake-1'])
    })

    it('does nothing for untracked sentinel path', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)

      mgr.cleanup('/tmp/nonexistent/sentinel.txt')

      expect(io.cleanupCalls).toHaveLength(0)
    })
  })

  describe('cleanupAll', () => {
    it('cleans up all tracked sentinels', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)
      mgr.create('claude')
      mgr.create('codex')

      mgr.cleanupAll()

      expect(io.cleanupCalls).toEqual(['/tmp/fake-1', '/tmp/fake-2'])
    })

    it('empties the tracked list after cleanup', () => {
      const io = createFakeIO()
      const mgr = new SentinelManager(io)
      mgr.create('claude')
      mgr.cleanupAll()

      // Second cleanupAll should do nothing
      io.cleanupCalls.length = 0
      mgr.cleanupAll()
      expect(io.cleanupCalls).toHaveLength(0)
    })
  })

  describe('lifecycle sequencing', () => {
    it('create → waitForExit → cleanupAll follows correct order', async () => {
      const io = createFakeIO()
      io.waitResults.set('/tmp/fake-1/sentinel.txt', 0)
      const mgr = new SentinelManager(io)

      const sentinelPath = mgr.create('claude')!
      const exitCode = await mgr.waitForExit(sentinelPath)
      mgr.cleanupAll()

      expect(io.createCalls).toEqual(['claude'])
      expect(exitCode).toBe(0)
      expect(io.cleanupCalls).toEqual(['/tmp/fake-1'])
    })
  })
})
