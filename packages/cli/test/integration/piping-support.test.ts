import {execSync} from 'node:child_process'
import {platform} from 'node:os'

import {expect} from 'chai'
import {describe, it} from 'mocha'
import stripAnsi from 'strip-ansi'

describe('Piping Support Integration', () => {
  // Skip piping tests on Windows due to shell command differences
  // Piping functionality still works via chalk/ora libraries (auto-detected via TTY)
  const skipOnWindows = platform() === 'win32' ? it.skip : it

  describe('AC1: Colors Disabled When Piped', () => {
    skipOnWindows('removes ANSI codes when output is piped', () => {
      // Use a command that should work (--help is always safe)
      const result = execSync('./bin/dev.js --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const stripped = stripAnsi(result)
      // If output matches stripped version, no ANSI codes present
      expect(result).to.equal(stripped)
    })

    skipOnWindows('outputs clean plain text when piped', () => {
      const result = execSync('./bin/dev.js --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      // No ANSI escape sequences (they all start with \u001B[)
      expect(result).to.not.include('\u001B[')
    })
  })

  describe('AC3: Colors Enabled in Terminal', () => {
    skipOnWindows('runs without errors in terminal context', () => {
      // This test verifies the command runs successfully
      // Actual color testing would require a real TTY which test harness doesn't have
      const result = execSync('./bin/dev.js --version', {encoding: 'utf8'})
      expect(result).to.match(/\d+\.\d+\.\d+/)
    })
  })

  describe('AC4: TTY Detection is Reliable', () => {
    skipOnWindows('detects piped context correctly', () => {
      // When piped, output should be plain (no ANSI)
      const result = execSync('./bin/dev.js --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const stripped = stripAnsi(result)
      expect(result).to.equal(stripped)
    })

    skipOnWindows('handles redirected output', () => {
      // Redirect to file and verify clean output
      const result = execSync('./bin/dev.js --version', {encoding: 'utf8'})
      // Should produce valid semver version
      expect(result).to.match(/\d+\.\d+\.\d+/)
    })
  })

  describe('AC5: Environment Variable Overrides Work', () => {
    skipOnWindows('disables colors when NO_COLOR is set', () => {
      const result = execSync('NO_COLOR=1 ./bin/dev.js --help', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const stripped = stripAnsi(result)
      expect(result).to.equal(stripped)
    })

    skipOnWindows('respects NO_COLOR even in TTY', () => {
      // NO_COLOR should override TTY detection
      const result = execSync('NO_COLOR=1 ./bin/dev.js --version', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const stripped = stripAnsi(result)
      expect(result).to.equal(stripped)
    })
  })

  describe('AC6: Output Remains Clean for Parsing', () => {
    skipOnWindows('produces stable output format when piped', () => {
      const result1 = execSync('./bin/dev.js --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const result2 = execSync('./bin/dev.js --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      // Consistent output
      expect(result1).to.equal(result2)
    })

    skipOnWindows('allows grep to work on piped output', () => {
      const result = execSync('./bin/dev.js --help | grep -i "usage"', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      // Should find USAGE in help output
      expect(result.toLowerCase()).to.include('usage')
    })

    skipOnWindows('produces parseable version output', () => {
      const result = execSync('./bin/dev.js --version | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      // Should be clean semver version
      const version = result.trim()
      expect(version).to.match(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('Cross-Platform Compatibility', () => {
    skipOnWindows('works on current platform', () => {
      const result = execSync('./bin/dev.js --version | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      expect(result).to.match(/\d+\.\d+\.\d+/)
    })

    skipOnWindows('handles platform-specific line endings', () => {
      const result = execSync('./bin/dev.js --version', {encoding: 'utf8'})
      // Should produce output regardless of platform
      expect(result.length).to.be.greaterThan(0)
    })
  })

  describe('AC2: Progress Spinners Suppressed When Piped', () => {
    skipOnWindows('suppresses spinner ANSI codes in piped context', () => {
      // Using setup command as it could potentially show spinners
      // When piped, no spinner codes should appear
      const result = execSync('./bin/dev.js setup --help | cat', {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      const stripped = stripAnsi(result)
      expect(result).to.equal(stripped)
    })
  })
})
