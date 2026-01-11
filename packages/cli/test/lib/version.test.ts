/**
 * Unit tests for version detection and compatibility checking.
 * Tests both successful version detection and graceful degradation paths.
 *
 * Note: getClaudeCodeVersion() is tested with actual command execution.
 * This is acceptable as the function gracefully handles missing commands.
 * Tests complete in <1s total, which is acceptable for comprehensive coverage.
 */

import {expect} from 'chai'
import {describe, it} from 'mocha'

import {checkVersionCompatibility, getClaudeCodeVersion} from '../../src/lib/version.js'

describe('version utilities', () => {
  describe('getClaudeCodeVersion', () => {
    it('returns string or null when executed (graceful handling)', async () => {
      // Executes actual claude --version command
      // If Claude Code installed: returns version string
      // If not installed: returns null (graceful degradation)
      const version = await getClaudeCodeVersion()

      // Should be either valid semver or null
      if (version === null) {
        expect(version).to.be.null
      } else {
        expect(version).to.match(/^\d+\.\d+\.\d+$/)
      }
    })

    it('never throws errors - always returns string or null', async () => {
      // Critical: must never throw, even when claude not installed
      try {
        const version = await getClaudeCodeVersion()
        expect(version === null || typeof version === 'string').to.be.true
      } catch {
        expect.fail('getClaudeCodeVersion should never throw, should return null on errors')
      }
    })

    it('completes within timeout (5 seconds)', async function () {
      // Verify timeout is working (prevent hanging)
      this.timeout(6000)
      const start = Date.now()
      await getClaudeCodeVersion()
      const elapsed = Date.now() - start
      // Should complete in under 5 seconds (timeout) even if command hangs
      expect(elapsed).to.be.lessThan(5500)
    })
  })

  describe('checkVersionCompatibility', () => {
    it('marks compatible version as compatible', () => {
      const result = checkVersionCompatibility('0.1.0')
      expect(result.version).to.equal('0.1.0')
      expect(result.compatible).to.be.true
      expect(result.warning).to.be.undefined
    })

    it('marks newer version as compatible', () => {
      const result = checkVersionCompatibility('1.0.0')
      expect(result.version).to.equal('1.0.0')
      expect(result.compatible).to.be.true
      expect(result.warning).to.be.undefined
    })

    it('marks below-minimum version as incompatible', () => {
      const result = checkVersionCompatibility('0.0.5')
      expect(result.version).to.equal('0.0.5')
      expect(result.compatible).to.be.false
      expect(result.warning).to.include('below minimum')
      expect(result.warning).to.include('0.1.0')
    })

    it('marks known incompatible version as incompatible', () => {
      const result = checkVersionCompatibility('0.0.9')
      expect(result.version).to.equal('0.0.9')
      expect(result.compatible).to.be.false
      expect(result.warning).to.include('known issues')
    })

    it('handles null version gracefully', () => {
      const result = checkVersionCompatibility(null)
      expect(result.version).to.be.null
      expect(result.compatible).to.be.true // Assume compatible if unknown
      expect(result.warning).to.include('could not be determined')
    })

    it('handles undefined version gracefully', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const result = checkVersionCompatibility(undefined)
      expect(result.version).to.be.null
      expect(result.compatible).to.be.true
      expect(result.warning).to.include('could not be determined')
    })

    it('compares major version correctly', () => {
      const result = checkVersionCompatibility('1.0.0')
      expect(result.compatible).to.be.true
    })

    it('compares minor version correctly', () => {
      const result = checkVersionCompatibility('0.2.0')
      expect(result.compatible).to.be.true
    })

    it('compares patch version correctly', () => {
      const result = checkVersionCompatibility('0.1.5')
      expect(result.compatible).to.be.true
    })

    it('handles edge case: exactly minimum version', () => {
      const result = checkVersionCompatibility('0.1.0')
      expect(result.compatible).to.be.true
      expect(result.warning).to.be.undefined
    })

    it('handles edge case: one patch below minimum', () => {
      const result = checkVersionCompatibility('0.0.999')
      expect(result.compatible).to.be.false
    })
  })
})
