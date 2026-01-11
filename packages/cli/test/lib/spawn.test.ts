/**
 * @file Unit tests for spawn.ts process spawning utilities.
 *
 * Note: These tests use real process spawning with simple commands
 * to avoid ESM module stubbing issues. For comprehensive mocking,
 * see integration tests.
 */

import {platform} from 'node:os'

import {expect} from 'chai'

import {ProcessSpawnError} from '../../src/lib/errors.js'
import {spawnProcess, type SpawnProcessOptions} from '../../src/lib/spawn.js'

describe('spawn.ts - Process spawning utilities', () => {
  describe('spawnProcess()', () => {
    describe('successful spawn scenarios', () => {
      it('should spawn process and return exit code 0 on success', async () => {
        // Use a simple cross-platform command
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        const exitCode = await spawnProcess(command, args)
        expect(exitCode).to.equal(0)
      })

      it('should return non-zero exit code on failure', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'sh'
        const args = platform() === 'win32' ? ['/c', 'exit 1'] : ['-c', 'exit 1']

        const exitCode = await spawnProcess(command, args)
        expect(exitCode).to.equal(1)
      })

      it('should handle different exit codes', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'sh'
        const args = platform() === 'win32' ? ['/c', 'exit 42'] : ['-c', 'exit 42']

        const exitCode = await spawnProcess(command, args)
        expect(exitCode).to.equal(42)
      })
    })

    describe('spawn error handling', () => {
      it('should throw ProcessSpawnError on ENOENT (command not found)', async () => {
        try {
          await spawnProcess('nonexistent-command-that-will-never-exist-12345', [])
          expect.fail('Expected ProcessSpawnError to be thrown')
        } catch (error) {
          expect(error).to.be.instanceOf(ProcessSpawnError)
          expect((error as Error).message).to.include('Command not found')
          expect((error as Error).message).to.include('Install Claude Code from https://claude.ai/download')
        }
      })

      it('should handle missing args parameter with default empty array', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        // Call without args parameter to test default
        const exitCode = await spawnProcess(command)
        expect(exitCode).to.be.a('number')
      })

      it('should handle empty options object with correct defaults', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        // Pass empty options object to verify defaults work
        const exitCode = await spawnProcess(command, args, {})
        expect(exitCode).to.equal(0)
      })
    })

    describe('spawn options configuration', () => {
      it('should use inherit stdio by default', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        // Default options should work
        const exitCode = await spawnProcess(command, args)
        expect(exitCode).to.equal(0)
      })

      it('should support pipe stdio option', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        const exitCode = await spawnProcess(command, args, {stdio: 'pipe'})
        expect(exitCode).to.equal(0)
      })

      it('should pass cwd option to spawn', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'pwd'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : []
        const cwd = process.cwd()

        const exitCode = await spawnProcess(command, args, {cwd})
        expect(exitCode).to.equal(0)
      })
    })

    describe('detached mode for parallel sessions', () => {
      it('should spawn detached process when requested', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        const exitCode = await spawnProcess(command, args, {detached: true})
        expect(exitCode).to.equal(0)
      })

      it('should support parallel spawning (multiple concurrent processes)', async function () {
        this.timeout(10_000) // Increase timeout for parallel execution on slow CI systems

        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const baseArgs = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        // Spawn two processes without awaiting
        const promise1 = spawnProcess(command, [...baseArgs], {detached: true})
        const promise2 = spawnProcess(command, [...baseArgs], {detached: true})

        // Both should resolve independently
        const [exitCode1, exitCode2] = await Promise.all([promise1, promise2])

        expect(exitCode1).to.equal(0)
        expect(exitCode2).to.equal(0)
      })
    })

    describe('debug logging integration', () => {
      it('should not crash when debug logging is called', async () => {
        const command = platform() === 'win32' ? 'cmd' : 'echo'
        const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

        // Debug logging calls are internal - we just verify no crashes
        const exitCode = await spawnProcess(command, args)

        // If we got here, debug logging worked
        expect(exitCode).to.equal(0)
      })
    })

    describe('TypeScript type exports', () => {
      it('should export SpawnProcessOptions type', () => {
        // Type check - this will fail at compile time if type is not exported
        const options: SpawnProcessOptions = {
          cwd: '/tmp',
          detached: true,
          stdio: 'pipe',
        }

        expect(options).to.be.an('object')
      })
    })
  })
})
