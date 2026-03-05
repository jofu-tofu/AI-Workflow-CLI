import {execSync} from 'node:child_process'
import {readdirSync} from 'node:fs'
import {basename, join} from 'node:path'

import {expect} from 'chai'
import {describe, it} from 'vitest'

import {cliCommand, getCliRoot} from '../helpers/cli-command.js'

interface ExecSyncFailure {
  status: null | number
  stderr: Buffer | string
}

function escapeForRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

describe('CLI binary contract', () => {
  const bin = cliCommand()

  it('root --help lists all registered command modules', () => {
    const output = execSync(`${bin} --help`, {encoding: 'utf8'})
    const commandDir = join(getCliRoot(), 'src', 'commands')
    const commandIds = readdirSync(commandDir)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => basename(entry, '.ts'))

    for (const commandId of commandIds) {
      expect(output).to.match(new RegExp(`\\b${escapeForRegex(commandId)}\\b`), `Missing command in --help output: ${commandId}`)
    }
  })

  it('--version outputs a valid semver', () => {
    const output = execSync(`${bin} --version`, {encoding: 'utf8'}).trim()
    expect(output).to.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?\b/)
  })

  it('unknown command exits with code 2', () => {
    try {
      execSync(`${bin} this-command-should-not-exist`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect.fail('Expected unknown command to fail')
    } catch (error: unknown) {
      const execError = error as ExecSyncFailure
      expect(execError.status).to.equal(2)
    }
  })

  it('unknown root flag exits with code 2', () => {
    try {
      execSync(`${bin} --definitely-not-a-real-flag`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect.fail('Expected unknown flag to fail')
    } catch (error: unknown) {
      const execError = error as ExecSyncFailure
      expect(execError.status).to.equal(2)
      expect(String(execError.stderr)).to.include('Nonexistent flag')
    }
  })
})
