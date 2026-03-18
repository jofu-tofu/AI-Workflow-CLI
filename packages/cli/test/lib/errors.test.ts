import {expect} from 'chai'
import {describe, it} from 'vitest'

import {
  AiwError,
  ConfigNotFoundError,
  EnvironmentError,
  InvalidUsageError,
  ProcessSpawnError,
} from '../../src/lib/errors.js'
import {EXIT_CODES} from '../../src/types/exit-codes.js'

describe('errors', () => {
  describe('AiwError', () => {
    it('has correct name', () => {
      const error = new AiwError('test message')
      expect(error.name).to.equal('AiwError')
    })

    it('stores message correctly', () => {
      const error = new AiwError('test message')
      expect(error.message).to.equal('test message')
    })

    it('defaults to GENERAL_ERROR exit code', () => {
      const error = new AiwError('test message')
      expect(error.exitCode).to.equal(EXIT_CODES.GENERAL_ERROR)
    })

    it('accepts custom exit code', () => {
      const error = new AiwError('test message', EXIT_CODES.INVALID_USAGE)
      expect(error.exitCode).to.equal(EXIT_CODES.INVALID_USAGE)
    })

    it('extends Error', () => {
      const error = new AiwError('test message')
      expect(error).to.be.instanceOf(Error)
    })
  })

  describe('ConfigNotFoundError', () => {
    it('has correct name', () => {
      const error = new ConfigNotFoundError('config not found')
      expect(error.name).to.equal('ConfigNotFoundError')
    })

    it('has ENVIRONMENT_ERROR exit code', () => {
      const error = new ConfigNotFoundError('config not found')
      expect(error.exitCode).to.equal(EXIT_CODES.ENVIRONMENT_ERROR)
    })

    it('extends AiwError', () => {
      const error = new ConfigNotFoundError('config not found')
      expect(error).to.be.instanceOf(AiwError)
    })
  })

  describe('EnvironmentError', () => {
    it('has correct name', () => {
      const error = new EnvironmentError('environment issue')
      expect(error.name).to.equal('EnvironmentError')
    })

    it('has ENVIRONMENT_ERROR exit code', () => {
      const error = new EnvironmentError('environment issue')
      expect(error.exitCode).to.equal(EXIT_CODES.ENVIRONMENT_ERROR)
    })

    it('extends AiwError', () => {
      const error = new EnvironmentError('environment issue')
      expect(error).to.be.instanceOf(AiwError)
    })
  })

  describe('InvalidUsageError', () => {
    it('has correct name', () => {
      const error = new InvalidUsageError('invalid argument')
      expect(error.name).to.equal('InvalidUsageError')
    })

    it('has INVALID_USAGE exit code', () => {
      const error = new InvalidUsageError('invalid argument')
      expect(error.exitCode).to.equal(EXIT_CODES.INVALID_USAGE)
    })

    it('extends AiwError', () => {
      const error = new InvalidUsageError('invalid argument')
      expect(error).to.be.instanceOf(AiwError)
    })

    it('preserves custom message', () => {
      const message = "Invalid --format value 'xyz'. Use 'json' or 'text'."
      const error = new InvalidUsageError(message)
      expect(error.message).to.equal(message)
    })
  })

  describe('ProcessSpawnError', () => {
    it('has correct name', () => {
      const error = new ProcessSpawnError('spawn failed')
      expect(error.name).to.equal('ProcessSpawnError')
    })

    it('has ENVIRONMENT_ERROR exit code', () => {
      const error = new ProcessSpawnError('spawn failed')
      expect(error.exitCode).to.equal(EXIT_CODES.ENVIRONMENT_ERROR)
    })

    it('extends AiwError', () => {
      const error = new ProcessSpawnError('spawn failed')
      expect(error).to.be.instanceOf(AiwError)
    })

    it('stores error code when provided', () => {
      const error = new ProcessSpawnError('Command not found', 'ENOENT')
      expect(error.code).to.equal('ENOENT')
    })

    it('handles missing error code', () => {
      const error = new ProcessSpawnError('spawn failed')
      expect(error.code).to.be.undefined
    })

    it('preserves message with error code', () => {
      const message = 'Command not found: claude. Install Claude Code from https://claude.ai/download.'
      const error = new ProcessSpawnError(message, 'ENOENT')
      expect(error.message).to.equal(message)
      expect(error.code).to.equal('ENOENT')
    })

    it('preserves provider-specific install message for devin', () => {
      const message = 'Command not found: devin. Install Devin from https://cli.devin.ai.'
      const error = new ProcessSpawnError(message, 'ENOENT')
      expect(error.message).to.equal(message)
      expect(error.code).to.equal('ENOENT')
    })
  })

})
