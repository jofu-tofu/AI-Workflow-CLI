import {describe, expect, it} from 'vitest'

import {ProcessSpawnError} from '../../src/lib/errors.js'
import {classifySpawnError, resolveWindowsSpawnArgs} from '../../src/lib/spawn-errors.js'

describe('spawn-errors', () => {
  describe('classifySpawnError', () => {
    it('classifies ENOENT as command-not-found error', () => {
      const original = Object.assign(new Error('spawn ENOENT'), {code: 'ENOENT'}) as NodeJS.ErrnoException
      const classified = classifySpawnError('claude', original)

      expect(classified).toBeInstanceOf(ProcessSpawnError)
      expect(classified.code).toBe('ENOENT')
      expect(classified.message).toContain('Command not found: claude')
    })

    it('classifies EACCES as permission denied error', () => {
      const original = Object.assign(new Error('spawn EACCES'), {code: 'EACCES'}) as NodeJS.ErrnoException
      const classified = classifySpawnError('claude', original)

      expect(classified).toBeInstanceOf(ProcessSpawnError)
      expect(classified.code).toBe('EACCES')
      expect(classified.message).toContain('Permission denied: claude')
    })

    it('classifies unknown errors with a generic spawn message', () => {
      const original = Object.assign(new Error('boom'), {code: 'EOTHER'}) as NodeJS.ErrnoException
      const classified = classifySpawnError('claude', original)

      expect(classified).toBeInstanceOf(ProcessSpawnError)
      expect(classified.code).toBe('EOTHER')
      expect(classified.message).toContain('Failed to spawn claude: boom')
    })
  })

  describe('resolveWindowsSpawnArgs', () => {
    it('returns cmd.exe invocation when command.cmd exists', () => {
      const resolved = resolveWindowsSpawnArgs('claude', ['--print'], (name) => name === 'claude.cmd')

      expect(resolved).toEqual({
        command: 'cmd.exe',
        args: ['/c', 'claude', '--print'],
      })
    })

    it('returns null when command.cmd does not exist', () => {
      const resolved = resolveWindowsSpawnArgs('claude', ['--print'], () => false)
      expect(resolved).toBeNull()
    })
  })
})
