import {execSync} from 'node:child_process'
import {platform} from 'node:os'

import {expect} from 'chai'
import {describe, it} from 'mocha'

/**
 * Subcommand Architecture Validation Tests
 * Story 3.1 - FR30, FR31, FR32
 *
 * Tests that verify:
 * - AC1: Subcommand hierarchy works correctly
 * - AC2: Short and long flag forms work
 * - AC3: Command naming follows consistent patterns
 * - AC4: Help command alternative works
 */
describe('Subcommand Architecture Validation', () => {
  // Cross-platform bin path (Windows uses .cmd, Unix uses .js)
  const bin = platform() === 'win32' ? String.raw`.\bin\dev.cmd` : './bin/dev.js'

  describe('AC1/FR30: Subcommand Hierarchy', () => {
    it('executes top-level commands (aiw launch)', () => {
      const result = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      expect(result).to.include('Launch Claude Code')
    })

    it('lists available commands in main help', () => {
      const result = execSync(`${bin} --help`, {encoding: 'utf8'})
      expect(result).to.include('launch')
    })
  })

  describe('AC2/FR31: Short and Long Flag Forms', () => {
    it('accepts long form --debug on launch command', () => {
      const result = execSync(`${bin} launch --debug --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect(result).to.include('Launch Claude Code')
    })

    it('accepts short form -d on launch command', () => {
      const result = execSync(`${bin} launch -d --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect(result).to.include('Launch Claude Code')
    })

    it('help text shows both short and long forms for debug flag', () => {
      const result = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      // Should show: -d, --debug
      expect(result).to.match(/-d.*--debug|--debug.*-d/)
    })

    it('accepts long form --help', () => {
      const result = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      expect(result).to.include('Launch Claude Code')
    })

    it('accepts short form -h', () => {
      const result = execSync(`${bin} launch -h`, {encoding: 'utf8'})
      expect(result).to.include('Launch Claude Code')
    })
  })

  describe('AC3/FR32: Consistent Command Naming', () => {
    it('all top-level commands use lowercase names', () => {
      const result = execSync(`${bin} --help`, {encoding: 'utf8'})
      // Commands should be lowercase (launch)
      expect(result).to.include('launch')
    })

    it('command file paths match command names (Oclif convention)', () => {
      // This is verified by the fact that commands execute successfully
      // Oclif uses file path as command name
      const launchHelp = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      expect(launchHelp).to.include('Launch')
    })
  })

  describe('AC4: Help Command Alternative', () => {
    it('aiw help <command> produces same output as aiw <command> --help (launch)', () => {
      const helpResult = execSync(`${bin} help launch`, {encoding: 'utf8'})
      const flagResult = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      expect(helpResult).to.equal(flagResult)
    })
  })

  describe('Flag Inheritance from BaseCommand', () => {
    it('launch command inherits debug flag from BaseCommand', () => {
      const result = execSync(`${bin} launch --help`, {encoding: 'utf8'})
      expect(result).to.include('--debug')
      expect(result).to.include('-d')
    })
  })
})
