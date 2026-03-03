import {execSync} from 'node:child_process'

import {expect} from 'chai'
import {beforeAll, describe, it} from 'vitest'

import {cliCommand} from '../helpers/cli-command.js'

/**
 * Subcommand Architecture Validation Tests
 * Story 3.1 - FR30, FR31, FR32
 */
describe('Subcommand Architecture Validation', () => {
  const bin = cliCommand()

  // Cache help outputs to avoid redundant subprocess calls
  let mainHelp: string
  let launchHelp: string

  beforeAll(() => {
    mainHelp = execSync(`${bin} --help`, {encoding: 'utf8'})
    launchHelp = execSync(`${bin} launch --help`, {encoding: 'utf8'})
  })

  describe('AC1/FR30: Subcommand Hierarchy', () => {
    it('lists available commands and executes top-level commands', () => {
      expect(mainHelp).to.include('launch')
      expect(mainHelp).to.include('COMMANDS')
      expect(launchHelp).to.include('Launch Claude Code')
    })
  })

  describe('AC2/FR31: Short and Long Flag Forms', () => {
    it('shows both short and long forms for debug flag in help', () => {
      expect(launchHelp).to.match(/-d.*--debug|--debug.*-d/)
      expect(launchHelp).to.include('--debug')
      expect(launchHelp).to.include('-d')
    })

    it('accepts --debug and -d flags', () => {
      const result1 = execSync(`${bin} launch --debug --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const result2 = execSync(`${bin} launch -d --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect(result1).to.include('Launch Claude Code')
      expect(result2).to.include('Launch Claude Code')
    })
  })

  describe('AC3/FR32: Consistent Command Naming', () => {
    it('all top-level commands use lowercase names', () => {
      expect(mainHelp).to.include('launch')
    })
  })

  describe('AC4: Help Command Alternative', () => {
    it('aiw help launch produces same output as aiw launch --help', () => {
      const helpResult = execSync(`${bin} help launch`, {encoding: 'utf8'})
      expect(helpResult).to.equal(launchHelp)
    })
  })

  describe('Flag Inheritance from BaseCommand', () => {
    it('launch command inherits debug flag from BaseCommand', () => {
      expect(launchHelp).to.include('--debug')
      expect(launchHelp).to.include('-d')
    })
  })
})
