/**
 * Command Chaining Integration Tests
 *
 * Tests AIW CLI integration with command chains (&&) and pipes (|).
 * Validates stdout/stderr separation, exit code propagation, and cross-platform behavior.
 */

import {exec, execSync} from 'node:child_process'
import {platform} from 'node:os'
import {promisify} from 'node:util'

import {expect} from 'chai'
import {beforeAll, describe, it} from 'vitest'

import {cliCommand} from '../helpers/cli-command.js'

const execAsync = promisify(exec)

const isWindows = platform() === 'win32'
const binPath = cliCommand()
const grepCmd = isWindows ? 'findstr' : 'grep'
const nullDevice = isWindows ? 'nul' : '/dev/null'

describe('Command Chaining Integration', () => {
  // Cache help output to avoid redundant subprocess calls
  let helpOutput: string
  let helpStderr: string

  beforeAll(async () => {
    const result = await execAsync(`${binPath} launch --help`, {encoding: 'utf8'})
    helpOutput = result.stdout
    helpStderr = result.stderr
  }, 30_000)

  describe('stdout/stderr separation', () => {
    it('piped output has no status messages and stderr is clean', () => {
      expect(helpOutput).to.include('Launch')
      expect(helpOutput).to.not.include('Launching...')
      expect(helpOutput).to.not.include('Starting...')
      expect(helpStderr).to.equal('')
    })

    it('errors output to stderr', () => {
      try {
        execSync(`${binPath} unknown-command`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have failed')
      } catch (error: unknown) {
        const execError = error as {stderr: string}
        expect(execError.stderr).to.include('Error')
      }
    })
  })

  describe('exit code propagation in && chains', () => {
    it('success allows chain to continue', () => {
      const script = isWindows
        ? `${binPath} launch --help && echo Success`
        : `${binPath} launch --help && echo "Success"`

      const result = execSync(script, {encoding: 'utf8'}) as string
      expect(result).to.include('Success')
    })

    it('failure stops chain and multi-command chains work correctly', () => {
      // Single failure stops chain
      const failScript = isWindows
        ? `${binPath} unknown-command 2>${nullDevice} && echo Fail`
        : `${binPath} unknown-command 2>${nullDevice} && echo "Fail"`

      try {
        execSync(failScript, {encoding: 'utf8'})
        expect.fail('Should have failed')
      } catch (error: unknown) {
        const execError = error as {stdout?: string}
        expect(execError.stdout || '').to.not.include('Fail')
      }

      // Multi-command chain succeeds
      const successScript = isWindows
        ? `${binPath} launch --help && ${binPath} init --help && echo Done`
        : `${binPath} launch --help && ${binPath} init --help && echo "Done"`

      const result = execSync(successScript, {encoding: 'utf8'}) as string
      expect(result).to.include('Done')
    })
  })

  describe('piping behavior', () => {
    it('output works with grep and has no ANSI codes', () => {
      const result = execSync(`${binPath} launch --help | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')

      // Check no ANSI codes in cached output
      // eslint-disable-next-line no-control-regex, unicorn/escape-case, unicorn/no-hex-escape
      expect(helpOutput).to.not.match(/\x1b\[/)
    })

    it('quiet mode enhances pipeline cleanliness', () => {
      const result = execSync(`${binPath} launch --help --quiet | ${grepCmd} "Launch"`, {
        encoding: 'utf8',
      }) as string
      expect(result).to.include('Launch')
    })
  })

  describe('cross-platform chaining', () => {
    it('chains work on current platform', () => {
      const script = isWindows ? `${binPath} launch --help && echo OK` : `${binPath} launch --help && echo "OK"`
      const result = execSync(script, {encoding: 'utf8'}) as string
      expect(result).to.include('OK')
    })

    it('PowerShell chains work (Windows only)', function (this: any) {
      if (!isWindows) {
        this.skip()
      }

      const script = `& ${binPath} launch --help; echo "PowerShell"`
      const result = execSync(script, {
        encoding: 'utf8',
        shell: 'powershell.exe',
      }) as string
      expect(result).to.include('PowerShell')
    })

    it('Bash chains work (Unix only)', () => {
      if (isWindows) return

      const result = execSync(`${binPath} launch --help && echo "Bash"`, {
        encoding: 'utf8',
        shell: '/bin/bash',
      }) as string
      expect(result).to.include('Bash')
    })
  })
})
