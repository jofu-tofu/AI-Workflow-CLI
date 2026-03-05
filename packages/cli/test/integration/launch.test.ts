import {execFileSync} from 'node:child_process'

import {expect} from 'chai'
import {describe, it} from 'vitest'

import {getCliBinJsPath} from '../helpers/cli-command.js'

interface ExecFailure {
  status: null | number
  stdout: Buffer | string
  stderr: Buffer | string
}

const cliNodeArgs = ['--no-deprecation', '--loader', 'ts-node/esm', '--disable-warning=ExperimentalWarning']

function runCli(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync(process.execPath, [...cliNodeArgs, getCliBinJsPath(), ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  })
}

function runCliExpectFailure(args: string[], env: NodeJS.ProcessEnv = process.env): ExecFailure {
  try {
    runCli(args, env)
    expect.fail(`Expected command to fail: ${args.join(' ')}`)
  } catch (error: unknown) {
    return error as ExecFailure
  }
}

function runCliCapture(args: string[], env: NodeJS.ProcessEnv = process.env): {status: null | number; stderr: string; stdout: string} {
  try {
    const stdout = runCli(args, env)
    return {status: 0, stdout, stderr: ''}
  } catch (error: unknown) {
    const execError = error as ExecFailure
    return {
      status: execError.status,
      stdout: String(execError.stdout ?? ''),
      stderr: String(execError.stderr ?? ''),
    }
  }
}


describe('launch command integration', () => {
  it('prints expected sections in --help output', () => {
    const stdout = runCli(['launch', '--help'])
    expect(stdout).to.include('USAGE')
    expect(stdout).to.include('FLAGS')
    expect(stdout).to.include('DESCRIPTION')
  })

  it('accepts --json flag without crashing', () => {
    // --json only produces structured output with a multiplexer backend.
    // In inline mode (--no-tmux) it just runs normally. Verify it doesn't crash.
    const result = runCliCapture(['launch', '--json', '--no-tmux'])
    // Should exit (possibly non-zero since no stdin/prompt), but not with flag-parse error
    expect(String(result.stderr)).to.not.include('Nonexistent flag')
  })

  it('exits non-zero for invalid flags', () => {
    const error = runCliExpectFailure(['launch', '--invalid-flag'])
    expect(error.status).to.be.a('number')
    expect(error.status).to.be.greaterThan(0)
    expect(String(error.stderr)).to.include('Nonexistent flag')
  })

  it('accepts all documented launch flags', () => {
    const longFlagOutput = runCli([
      'launch',
      '--debug',
      '--quiet',
      '--codex',
      '--new',
      '--no-tmux',
      '--prompt', 'bootstrap prompt',
      '--tmux-session', 'aiw-main',
      '--split', 'h',
      '--wait',
      '--json',
      '--env', '{"FOO":"bar"}',
      '--prompt-path', 'prompt.txt',
      '--help',
    ])

    const shortFlagOutput = runCli([
      'launch',
      '-d',
      '-q',
      '-c',
      '-n',
      '-t',
      '-p', 'bootstrap prompt',
      '-s', 'aiw-main',
      '--help',
    ])

    expect(longFlagOutput).to.include('USAGE')
    expect(shortFlagOutput).to.include('USAGE')
  })
})
