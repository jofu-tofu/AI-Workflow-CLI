import {expect} from 'chai'
import {describe, it} from 'mocha'

import {
  isQuietMode,
  isStderrTTY,
  isTTY,
  type ProcessLike,
  shouldShowSpinners,
  shouldUseColors,
} from '../../src/lib/tty-detection.js'

/**
 * Creates a mock process object for testing TTY detection functions.
 * This avoids mutating the real process global.
 */
function createMockProcess(options: {
  env?: NodeJS.ProcessEnv
  stderrTTY?: boolean | undefined
  stdoutTTY?: boolean | undefined
}): ProcessLike {
  return {
    env: options.env ?? {},
    stderr: {isTTY: options.stderrTTY},
    stdout: {isTTY: options.stdoutTTY},
  }
}

describe('TTY Detection', () => {
  describe('isTTY()', () => {
    it('returns true when stdout is TTY', () => {
      const mockProcess = createMockProcess({stdoutTTY: true})
      expect(isTTY(mockProcess)).to.be.true
    })

    it('returns false when stdout is not TTY', () => {
      const mockProcess = createMockProcess({stdoutTTY: false})
      expect(isTTY(mockProcess)).to.be.false
    })

    it('returns false when stdout.isTTY is undefined', () => {
      const mockProcess = createMockProcess({stdoutTTY: undefined})
      expect(isTTY(mockProcess)).to.be.false
    })
  })

  describe('isStderrTTY()', () => {
    it('returns true when stderr is TTY', () => {
      const mockProcess = createMockProcess({stdoutTTY: false, stderrTTY: true})
      expect(isStderrTTY(mockProcess)).to.be.true
    })

    it('returns false when stderr is not TTY', () => {
      const mockProcess = createMockProcess({stdoutTTY: false, stderrTTY: false})
      expect(isStderrTTY(mockProcess)).to.be.false
    })
  })

  describe('shouldUseColors()', () => {
    it('returns false when NO_COLOR is set', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {NO_COLOR: '1'},
      })
      expect(shouldUseColors(mockProcess)).to.be.false
    })

    it('returns false when NO_COLOR is empty string', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {NO_COLOR: ''},
      })
      expect(shouldUseColors(mockProcess)).to.be.false
    })

    it('returns true when FORCE_COLOR is set to 1', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: false,
        env: {FORCE_COLOR: '1'},
      })
      expect(shouldUseColors(mockProcess)).to.be.true
    })

    it('returns true when FORCE_COLOR is set to 2', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: false,
        env: {FORCE_COLOR: '2'},
      })
      expect(shouldUseColors(mockProcess)).to.be.true
    })

    it('returns true when FORCE_COLOR is set to 3', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: false,
        env: {FORCE_COLOR: '3'},
      })
      expect(shouldUseColors(mockProcess)).to.be.true
    })

    it('returns false when FORCE_COLOR is set to 0', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {FORCE_COLOR: '0'},
      })
      expect(shouldUseColors(mockProcess)).to.be.false
    })

    it('respects TTY status when no env vars set', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {},
      })
      expect(shouldUseColors(mockProcess)).to.be.true
    })

    it('returns false when not TTY and no env vars set', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: false,
        env: {},
      })
      expect(shouldUseColors(mockProcess)).to.be.false
    })
  })

  describe('shouldShowSpinners()', () => {
    it('returns false when CI environment is set', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {CI: 'true'},
      })
      expect(shouldShowSpinners(undefined, mockProcess)).to.be.false
    })

    it('returns false when not TTY', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: false,
        env: {},
      })
      expect(shouldShowSpinners(undefined, mockProcess)).to.be.false
    })

    it('returns true when TTY and not in CI', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {},
      })
      expect(shouldShowSpinners(undefined, mockProcess)).to.be.true
    })

    it('returns false when quiet mode is enabled', () => {
      const mockProcess = createMockProcess({
        stdoutTTY: true,
        env: {},
      })
      expect(shouldShowSpinners({quiet: true}, mockProcess)).to.be.false
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
