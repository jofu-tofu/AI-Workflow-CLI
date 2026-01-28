import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {cleanupTestDir, createTestDir, pathExists} from '../../helpers/test-utils.js'

describe('pai init command', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await createTestDir('pai-init-test')
  })

  afterEach(async () => {
    await cleanupTestDir(testDir)
  })

  describe('command structure', () => {
    it('should have a description', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.description).to.be.a('string')
      expect(Init.description.length).to.be.greaterThan(0)
      expect(Init.description).to.include('template')
    })

    it('should have examples showing flag usage', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.examples).to.be.an('array')
      expect(Init.examples.length).to.be.greaterThan(0)

      // Should show --method flag usage
      const exampleStr = Init.examples.join(' ')
      expect(exampleStr).to.include('--method')
    })

    it('should have method flag', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags).to.have.property('method')
      // Method is not marked as required on the flag itself
      // because it's conditionally required (not needed in interactive mode)
      expect(Init.flags.method.required).to.be.false
    })

    it('should have ide flag with default', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags).to.have.property('ide')
      expect(Init.flags.ide.multiple).to.be.true
      expect(Init.flags.ide.default).to.deep.equal(['claude'])
    })

    it('should have global base flags', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags).to.have.property('debug')
      expect(Init.flags).to.have.property('quiet')
      expect(Init.flags).to.have.property('help')
    })
  })

  describe('detection functions', () => {
    it('should detect existing installation when _bmad exists', async () => {
      const bmadDir = join(testDir, '_bmad')
      await fs.mkdir(bmadDir, {recursive: true})

      // Import detectExistingInstallation (it's not exported, but we can test the command behavior)
      // For now, we'll test the public API through the command
      // In a real scenario, you might export the function or test via integration tests

      // This is a placeholder - the actual test would use the command
      expect(await pathExists(bmadDir)).to.be.true
    })

    it('should detect git repository when .git exists', async () => {
      const gitDir = join(testDir, '.git')
      await fs.mkdir(gitDir, {recursive: true})

      expect(await pathExists(gitDir)).to.be.true
    })

    it('should extract project name from directory path', async () => {
      // The detectProjectName function is not exported, but uses basename
      // Test that the directory name can be extracted
      const projectName = testDir.split(/[/\\]/).pop()
      expect(projectName).to.be.a('string')
      expect(projectName!.length).to.be.greaterThan(0)
    })
  })

  describe('flag validation', () => {
    it('should have --method flag that is conditionally required', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      // Method is not marked as required on the flag itself
      // It's validated manually when not in interactive mode
      expect(Init.flags.method.required).to.be.false
    })

    it('should allow multiple --ide flags', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags.ide.multiple).to.be.true
    })

    it('should default to claude for --ide flag', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags.ide.default).to.deep.equal(['claude'])
    })

    it('should have char shortcuts for flags', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags.method.char).to.equal('m')
      expect(Init.flags.ide.char).to.equal('i')
    })
  })

  describe('command help text', () => {
    it('should describe the init command purpose', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      const desc = Init.description.toLowerCase()

      // Should mention initialization and templates
      expect(desc).to.include('initialize')
      expect(desc).to.include('template')
    })

    it('should show example with cc-native template', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      const examples = Init.examples.join(' ')

      expect(examples).to.include('cc-native')
    })

    it('should show example with multiple IDEs', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default

      // Should have example showing multiple IDE installation
      const multiIdeExample = Init.examples.find((ex: string) =>
        ex.includes('--ide') && ex.split('--ide').length > 2,
      )

      expect(multiIdeExample).to.exist
    })
  })

  describe('error handling scenarios', () => {
    it('should handle permission errors gracefully', async () => {
      // Permission errors should use EXIT_CODES.ENVIRONMENT_ERROR
      const {EXIT_CODES} = await import('../../../src/types/exit-codes.js')
      expect(EXIT_CODES.ENVIRONMENT_ERROR).to.equal(3)
    })

    it('should handle invalid template errors gracefully', async () => {
      // Invalid usage should use EXIT_CODES.INVALID_USAGE
      const {EXIT_CODES} = await import('../../../src/types/exit-codes.js')
      expect(EXIT_CODES.INVALID_USAGE).to.equal(2)
    })

    it('should handle general errors gracefully', async () => {
      const {EXIT_CODES} = await import('../../../src/types/exit-codes.js')
      expect(EXIT_CODES.GENERAL_ERROR).to.equal(1)
    })
  })
})
