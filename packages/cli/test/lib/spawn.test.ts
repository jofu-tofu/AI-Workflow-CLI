/**
 * @file Unit tests for spawn.ts process spawning utilities.
 *
 * Note: These tests use real process spawning with simple commands
 * to avoid ESM module stubbing issues.
 */

import {platform} from 'node:os'

import {expect} from 'chai'

import {ProcessSpawnError} from '../../src/lib/errors.js'
import {spawnProcess, type SpawnProcessOptions} from '../../src/lib/spawn.js'

describe('spawn.ts - Process spawning utilities', () => {
  describe('spawnProcess()', () => {
    it('should return correct exit codes (0, 1, 42)', async () => {
      const command = platform() === 'win32' ? 'cmd' : 'sh'
      const makeArgs = (code: number) =>
        platform() === 'win32' ? ['/c', `exit ${code}`] : ['-c', `exit ${code}`]

      expect(await spawnProcess(command, makeArgs(0))).to.equal(0)
      expect(await spawnProcess(command, makeArgs(1))).to.equal(1)
      expect(await spawnProcess(command, makeArgs(42))).to.equal(42)
    })

    it('should work with default, pipe, and cwd options', async () => {
      const command = platform() === 'win32' ? 'cmd' : 'echo'
      const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

      // Default options
      expect(await spawnProcess(command, args)).to.equal(0)
      // Pipe stdio
      expect(await spawnProcess(command, args, {stdio: 'pipe'})).to.equal(0)
      // Custom cwd
      expect(await spawnProcess(command, args, {cwd: process.cwd()})).to.equal(0)
      // Empty options object
      expect(await spawnProcess(command, args, {})).to.equal(0)
    })

    it('should throw ProcessSpawnError on ENOENT (command not found)', async () => {
      try {
        await spawnProcess('nonexistent-command-that-will-never-exist-12345', [])
        expect.fail('Expected ProcessSpawnError to be thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(ProcessSpawnError)
        // Some environments (e.g. WSL) return EACCES instead of ENOENT
        const message = (error as Error).message
        expect(message).to.satisfy(
          (m: string) => m.includes('Command not found') || m.includes('Permission denied'),
          `Expected "Command not found" or "Permission denied", got: ${message}`,
        )
      }
    })

    it('should spawn detached process when requested', async () => {
      const command = platform() === 'win32' ? 'cmd' : 'echo'
      const args = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

      const exitCode = await spawnProcess(command, args, {detached: true})
      expect(exitCode).to.equal(0)
    })

    it('should support parallel spawning (multiple concurrent processes)', async function () {
      this.timeout(10_000)

      const command = platform() === 'win32' ? 'cmd' : 'echo'
      const baseArgs = platform() === 'win32' ? ['/c', 'exit 0'] : ['test']

      const [exitCode1, exitCode2] = await Promise.all([
        spawnProcess(command, [...baseArgs], {detached: true}),
        spawnProcess(command, [...baseArgs], {detached: true}),
      ])

      expect(exitCode1).to.equal(0)
      expect(exitCode2).to.equal(0)
    })

    it('should export SpawnProcessOptions type', () => {
      const options: SpawnProcessOptions = {
        cwd: '/tmp',
        detached: true,
        stdio: 'pipe',
      }
      expect(options).to.be.an('object')
    })
  })
})
