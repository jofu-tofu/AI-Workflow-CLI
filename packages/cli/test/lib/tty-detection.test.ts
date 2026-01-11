/* eslint-disable @typescript-eslint/ban-ts-comment */
import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {isQuietMode, isStderrTTY, isTTY, shouldShowSpinners, shouldUseColors} from '../../src/lib/tty-detection.js'

describe('TTY Detection', () => {
  describe('isTTY()', () => {
    it('returns true when stdout is TTY', () => {
      // Mock process.stdout.isTTY
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      expect(isTTY()).to.be.true
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('returns false when stdout is not TTY', () => {
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = false
      expect(isTTY()).to.be.false
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('returns false when stdout.isTTY is undefined', () => {
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = undefined
      expect(isTTY()).to.be.false
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })
  })

  describe('isStderrTTY()', () => {
    it('returns true when stderr is TTY', () => {
      const originalIsTTY = process.stderr.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stderr.isTTY = true
      expect(isStderrTTY()).to.be.true
      // @ts-ignore - Restoring property
      process.stderr.isTTY = originalIsTTY
    })

    it('returns false when stderr is not TTY', () => {
      const originalIsTTY = process.stderr.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stderr.isTTY = false
      expect(isStderrTTY()).to.be.false
      // @ts-ignore - Restoring property
      process.stderr.isTTY = originalIsTTY
    })
  })

  describe('shouldUseColors()', () => {
    let originalNoColor: string | undefined
    let originalForceColor: string | undefined

    beforeEach(() => {
      originalNoColor = process.env.NO_COLOR
      originalForceColor = process.env.FORCE_COLOR
    })

    afterEach(() => {
      process.env.NO_COLOR = originalNoColor
      process.env.FORCE_COLOR = originalForceColor
    })

    it('returns false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1'
      delete process.env.FORCE_COLOR
      expect(shouldUseColors()).to.be.false
    })

    it('returns false when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = ''
      delete process.env.FORCE_COLOR
      expect(shouldUseColors()).to.be.false
    })

    it('returns true when FORCE_COLOR is set to 1', () => {
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '1'
      expect(shouldUseColors()).to.be.true
    })

    it('returns true when FORCE_COLOR is set to 2', () => {
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '2'
      expect(shouldUseColors()).to.be.true
    })

    it('returns true when FORCE_COLOR is set to 3', () => {
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '3'
      expect(shouldUseColors()).to.be.true
    })

    it('returns false when FORCE_COLOR is set to 0', () => {
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '0'
      expect(shouldUseColors()).to.be.false
    })

    it('respects TTY status when no env vars set', () => {
      delete process.env.NO_COLOR
      delete process.env.FORCE_COLOR
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      expect(shouldUseColors()).to.be.true
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('returns false when not TTY and no env vars set', () => {
      delete process.env.NO_COLOR
      delete process.env.FORCE_COLOR
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = false
      expect(shouldUseColors()).to.be.false
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })
  })

  describe('shouldShowSpinners()', () => {
    let originalCI: string | undefined

    beforeEach(() => {
      originalCI = process.env.CI
    })

    afterEach(() => {
      process.env.CI = originalCI
    })

    it('returns false when CI environment is set', () => {
      process.env.CI = 'true'
      expect(shouldShowSpinners()).to.be.false
    })

    it('returns false when not TTY', () => {
      delete process.env.CI
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = false
      expect(shouldShowSpinners()).to.be.false
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('returns true when TTY and not in CI', () => {
      delete process.env.CI
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      expect(shouldShowSpinners()).to.be.true
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })

    it('returns false when quiet mode is enabled', () => {
      delete process.env.CI
      const originalIsTTY = process.stdout.isTTY
      // @ts-ignore - Mocking read-only property for testing
      process.stdout.isTTY = true
      expect(shouldShowSpinners({quiet: true})).to.be.false
      // @ts-ignore - Restoring property
      process.stdout.isTTY = originalIsTTY
    })
  })

  describe('isQuietMode()', () => {
    it('returns true when quiet flag is set', () => {
      expect(isQuietMode({quiet: true})).to.be.true
    })

    it('returns false when quiet flag is false', () => {
      expect(isQuietMode({quiet: false})).to.be.false
    })

    it('returns false when quiet flag is not provided', () => {
      expect(isQuietMode({})).to.be.false
    })

    it('returns false when flags object is undefined', () => {
      expect(isQuietMode()).to.be.false
    })
  })
})
