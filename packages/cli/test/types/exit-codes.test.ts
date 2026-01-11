import {expect} from 'chai'

import {EXIT_CODES} from '../../src/types/exit-codes.js'

describe('exit-codes', () => {
  describe('EXIT_CODES', () => {
    it('has SUCCESS code of 0', () => {
      expect(EXIT_CODES.SUCCESS).to.equal(0)
    })

    it('has GENERAL_ERROR code of 1', () => {
      expect(EXIT_CODES.GENERAL_ERROR).to.equal(1)
    })

    it('has INVALID_USAGE code of 2', () => {
      expect(EXIT_CODES.INVALID_USAGE).to.equal(2)
    })

    it('has ENVIRONMENT_ERROR code of 3', () => {
      expect(EXIT_CODES.ENVIRONMENT_ERROR).to.equal(3)
    })

    it('has exactly 4 exit codes', () => {
      expect(Object.keys(EXIT_CODES)).to.have.lengthOf(4)
    })
  })
})
