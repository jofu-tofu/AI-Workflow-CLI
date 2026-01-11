import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('CLI Integration Tests', () => {
  describe('pai --help', () => {
    it('displays help text with USAGE section', async () => {
      const {stdout} = await runCommand(['--help'])
      expect(stdout).to.contain('USAGE')
    })

    it('displays available commands', async () => {
      const {stdout} = await runCommand(['--help'])
      expect(stdout).to.contain('COMMANDS')
    })
  })

  describe('pai --version', () => {
    it('displays version number in semver format', async () => {
      const {stdout} = await runCommand(['--version'])
      expect(stdout).to.match(/\d+\.\d+\.\d+/)
    })
  })

  describe('pai hello', () => {
    it('executes hello command with required args successfully', async () => {
      const {stdout} = await runCommand(['hello', 'friend', '--from', 'test'])
      expect(stdout).to.contain('hello friend from test')
    })

    it('returns success exit code (0) on valid execution', async () => {
      const {result} = await runCommand(['hello', 'friend', '--from', 'test'])
      // runCommand returns undefined result on success (no error thrown)
      expect(result).to.be.undefined
    })
  })

  describe('pai hello world', () => {
    it('executes hello world subcommand successfully', async () => {
      const {stdout} = await runCommand(['hello', 'world'])
      expect(stdout).to.contain('hello world')
    })

    it('returns success exit code on valid execution', async () => {
      const {result} = await runCommand(['hello', 'world'])
      expect(result).to.be.undefined
    })
  })

  describe('exit codes', () => {
    it('returns error for missing required argument', async () => {
      const {error} = await runCommand(['hello'])
      expect(error).to.exist
      expect(error?.message).to.contain('Missing 1 required arg')
    })

    it('returns error for unknown command', async () => {
      const {error} = await runCommand(['nonexistent-command'])
      expect(error).to.exist
    })
  })
})
