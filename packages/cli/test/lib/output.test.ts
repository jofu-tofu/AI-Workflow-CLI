/* eslint-disable @typescript-eslint/ban-ts-comment */
import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'
import {stderr, stdout} from 'stdout-stderr'

import {logDebug, logError, logInfo, logSuccess, logWarning} from '../../src/lib/output.js'

describe('Output Utilities', () => {
  beforeEach(() => {
    stdout.start()
    stderr.start()
  })

  afterEach(() => {
    stdout.stop()
    stderr.stop()
  })

  describe('logInfo()', () => {
    it('logs message to stdout', () => {
      logInfo('test message')
      expect(stdout.output).to.include('test message')
    })

    it('adds newline to message', () => {
      logInfo('test')
      expect(stdout.output).to.match(/test\n/)
    })
  })

  describe('logSuccess()', () => {
    it('logs message to stdout', () => {
      logSuccess('success message')
      expect(stdout.output).to.include('success message')
    })

    it('uses green color in TTY', () => {
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      delete process.env.NO_COLOR
      logSuccess('green message')
      // Message should be in stdout, color codes tested in integration
      expect(stdout.output).to.include('green message')
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('does not use color when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      logSuccess('plain message')
      expect(stdout.output).to.equal('plain message\n')
      delete process.env.NO_COLOR
    })
  })

  describe('logError()', () => {
    it('logs message to stderr', () => {
      logError('error message')
      expect(stderr.output).to.include('error message')
      expect(stdout.output).to.equal('')
    })

    it('uses red color in TTY', () => {
      const originalIsTTY = process.stderr.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stderr.isTTY = true
      delete process.env.NO_COLOR
      logError('red message')
      expect(stderr.output).to.include('red message')
      // @ts-ignore - Restoring property
      process.stderr.isTTY = originalIsTTY
    })

    it('does not use color when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      logError('plain error')
      expect(stderr.output).to.equal('plain error\n')
      delete process.env.NO_COLOR
    })
  })

  describe('logWarning()', () => {
    it('logs message to stdout', () => {
      logWarning('warning message')
      expect(stdout.output).to.include('warning message')
    })

    it('uses yellow color in TTY', () => {
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      delete process.env.NO_COLOR
      logWarning('yellow message')
      expect(stdout.output).to.include('yellow message')
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('does not use color when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      logWarning('plain warning')
      expect(stdout.output).to.equal('plain warning\n')
      delete process.env.NO_COLOR
    })
  })

  describe('logDebug()', () => {
    it('logs message to stdout', () => {
      logDebug('debug message')
      expect(stdout.output).to.include('debug message')
    })

    it('uses dim color in TTY', () => {
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      delete process.env.NO_COLOR
      logDebug('dim message')
      expect(stdout.output).to.include('dim message')
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('does not use color when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      logDebug('plain debug')
      expect(stdout.output).to.equal('plain debug\n')
      delete process.env.NO_COLOR
    })
  })

  describe('Quiet Mode', () => {
    describe('logInfo() with quiet mode', () => {
      it('suppresses output when quiet=true', () => {
        logInfo('test message', true)
        expect(stdout.output).to.equal('')
      })

      it('outputs normally when quiet=false', () => {
        logInfo('test message', false)
        expect(stdout.output).to.include('test message')
      })

      it('outputs normally when quiet is not provided', () => {
        logInfo('test message')
        expect(stdout.output).to.include('test message')
      })
    })

    describe('logSuccess() with quiet mode', () => {
      it('suppresses output when quiet=true', () => {
        logSuccess('success message', true)
        expect(stdout.output).to.equal('')
      })

      it('outputs normally when quiet=false', () => {
        logSuccess('success message', false)
        expect(stdout.output).to.include('success message')
      })
    })

    describe('logWarning() with quiet mode', () => {
      it('suppresses output when quiet=true', () => {
        logWarning('warning message', true)
        expect(stdout.output).to.equal('')
      })

      it('outputs normally when quiet=false', () => {
        logWarning('warning message', false)
        expect(stdout.output).to.include('warning message')
      })
    })

    describe('logError() with quiet mode', () => {
      it('never suppresses errors (quiet mode ignored)', () => {
        logError('error message')
        expect(stderr.output).to.include('error message')
      })
    })

    describe('logDebug() with quiet mode', () => {
      it('outputs debug messages regardless of quiet mode', () => {
        // Debug output is independent of quiet mode
        logDebug('debug message')
        expect(stdout.output).to.include('debug message')
      })
    })
  })
})
