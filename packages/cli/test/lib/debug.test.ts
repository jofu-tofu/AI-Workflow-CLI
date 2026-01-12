import {expect} from 'chai'
import {type SinonStub, stub} from 'sinon'

import {debug, debugConfig, debugSpawn, debugVersion, isDebugEnabled, setDebugEnabled} from '../../src/lib/debug.js'

describe('debug', () => {
  let stderrStub: SinonStub

  beforeEach(() => {
    // Reset debug state before each test
    setDebugEnabled(false)
    stderrStub = stub(process.stderr, 'write')
  })

  afterEach(() => {
    stderrStub.restore()
    setDebugEnabled(false)
  })

  describe('isDebugEnabled', () => {
    it('returns false by default', () => {
      expect(isDebugEnabled()).to.be.false
    })

    it('returns true after setDebugEnabled(true)', () => {
      setDebugEnabled(true)
      expect(isDebugEnabled()).to.be.true
    })

    it('returns false after setDebugEnabled(false)', () => {
      setDebugEnabled(true)
      setDebugEnabled(false)
      expect(isDebugEnabled()).to.be.false
    })
  })

  describe('setDebugEnabled', () => {
    it('enables debug mode when passed true', () => {
      setDebugEnabled(true)
      expect(isDebugEnabled()).to.be.true
    })

    it('disables debug mode when passed false', () => {
      setDebugEnabled(true)
      setDebugEnabled(false)
      expect(isDebugEnabled()).to.be.false
    })
  })

  describe('debug', () => {
    it('does not output when debug is disabled', () => {
      setDebugEnabled(false)
      debug('test message')
      expect(stderrStub.called).to.be.false
    })

    it('outputs to stderr when debug is enabled', () => {
      setDebugEnabled(true)
      debug('test message')
      expect(stderrStub.called).to.be.true
    })

    it('prefixes message with [debug]', () => {
      setDebugEnabled(true)
      debug('test message')
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('[debug]')
      expect(output).to.include('test message')
    })

    it('includes newline in output', () => {
      setDebugEnabled(true)
      debug('test message')
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('\n')
    })

    it('handles empty messages', () => {
      setDebugEnabled(true)
      debug('')
      expect(stderrStub.called).to.be.true
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('[debug]')
    })

    it('handles messages with special characters', () => {
      setDebugEnabled(true)
      debug(String.raw`path: C:\Users\test\.aiw`)
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include(String.raw`C:\Users\test\.aiw`)
    })
  })

  describe('debugConfig', () => {
    it('should log AIW_DIR path in debug mode', () => {
      setDebugEnabled(true)
      debugConfig({aiwDir: '/home/user/.aiw'})
      expect(stderrStub.called).to.be.true
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('AIW_DIR')
      expect(output).to.include('/home/user/.aiw')
    })

    it('should not log when debug is disabled', () => {
      setDebugEnabled(false)
      debugConfig({aiwDir: '/home/user/.aiw'})
      expect(stderrStub.called).to.be.false
    })

    it('should NOT log full config object (security)', () => {
      setDebugEnabled(true)
      debugConfig({aiwDir: '/home/user/.aiw', secretApiKey: 'should-not-appear'})
      expect(stderrStub.called).to.be.true
      const allOutput = stderrStub
        .getCalls()
        .map((call) => call.args[0])
        .join('')
      // Should log AIW_DIR
      expect(allOutput).to.include('/home/user/.aiw')
      // Should NOT log other config properties (security fix)
      expect(allOutput).to.not.include('secretApiKey')
      expect(allOutput).to.not.include('should-not-appear')
    })
  })

  describe('debugSpawn', () => {
    it('should log command and arguments in debug mode', () => {
      setDebugEnabled(true)
      debugSpawn('claude', ['--dangerously-skip-permissions', '--sandbox'])
      expect(stderrStub.called).to.be.true
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('claude')
      expect(output).to.include('--dangerously-skip-permissions')
      expect(output).to.include('--sandbox')
    })

    it('should not log when debug is disabled', () => {
      setDebugEnabled(false)
      debugSpawn('claude', ['--dangerously-skip-permissions'])
      expect(stderrStub.called).to.be.false
    })

    it('should handle empty arguments array', () => {
      setDebugEnabled(true)
      debugSpawn('claude', [])
      expect(stderrStub.called).to.be.true
      const output = stderrStub.firstCall.args[0]
      expect(output).to.include('claude')
    })
  })

  describe('debugVersion', () => {
    it('should log Node.js version in debug mode', () => {
      setDebugEnabled(true)
      debugVersion()
      expect(stderrStub.called).to.be.true
      const allOutput = stderrStub
        .getCalls()
        .map((call) => call.args[0])
        .join('')
      expect(allOutput).to.include('Node.js')
      expect(allOutput).to.include(process.version)
    })

    it('should not log when debug is disabled', () => {
      setDebugEnabled(false)
      debugVersion()
      expect(stderrStub.called).to.be.false
    })

    it('should log platform information', () => {
      setDebugEnabled(true)
      debugVersion()
      const allOutput = stderrStub
        .getCalls()
        .map((call) => call.args[0])
        .join('')
      expect(allOutput).to.include('Platform')
      expect(allOutput).to.include(process.platform)
    })
  })
})
