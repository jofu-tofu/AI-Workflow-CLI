/**
 * @file Unit tests for launch command.
 *
 * Focuses on stable command contract checks (flags, examples, helper surface).
 */

import {expect} from 'chai'

import LaunchCommand from '../../src/commands/launch.js'

type PrototypeMap = Record<string, unknown>

function getPrototypeMethods(): Set<string> {
  const proto = LaunchCommand.prototype as unknown as PrototypeMap
  return new Set(
    Object.getOwnPropertyNames(proto).filter((name) => typeof proto[name] === 'function'),
  )
}

describe('launch command', () => {
  describe('metadata and help', () => {
    it('has a description', () => {
      expect(LaunchCommand.description).to.be.a('string')
      expect(LaunchCommand.description.length).to.be.greaterThan(0)
    })

    it('mentions supported tools and behavior', () => {
      expect(LaunchCommand.description).to.include('Claude Code')
      expect(LaunchCommand.description).to.include('Codex')
      expect(LaunchCommand.description).to.match(/tmux|inline/i)
    })

    it('has examples including debug mode', () => {
      expect(LaunchCommand.examples).to.be.an('array')
      expect(LaunchCommand.examples.length).to.be.greaterThan(0)
      expect(LaunchCommand.examples.some((ex: string) => ex.includes('--debug'))).to.equal(true)
    })
  })

  describe('command structure', () => {
    it('has run method and inherits base flags', () => {
      expect(LaunchCommand.prototype.run).to.be.a('function')
      expect(LaunchCommand).to.have.property('baseFlags')
      expect(LaunchCommand.baseFlags).to.have.property('debug')
    })

    it('exposes launch helpers used by run flow', () => {
      const methods = getPrototypeMethods()
      expect(methods.has('waitForSentinel')).to.equal(true)
      expect(methods.has('handleJsonOutput')).to.equal(true)
    })

    it('exposes helper utilities for session/prompt handling', () => {
      const methods = getPrototypeMethods()
      expect(methods.has('buildUniqueSessionName')).to.equal(true)
      expect(methods.has('sanitizeSessionName')).to.equal(true)
      expect(methods.has('shellQuote')).to.equal(true)
    })
  })

  describe('codex flag', () => {
    it('defines --codex with short -c and default false', () => {
      const codexFlag = LaunchCommand.flags.codex as {char?: string; default?: boolean}
      expect(LaunchCommand.flags).to.have.property('codex')
      expect(codexFlag).to.have.property('char', 'c')
      expect(codexFlag).to.have.property('default', false)
    })

    it('documents codex usage in description/examples', () => {
      expect(LaunchCommand.description).to.include('--codex')
      expect(LaunchCommand.examples.some((ex: string) => ex.includes('--codex'))).to.equal(true)
    })
  })

  describe('new-terminal flag', () => {
    it('defines --new with short -n and default false', () => {
      const newFlag = LaunchCommand.flags.new as {char?: string; default?: boolean}
      expect(LaunchCommand.flags).to.have.property('new')
      expect(newFlag).to.have.property('char', 'n')
      expect(newFlag).to.have.property('default', false)
    })

    it('documents --new usage in description/examples', () => {
      expect(LaunchCommand.description).to.include('--new')
      expect(LaunchCommand.examples.some((ex: string) => ex.includes('--new'))).to.equal(true)
    })

    it('defines hidden --spawned-window for internal new-window handoff', () => {
      const spawnedFlag = LaunchCommand.flags['spawned-window'] as {default?: boolean; hidden?: boolean}
      expect(LaunchCommand.flags).to.have.property('spawned-window')
      expect(spawnedFlag).to.have.property('hidden', true)
      expect(spawnedFlag).to.have.property('default', false)
    })
  })

  describe('tmux flags', () => {
    it('defines --no-tmux with short -t', () => {
      const flag = LaunchCommand.flags['no-tmux'] as {char?: string}
      expect(LaunchCommand.flags).to.have.property('no-tmux')
      expect(flag).to.have.property('char', 't')
    })

    it('defines --tmux-session with short -s', () => {
      const flag = LaunchCommand.flags['tmux-session'] as {char?: string}
      expect(LaunchCommand.flags).to.have.property('tmux-session')
      expect(flag).to.have.property('char', 's')
    })

    it('documents tmux-related flags', () => {
      expect(LaunchCommand.description).to.include('--no-tmux')
      expect(LaunchCommand.description).to.include('--tmux-session')
    })
  })

  describe('prompt flags', () => {
    it('defines --prompt with short -p', () => {
      const promptFlag = LaunchCommand.flags.prompt as {char?: string}
      expect(LaunchCommand.flags).to.have.property('prompt')
      expect(promptFlag).to.have.property('char', 'p')
    })

    it('defines hidden --prompt-file and visible --prompt-path', () => {
      const promptFileFlag = LaunchCommand.flags['prompt-file'] as {hidden?: boolean}
      expect(LaunchCommand.flags).to.have.property('prompt-file')
      expect(promptFileFlag).to.have.property('hidden', true)
      expect(LaunchCommand.flags).to.have.property('prompt-path')
    })

    it('documents prompt usage in description/examples', () => {
      expect(LaunchCommand.description).to.include('--prompt')
      expect(LaunchCommand.examples.some((ex: string) => ex.includes('--prompt'))).to.equal(true)
    })
  })

  describe('other launch flags', () => {
    it('defines --wait and --json with defaults', () => {
      const waitFlag = LaunchCommand.flags.wait as {default?: boolean}
      const jsonFlag = LaunchCommand.flags.json as {default?: boolean}
      expect(waitFlag).to.have.property('default', false)
      expect(jsonFlag).to.have.property('default', false)
    })

    it('defines --split enum options', () => {
      const splitFlag = LaunchCommand.flags.split as {options?: readonly string[]}
      expect(splitFlag.options).to.deep.equal(['auto', 'h', 'v'])
    })

    it('--split has no default so psmux skips splitting unless explicit', () => {
      const splitFlag = LaunchCommand.flags.split as {default?: string}
      expect(splitFlag.default).to.equal(undefined)
    })
  })
})
