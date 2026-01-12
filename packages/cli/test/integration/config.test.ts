import {mkdirSync, rmdirSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {ConfigNotFoundError} from '../../src/lib/errors.js'
import {loadConfig, setDebugEnabled} from '../../src/lib/index.js'

describe('config integration', () => {
  const originalAiwDir = process.env['AIW_DIR']

  beforeEach(() => {
    setDebugEnabled(false)
  })

  afterEach(() => {
    if (originalAiwDir === undefined) {
      delete process.env['AIW_DIR']
    } else {
      process.env['AIW_DIR'] = originalAiwDir
    }
  })

  describe('loadConfig end-to-end', () => {
    it('loads config from default ~/.aiw when it exists', () => {
      delete process.env['AIW_DIR']
      const defaultPath = join(homedir(), '.aiw')

      try {
        const config = loadConfig()
        expect(config.aiwDir).to.equal(defaultPath)
        expect(config.claudeConfigPath).to.equal(join(homedir(), '.claude'))
        expect(config.settingsPath).to.equal(join(defaultPath, '.claude', 'settings.json'))
      } catch (error) {
        // If ~/.aiw doesn't exist, verify it throws ConfigNotFoundError
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as Error).message).to.include(defaultPath)
      }
    })

    it('loads config from AIW_DIR when set to existing directory', () => {
      const testDir = join(tmpdir(), `aiw-test-${Date.now()}`)
      mkdirSync(testDir, {recursive: true})

      try {
        process.env['AIW_DIR'] = testDir
        const config = loadConfig()

        expect(config.aiwDir).to.equal(testDir)
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

    it('throws ConfigNotFoundError with exit code 3 when AIW_DIR does not exist', () => {
      process.env['AIW_DIR'] = '/non/existent/path/that/does/not/exist'

      try {
        loadConfig()
        expect.fail('Expected ConfigNotFoundError to be thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as ConfigNotFoundError).exitCode).to.equal(3)
        expect((error as Error).message).to.include('/non/existent/path/that/does/not/exist')
        expect((error as Error).message).to.include('aiw setup')
      }
    })

    it('handles AIW_DIR with unicode characters', () => {
      const unicodePath = join(tmpdir(), `aiw-tëst-日本語-${Date.now()}`)
      mkdirSync(unicodePath, {recursive: true})

      try {
        process.env['AIW_DIR'] = unicodePath
        const config = loadConfig()
        expect(config.aiwDir).to.equal(unicodePath)
      } finally {
        try {
          rmdirSync(unicodePath)
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('resolves paths correctly on current platform', () => {
      const testDir = join(tmpdir(), `aiw-platform-test-${Date.now()}`)
      mkdirSync(testDir, {recursive: true})

      try {
        process.env['AIW_DIR'] = testDir
        const config = loadConfig()

        // Verify paths use platform-appropriate separators
        const isWindows = process.platform === 'win32'
        const separator = isWindows ? '\\' : '/'

        expect(config.aiwDir).to.include(separator)
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
