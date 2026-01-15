import {mkdirSync, rmdirSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {type AiwcliConfig, getAiwDir, loadConfig, validateAiwDir} from '../../src/lib/config.js'
import {ConfigNotFoundError} from '../../src/lib/errors.js'

describe('config', () => {
  const originalAiwDir = process.env['AIW_DIR']

  afterEach(() => {
    if (originalAiwDir === undefined) {
      delete process.env['AIW_DIR']
    } else {
      process.env['AIW_DIR'] = originalAiwDir
    }
  })

  describe('getAiwDir', () => {
    it('returns a string path', () => {
      delete process.env['AIW_DIR']
      const result = getAiwDir()
      expect(result).to.be.a('string')
    })

    it('returns path containing .aiw', () => {
      delete process.env['AIW_DIR']
      const result = getAiwDir()
      expect(result).to.include('.aiw')
    })

    it('respects AIW_DIR environment variable when set', () => {
      process.env['AIW_DIR'] = '/custom/aiw/home'
      const result = getAiwDir()
      expect(result).to.equal('/custom/aiw/home')
    })

    it('returns default path when AIW_DIR is not set', () => {
      delete process.env['AIW_DIR']
      const result = getAiwDir()
      expect(result).to.equal(join(homedir(), '.aiw'))
    })
  })

  describe('AiwConfig', () => {
    it('interface is importable and has expected shape with all properties', () => {
      const config: AiwcliConfig = {
        claudeConfigPath: '/test/.claude',
        aiwDir: '/test/path',
        settingsPath: '/test/path/.claude/settings.json',
      }
      expect(config.aiwDir).to.equal('/test/path')
      expect(config.claudeConfigPath).to.equal('/test/.claude')
      expect(config.settingsPath).to.equal('/test/path/.claude/settings.json')
    })
  })

  describe('validateAiwDir', () => {
    it('does not throw when directory exists', () => {
      // Use homedir which always exists
      expect(() => validateAiwDir(homedir())).to.not.throw()
    })

    it('throws ConfigNotFoundError when directory does not exist', () => {
      const nonExistentPath = '/this/path/definitely/does/not/exist/12345'
      expect(() => validateAiwDir(nonExistentPath)).to.throw(ConfigNotFoundError)
    })

    it('throws error with actionable message', () => {
      const nonExistentPath = '/fake/aiw/home'
      try {
        validateAiwDir(nonExistentPath)
        expect.fail('Expected ConfigNotFoundError to be thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as Error).message).to.include('/fake/aiw/home')
        expect((error as Error).message).to.include('aiw setup')
        expect((error as Error).message).to.include('AIW_DIR')
      }
    })
  })

  describe('loadConfig', () => {
    it('returns AiwConfig with all required properties', () => {
      // Point to a directory that exists
      process.env['AIW_DIR'] = homedir()
      const config = loadConfig()
      expect(config).to.have.property('aiwDir')
      expect(config).to.have.property('claudeConfigPath')
      expect(config).to.have.property('settingsPath')
    })

    it('uses cross-platform path separators', () => {
      process.env['AIW_DIR'] = homedir()
      const config = loadConfig()
      // path.join() should produce platform-appropriate paths
      // On Windows: C:\Users\... On Unix: /home/...
      const expectedHome = homedir()
      expect(config.aiwDir).to.equal(expectedHome)
      expect(config.claudeConfigPath).to.equal(join(expectedHome, '.claude'))
      expect(config.settingsPath).to.equal(join(expectedHome, '.claude', 'settings.json'))
    })

    it('aiwDir matches getAiwDir result', () => {
      process.env['AIW_DIR'] = homedir()
      const config = loadConfig()
      expect(config.aiwDir).to.equal(getAiwDir())
    })

    it('claudeConfigPath is in home directory', () => {
      process.env['AIW_DIR'] = homedir()
      const config = loadConfig()
      expect(config.claudeConfigPath).to.equal(join(homedir(), '.claude'))
    })

    it('settingsPath is in aiwDir/.claude directory', () => {
      process.env['AIW_DIR'] = homedir()
      const config = loadConfig()
      expect(config.settingsPath).to.equal(join(config.aiwDir, '.claude', 'settings.json'))
    })

    it('throws ConfigNotFoundError when AIW_DIR does not exist', () => {
      process.env['AIW_DIR'] = '/non/existent/path'
      expect(() => loadConfig()).to.throw(ConfigNotFoundError)
    })

    it('uses default ~/.aiw when AIW_DIR not set and directory exists', () => {
      delete process.env['AIW_DIR']
      // This test will only pass if ~/.aiw exists, otherwise it throws
      // We test the throwing case separately
      const defaultPath = join(homedir(), '.aiw')
      try {
        const config = loadConfig()
        expect(config.aiwDir).to.equal(defaultPath)
      } catch (error) {
        // If ~/.aiw doesn't exist, that's expected behavior
        expect(error).to.be.instanceOf(ConfigNotFoundError)
      }
    })

    it('handles AIW_DIR paths with spaces', () => {
      const pathWithSpaces = join(tmpdir(), 'test path with spaces')
      try {
        mkdirSync(pathWithSpaces, {recursive: true})
        process.env['AIW_DIR'] = pathWithSpaces
        const config = loadConfig()
        expect(config.aiwDir).to.equal(pathWithSpaces)
        expect(config.settingsPath).to.equal(join(pathWithSpaces, '.claude', 'settings.json'))
      } finally {
        try {
          rmdirSync(pathWithSpaces)
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })
})
