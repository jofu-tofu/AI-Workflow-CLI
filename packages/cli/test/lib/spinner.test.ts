import {expect} from 'chai'
import {describe, it} from 'mocha'

import {createSpinner, withSpinner} from '../../src/lib/spinner.js'

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

  describe('withSpinner()', () => {
    it('executes operation and returns result', async () => {
      const result = await withSpinner('Loading...', async () => 'success')
      expect(result).to.equal('success')
    })

    it('propagates errors from operation', async () => {
      try {
        await withSpinner('Loading...', async () => {
          throw new Error('Test error')
        })
        expect.fail('Should have thrown error')
      } catch (error) {
        expect((error as Error).message).to.equal('Test error')
      }
    })
  })
})
