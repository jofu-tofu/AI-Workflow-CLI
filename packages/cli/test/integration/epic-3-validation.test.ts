import {execSync} from 'node:child_process'
import {platform} from 'node:os'

import {expect} from 'chai'
import {describe, it} from 'mocha'

describe('Epic 3: Scripting & Shell Integration - Integration Validation', () => {
  const bin = platform() === 'win32' ? String.raw`.\bin\dev.cmd` : './bin/dev.js'

  describe('CLI help output and piping behavior', () => {
    it('produces clean, pipeable help output without ANSI codes', () => {
      const output = execSync(`${bin} --help`, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']})

      // Help content is present and meaningful
      expect(output).to.include('COMMANDS')
      expect(output).to.include('USAGE')
      expect(output).to.include('launch')
      expect(output).to.include('init')

      // No ANSI escape codes when piped
      // eslint-disable-next-line no-control-regex
      expect(output).to.not.match(/\u001B\[[0-9;]*m/)

      // No carriage returns (spinner artifacts)
      expect(output).to.not.include('\r')

      // Output is non-empty string
      expect(output.length).to.be.greaterThan(0)
    })

    it('quiet mode works with help output', () => {
      const output = execSync(`${bin} --quiet --help`, {encoding: 'utf8', stdio: 'pipe'})
      expect(output).to.be.a('string')
      expect(output).to.include('Launch Claude Code')
    })
  })

  describe('version output', () => {
    it('displays version successfully', () => {
      const output = execSync(`${bin} --version`, {encoding: 'utf8', stdio: 'pipe'})
      expect(output).to.include('aiwcli')
    })
  })

  describe('exit codes', () => {
    it('returns exit code 2 for invalid flags and unknown commands', () => {
      // Invalid flag
      try {
        execSync(`${bin} --invalid-flag`, {stdio: 'pipe'})
        expect.fail('Invalid flag should fail')
      } catch (error: unknown) {
        const e = error as {status: number}
        expect(e.status).to.equal(2)
      }

      // Invalid command
      try {
        execSync(`${bin} invalid-command`, {stdio: 'pipe'})
        expect.fail('Invalid command should fail')
      } catch (error: unknown) {
        const e = error as {status: number}
        expect(e.status).to.equal(2)
      }
    })

    it('errors output to stderr when piped', () => {
      try {
        execSync(`${bin} --invalid-flag`, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']})
        expect.fail('Should throw error')
      } catch (error: unknown) {
        const e = error as {stderr: string; stdout: string}
        expect(e.stderr || e.stdout).to.include('Error')
      }
    })
  })

  describe('short and long flag forms', () => {
    it('accepts both --debug/-d and --quiet/-q flags', function () {
      this.timeout(20_000)
      // Test --debug and -d
      const output1 = execSync(`${bin} --version --debug`, {encoding: 'utf8', stdio: 'pipe'})
      const output2 = execSync(`${bin} --version -d`, {encoding: 'utf8', stdio: 'pipe'})
      expect(output1).to.include('aiwcli')
      expect(output2).to.include('aiwcli')

      // Test --quiet and -q (just verify no crash)
      execSync(`${bin} --version --quiet`, {stdio: 'pipe'})
      execSync(`${bin} --version -q`, {stdio: 'pipe'})
    })
  })

  describe('shell completion scripts', () => {
    it('generates Bash completion script', () => {
      const output = execSync(`${bin} autocomplete:script bash`, {encoding: 'utf8', stdio: 'pipe'})
      expect(output).to.be.a('string')
      expect(output.length).to.be.greaterThan(0)
    })

    it('generates Zsh completion script', () => {
      const output = execSync(`${bin} autocomplete:script zsh`, {encoding: 'utf8', stdio: 'pipe'})
      expect(output).to.be.a('string')
      expect(output.length).to.be.greaterThan(0)
    })
  })
})
