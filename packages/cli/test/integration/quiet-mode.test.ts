import {execSync} from 'node:child_process'
import {platform} from 'node:os'

import {expect} from 'chai'
import {beforeAll, describe, it} from 'vitest'

import {cliCommand} from '../helpers/cli-command.js'

describe('Quiet Mode Integration', () => {
  const binPath = cliCommand()
  const skipOnWindows = platform() === 'win32' ? it.skip : it

  // Cache the help outputs to avoid redundant subprocess calls
  let launchHelpOutput: string
  let quietLaunchHelpOutput: string

  beforeAll(() => {
    launchHelpOutput = execSync(`${binPath} launch --help`, {encoding: 'utf8'})
    quietLaunchHelpOutput = execSync(`${binPath} launch --help --quiet`, {encoding: 'utf8'})
  }, 30_000)

  describe('--quiet flag behavior', () => {
    it('recognizes --quiet and -q flags and appears in help text', () => {
      // Quiet mode works
      expect(quietLaunchHelpOutput).to.include('Launch')

      // Short form works too
      const shortResult = execSync(`${binPath} launch --help -q`, {encoding: 'utf8'})
      expect(shortResult).to.include('Launch')

      // Flag appears in help
      expect(launchHelpOutput).to.include('--quiet')
      expect(launchHelpOutput).to.include('-q')
      expect(launchHelpOutput).to.include('Suppress informational output')
    })

    it('exit codes unchanged in quiet mode', () => {
      try {
        execSync(`${binPath} unknown-command --quiet`, {encoding: 'utf8'})
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {status: number}
        expect(err.status).to.equal(2)
      }
    })
  })

  describe('quiet mode with piping', () => {
    skipOnWindows('quiet mode works when output is piped', () => {
      const result = execSync(`${cliCommand('launch --help --quiet')} | grep "Launch"`, {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
      expect(result).to.include('Launch')
    })
  })

  describe('quiet mode across commands', () => {
    it('works with global help', () => {
      const result = execSync(`${binPath} --help --quiet`, {encoding: 'utf8'})
      expect(result).to.include('AI Workflow CLI')
    })
  })
})
