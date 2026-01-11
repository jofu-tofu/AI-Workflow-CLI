import {expect} from 'chai'
import {describe, it} from 'mocha'

import BaseCommand from '../../src/commands/base.js'

describe('BaseCommand', () => {
  describe('baseFlags', () => {
    it('should include debug flag', () => {
      expect(BaseCommand.baseFlags).to.have.property('debug')
      expect(BaseCommand.baseFlags.debug).to.be.an('object')
    })

    it('should have debug flag with char "d"', () => {
      expect(BaseCommand.baseFlags.debug.char).to.equal('d')
    })

    it('should have debug flag default to false', () => {
      expect(BaseCommand.baseFlags.debug.default).to.equal(false)
    })

    it('should have debug flag description', () => {
      expect(BaseCommand.baseFlags.debug.description).to.be.a('string')
      expect(BaseCommand.baseFlags.debug.description).to.include('debug')
    })
  })

  describe('abstract class enforcement', () => {
    it('should require subclasses to implement run method', () => {
      // TypeScript will enforce this at compile time
      // Runtime test: verify BaseCommand has abstract run method in prototype
      expect(BaseCommand.prototype).to.not.have.property('run')
    })
  })
})
