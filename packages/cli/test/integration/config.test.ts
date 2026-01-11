import {mkdirSync, rmdirSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {ConfigNotFoundError} from '../../src/lib/errors.js'
import {loadConfig, setDebugEnabled} from '../../src/lib/index.js'

describe('config integration', () => {
  const originalPaiHome = process.env['PAI_HOME']

  beforeEach(() => {
    setDebugEnabled(false)
  })

  afterEach(() => {
    if (originalPaiHome === undefined) {
      delete process.env['PAI_HOME']
    } else {
      process.env['PAI_HOME'] = originalPaiHome
    }
  })

  describe('loadConfig end-to-end', () => {
    it('loads config from default ~/.pai when it exists', () => {
      delete process.env['PAI_HOME']
      const defaultPath = join(homedir(), '.pai')

      try {
        const config = loadConfig()
        expect(config.paiHome).to.equal(defaultPath)
        expect(config.claudeConfigPath).to.equal(join(homedir(), '.claude'))
        expect(config.settingsPath).to.equal(join(defaultPath, '.claude', 'settings.json'))
      } catch (error) {
        // If ~/.pai doesn't exist, verify it throws ConfigNotFoundError
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as Error).message).to.include(defaultPath)
      }
    })

    it('loads config from PAI_HOME when set to existing directory', () => {
      const testDir = join(tmpdir(), `pai-test-${Date.now()}`)
      mkdirSync(testDir, {recursive: true})

      try {
        process.env['PAI_HOME'] = testDir
        const config = loadConfig()

        expect(config.paiHome).to.equal(testDir)
        expect(config.claudeConfigPath).to.equal(join(homedir(), '.claude'))
        expect(config.settingsPath).to.equal(join(testDir, '.claude', 'settings.json'))
      } finally {
        try {
          rmdirSync(testDir)
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('throws ConfigNotFoundError with exit code 3 when PAI_HOME does not exist', () => {
      process.env['PAI_HOME'] = '/non/existent/path/that/does/not/exist'

      try {
        loadConfig()
        expect.fail('Expected ConfigNotFoundError to be thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as ConfigNotFoundError).exitCode).to.equal(3)
        expect((error as Error).message).to.include('/non/existent/path/that/does/not/exist')
        expect((error as Error).message).to.include('pai setup')
      }
    })

    it('handles PAI_HOME with unicode characters', () => {
      const unicodePath = join(tmpdir(), `pai-tëst-日本語-${Date.now()}`)
      mkdirSync(unicodePath, {recursive: true})

      try {
        process.env['PAI_HOME'] = unicodePath
        const config = loadConfig()
        expect(config.paiHome).to.equal(unicodePath)
      } finally {
        try {
          rmdirSync(unicodePath)
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('resolves paths correctly on current platform', () => {
      const testDir = join(tmpdir(), `pai-platform-test-${Date.now()}`)
      mkdirSync(testDir, {recursive: true})

      try {
        process.env['PAI_HOME'] = testDir
        const config = loadConfig()

        // Verify paths use platform-appropriate separators
        const isWindows = process.platform === 'win32'
        const separator = isWindows ? '\\' : '/'

        expect(config.paiHome).to.include(separator)
        expect(config.settingsPath).to.include(separator)
      } finally {
        try {
          rmdirSync(testDir)
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })
})
