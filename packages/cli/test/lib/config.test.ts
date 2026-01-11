import {mkdirSync, rmdirSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {getPaiHome, loadConfig, type PaiConfig, validatePaiHome} from '../../src/lib/config.js'
import {ConfigNotFoundError} from '../../src/lib/errors.js'

describe('config', () => {
  const originalPaiHome = process.env['PAI_HOME']

  afterEach(() => {
    if (originalPaiHome === undefined) {
      delete process.env['PAI_HOME']
    } else {
      process.env['PAI_HOME'] = originalPaiHome
    }
  })

  describe('getPaiHome', () => {
    it('returns a string path', () => {
      delete process.env['PAI_HOME']
      const result = getPaiHome()
      expect(result).to.be.a('string')
    })

    it('returns path containing .pai', () => {
      delete process.env['PAI_HOME']
      const result = getPaiHome()
      expect(result).to.include('.pai')
    })

    it('respects PAI_HOME environment variable when set', () => {
      process.env['PAI_HOME'] = '/custom/pai/home'
      const result = getPaiHome()
      expect(result).to.equal('/custom/pai/home')
    })

    it('returns default path when PAI_HOME is not set', () => {
      delete process.env['PAI_HOME']
      const result = getPaiHome()
      expect(result).to.equal(join(homedir(), '.pai'))
    })
  })

  describe('PaiConfig', () => {
    it('interface is importable and has expected shape with all properties', () => {
      const config: PaiConfig = {
        claudeConfigPath: '/test/.claude',
        paiHome: '/test/path',
        settingsPath: '/test/path/.claude/settings.json',
      }
      expect(config.paiHome).to.equal('/test/path')
      expect(config.claudeConfigPath).to.equal('/test/.claude')
      expect(config.settingsPath).to.equal('/test/path/.claude/settings.json')
    })
  })

  describe('validatePaiHome', () => {
    it('does not throw when directory exists', () => {
      // Use homedir which always exists
      expect(() => validatePaiHome(homedir())).to.not.throw()
    })

    it('throws ConfigNotFoundError when directory does not exist', () => {
      const nonExistentPath = '/this/path/definitely/does/not/exist/12345'
      expect(() => validatePaiHome(nonExistentPath)).to.throw(ConfigNotFoundError)
    })

    it('throws error with actionable message', () => {
      const nonExistentPath = '/fake/pai/home'
      try {
        validatePaiHome(nonExistentPath)
        expect.fail('Expected ConfigNotFoundError to be thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(ConfigNotFoundError)
        expect((error as Error).message).to.include('/fake/pai/home')
        expect((error as Error).message).to.include('pai setup')
        expect((error as Error).message).to.include('PAI_HOME')
      }
    })
  })

  describe('loadConfig', () => {
    it('returns PaiConfig with all required properties', () => {
      // Point to a directory that exists
      process.env['PAI_HOME'] = homedir()
      const config = loadConfig()
      expect(config).to.have.property('paiHome')
      expect(config).to.have.property('claudeConfigPath')
      expect(config).to.have.property('settingsPath')
    })

    it('uses cross-platform path separators', () => {
      process.env['PAI_HOME'] = homedir()
      const config = loadConfig()
      // path.join() should produce platform-appropriate paths
      // On Windows: C:\Users\... On Unix: /home/...
      const expectedHome = homedir()
      expect(config.paiHome).to.equal(expectedHome)
      expect(config.claudeConfigPath).to.equal(join(expectedHome, '.claude'))
      expect(config.settingsPath).to.equal(join(expectedHome, '.claude', 'settings.json'))
    })

    it('paiHome matches getPaiHome result', () => {
      process.env['PAI_HOME'] = homedir()
      const config = loadConfig()
      expect(config.paiHome).to.equal(getPaiHome())
    })

    it('claudeConfigPath is in home directory', () => {
      process.env['PAI_HOME'] = homedir()
      const config = loadConfig()
      expect(config.claudeConfigPath).to.equal(join(homedir(), '.claude'))
    })

    it('settingsPath is in paiHome/.claude directory', () => {
      process.env['PAI_HOME'] = homedir()
      const config = loadConfig()
      expect(config.settingsPath).to.equal(join(config.paiHome, '.claude', 'settings.json'))
    })

    it('throws ConfigNotFoundError when PAI_HOME does not exist', () => {
      process.env['PAI_HOME'] = '/non/existent/path'
      expect(() => loadConfig()).to.throw(ConfigNotFoundError)
    })

    it('uses default ~/.pai when PAI_HOME not set and directory exists', () => {
      delete process.env['PAI_HOME']
      // This test will only pass if ~/.pai exists, otherwise it throws
      // We test the throwing case separately
      const defaultPath = join(homedir(), '.pai')
      try {
        const config = loadConfig()
        expect(config.paiHome).to.equal(defaultPath)
      } catch (error) {
        // If ~/.pai doesn't exist, that's expected behavior
        expect(error).to.be.instanceOf(ConfigNotFoundError)
      }
    })

    it('handles PAI_HOME paths with spaces', () => {
      const pathWithSpaces = join(tmpdir(), 'test path with spaces')
      try {
        mkdirSync(pathWithSpaces, {recursive: true})
        process.env['PAI_HOME'] = pathWithSpaces
        const config = loadConfig()
        expect(config.paiHome).to.equal(pathWithSpaces)
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
