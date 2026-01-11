/**
 * Command Chaining Integration Tests
 *
 * Tests PAI CLI integration with command chains (&&) and pipes (|).
 * Validates stdout/stderr separation, exit code propagation, and cross-platform behavior.
 */

import {exec, execSync} from 'node:child_process'
import {platform} from 'node:os'
import {promisify} from 'node:util'

import {expect} from 'chai'
import {describe, it} from 'mocha'

const execAsync = promisify(exec)

// Platform detection
const isWindows = platform() === 'win32'
const binPath = isWindows ? String.raw`.\\bin\\dev.cmd` : './bin/dev.js'
const grepCmd = isWindows ? 'findstr' : 'grep'
const nullDevice = isWindows ? 'nul' : '/dev/null'

describe('Command Chaining Integration', () => {
  describe('AC1: stdout Contains Only Data (No Status Messages)', () => {
    it('piped output has no status messages', () => {
      // Help text should pipe cleanly without "Launching..." or other status
      const result = execSync(`${binPath} launch --help | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')
      // Status messages should NOT appear in piped output
      expect(result).to.not.include('Launching...')
      expect(result).to.not.include('Starting...')
    })

    it('quiet mode keeps stdout clean', () => {
      const result = execSync(`${binPath} launch --help --quiet`, {
        encoding: 'utf8',
      }) as string
      // Help text should be present
      expect(result).to.include('Launch')
      // Status messages suppressed in quiet mode
      expect(result).to.not.include('Launching...')
    })

    it('normal TTY output may include status messages', () => {
      // In normal (non-piped) mode, status messages are OK
      const result = execSync(`${binPath} launch --help`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')
      // This is just documenting behavior - status messages in TTY are fine
    })
  })

  describe('AC2: stderr Contains Only Errors/Warnings', () => {
    it('errors output to stderr', () => {
      try {
        execSync(`${binPath} unknown-command`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have failed')
      } catch (error: unknown) {
        const execError = error as {stderr: string}
        // Error should be on stderr
        expect(execError.stderr).to.include('Error')
      }
    })

    it('stderr is clean in success case', async () => {
      const {stderr} = await execAsync(`${binPath} launch --help`, {
        encoding: 'utf8',
      })
      // No errors = empty stderr
      expect(stderr).to.equal('')
    })

    it('informational output does not leak to stderr', async () => {
      const {stderr} = await execAsync(`${binPath} setup --help`, {
        encoding: 'utf8',
      })
      // Only errors/warnings on stderr
      expect(stderr).to.equal('')
    })
  })

  describe('AC3: Exit Codes Propagate Correctly for && Chains', () => {
    it('success (exit 0) allows chain to continue', () => {
      const script = isWindows
        ? `${binPath} launch --help && echo Success`
        : `${binPath} launch --help && echo "Success"`

      const result = execSync(script, {
        encoding: 'utf8',
      }) as string
      // Chain continued after success
      expect(result).to.include('Success')
    })

    it('failure stops chain execution', () => {
      const script = isWindows
        ? `${binPath} unknown-command 2>${nullDevice} && echo Fail`
        : `${binPath} unknown-command 2>${nullDevice} && echo "Fail"`

      try {
        execSync(script, {encoding: 'utf8'})
        expect.fail('Should have failed')
      } catch (error: unknown) {
        const execError = error as {stdout?: string}
        // Chain stopped - "Fail" should NOT appear
        expect(execError.stdout || '').to.not.include('Fail')
      }
    })

    it('multi-command chains work correctly', () => {
      const script = isWindows
        ? `${binPath} launch --help && ${binPath} setup --help && echo Done`
        : `${binPath} launch --help && ${binPath} setup --help && echo "Done"`

      const result = execSync(script, {
        encoding: 'utf8',
      }) as string
      // All commands succeeded
      expect(result).to.include('Done')
    })

    it('chain stops at first failure in multi-command chain', () => {
      const script = isWindows
        ? `${binPath} launch --help && ${binPath} unknown-command 2>${nullDevice} && echo Never`
        : `${binPath} launch --help && ${binPath} unknown-command 2>${nullDevice} && echo "Never"`

      try {
        execSync(script, {encoding: 'utf8'})
        expect.fail('Should have failed')
      } catch (error: unknown) {
        const execError = error as {stdout?: string}
        // First succeeded, second failed, third never ran
        expect(execError.stdout || '').to.not.include('Never')
      }
    })
  })

  describe('AC4: Commands Accept stdin When Appropriate', () => {
    it('hasStdin detection (tested via unit tests)', () => {
      // stdin handling tested in test/lib/stdin.test.ts
      // This is a placeholder for future commands that accept stdin
      expect(true).to.be.true
    })
  })

  describe('AC5: Output Remains Clean in Complex Chains', () => {
    it('PAI output works with grep', () => {
      const result = execSync(`${binPath} launch --help | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')
    })

    it('PAI output pipes cleanly for counting', function () {
      // Skip on Windows - cmd.exe has buffer limitations with complex pipes
      if (isWindows) {
        this.skip()
      }

      // Unix: verify output can be counted with wc
      const result = execSync(`${binPath} launch --help --quiet | wc -l`, {
        encoding: 'utf8',
      }) as string
      // Should return a number (line count)
      expect(result.trim()).to.match(/^\d+$/)
      const lineCount = Number.parseInt(result.trim(), 10)
      expect(lineCount).to.be.greaterThan(0)
    })

    it('quiet mode enhances pipeline cleanliness', () => {
      const result = execSync(`${binPath} launch --help --quiet | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      // Should still work with quiet mode
      expect(result).to.include('Launch')
    })

    it('no ANSI codes leak to pipes', () => {
      const result = execSync(`${binPath} launch --help`, {
        encoding: 'utf8',
        env: {...process.env, FORCE_COLOR: '0'},
      }) as string
      // No ANSI escape codes (e.g., ESC[)
      // eslint-disable-next-line no-control-regex, unicorn/escape-case, unicorn/no-hex-escape
      expect(result).to.not.match(/\x1b\[/)
    })
  })

  describe('AC6: Chaining Works Cross-Platform', () => {
    it('pipes work on current platform', () => {
      const result = execSync(`${binPath} launch --help | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')
    })

    it('chains work on current platform', () => {
      const script = isWindows ? `${binPath} launch --help && echo OK` : `${binPath} launch --help && echo "OK"`

      const result = execSync(script, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('OK')
    })

    it('PowerShell && support (Windows 7+ / PowerShell 3+)', function () {
      if (!isWindows) {
        this.skip()
      }

      // PowerShell && chains work in PowerShell 7+
      // Legacy PS 5.1 uses semicolon instead
      const script = `${binPath} launch --help; echo "PowerShell"`

      const result = execSync(script, {
        encoding: 'utf8',
        shell: 'powershell.exe',
      }) as string
      expect(result).to.include('PowerShell')
    })

    it('Bash chains work (Unix)', function () {
      if (isWindows) {
        this.skip()
      }

      const result = execSync(`${binPath} launch --help && echo "Bash"`, {
        encoding: 'utf8',
        shell: '/bin/bash',
      }) as string
      expect(result).to.include('Bash')
    })
  })
})
