import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {cleanupTestDir, createTestDir} from '../../helpers/test-utils.js'

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

    it('should have ide flag configured for multiple selection', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags).to.have.property('ide')
      expect(Init.flags.ide.multiple).to.be.true
      expect(Init.flags.ide.default).to.equal(undefined)
    })

    it('should have global base flags', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags).to.have.property('debug')
      expect(Init.flags).to.have.property('quiet')
      expect(Init.flags).to.have.property('help')
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

    it('should not hardcode a default --ide list on the flag', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags.ide.default).to.equal(undefined)
    })

    it('should have char shortcuts for flags', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      expect(Init.flags.method.char).to.equal('m')
      expect(Init.flags.ide.char).to.equal('i')
    })

    it('should show --ide usage in examples', async () => {
      const Init = (await import('../../../src/commands/init/index.js')).default
      const examples = Init.examples.join(' ')
      expect(examples).to.include('--ide')
    })
  })

})
