import {expect} from 'chai'
import {describe, it} from 'vitest'

import {createSpinner} from '../../src/lib/spinner.js'

describe('Spinner Utilities', () => {
  describe('createSpinner()', () => {
    it('creates spinner with correct text', () => {
      const spinner = createSpinner('Loading...')
      expect(spinner.text).to.equal('Loading...')
    })

    it('returns ora instance', () => {
      const spinner = createSpinner('test')
      expect(spinner).to.have.property('start')
      expect(spinner).to.have.property('stop')
      expect(spinner).to.have.property('succeed')
      expect(spinner).to.have.property('fail')
    })

    it('configures spinner based on environment', () => {
      // Just verify it doesn't throw and returns valid spinner
      const spinner = createSpinner('Test spinner')
      expect(spinner).to.not.be.null
      expect(spinner.text).to.equal('Test spinner')
    })
  })

})
