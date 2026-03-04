import {expect} from 'chai'

import {quoteForSh} from '../../src/lib/tmux-primitives.js'
import {buildShellCommand, buildTmuxRuntimeBootstrapCommands, resolveTmuxColorMode} from '../../src/lib/tmux-session.js'

describe('tmux-session', () => {
  describe('resolveTmuxColorMode', () => {
    it('uses truecolor mode on all platforms (psmux on Windows supports native truecolor)', () => {
      expect(resolveTmuxColorMode('win32')).to.equal('truecolor')
      expect(resolveTmuxColorMode('linux')).to.equal('truecolor')
      expect(resolveTmuxColorMode('darwin')).to.equal('truecolor')
    })
  })

  describe('buildShellCommand', () => {
    it('produces exec command with single-quoted path and args', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/local/bin/claude',
        toolArgs: ['--dangerously-skip-permissions'],
      })
      expect(result).to.include("'/usr/local/bin/claude'")
      expect(result).to.include("'--dangerously-skip-permissions'")
      expect(result).to.match(/^tmux set-option .+; exec /)
    })

    it('preserves quoting for paths with spaces', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/local/my tools/claude',
        toolArgs: ['--flag'],
      })
      expect(result).to.include("'/usr/local/my tools/claude'")
    })

    it('omits mouse command when enableMouse is false', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/bin/claude',
        toolArgs: [],
        enableMouse: false,
      })
      expect(result).to.not.include('tmux set-option -g mouse')
      expect(result).to.include('exec ')
    })

    it('applies truecolor COLORTERM policy', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/bin/claude',
        toolArgs: [],
      })
      expect(result).to.include('export COLORTERM=truecolor')
    })

    it('includes terminal-overrides for truecolor on Unix', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/bin/claude',
        toolArgs: ['--dangerously-skip-permissions'],
        platform: 'linux',
      })
      expect(result).to.include('terminal-overrides')
      expect(result).to.include('xterm*:Tc')
    })
  })

  describe('buildTmuxRuntimeBootstrapCommands', () => {
    it('includes mouse and history on Unix', () => {
      const commands = buildTmuxRuntimeBootstrapCommands('linux')
      const result = commands.join('; ')

      expect(result).to.include('mouse on')
      expect(result).to.include('history-limit')
      expect(result).to.include('terminal-overrides')
    })

    it('does not include terminal-overrides on Windows (psmux handles natively)', () => {
      const commands = buildTmuxRuntimeBootstrapCommands('win32')
      const result = commands.join('; ')

      expect(result).to.include('mouse on')
      expect(result).to.include('history-limit')
      expect(result).to.not.include('terminal-overrides')
    })

    it('omits mouse command when enableMouse is false', () => {
      const commands = buildTmuxRuntimeBootstrapCommands('linux', false)
      const result = commands.join('; ')

      expect(result).to.not.include('tmux set-option -g mouse on')
      expect(result).to.include('tmux set-option -g history-limit 50000')
    })
  })

  // Verify quoteForSh round-trip: the quoting contract that tmux-session.ts
  // depends on for safe bash→tmux→sh transport.
  describe('quoteForSh round-trip safety', () => {
    it('preserves single quotes through double quoting (nested tmux scenario)', () => {
      const innerCmd = "exec '/usr/local/bin/claude' '--dangerously-skip-permissions'"
      const outerQuoted = quoteForSh(innerCmd)
      expect(outerQuoted).to.be.a('string')
      expect(outerQuoted.startsWith("'")).to.be.true
      expect(outerQuoted.endsWith("'")).to.be.true
      expect(outerQuoted).to.not.equal(`'${innerCmd}'`)
      expect(outerQuoted).to.include("'\"'\"'")
    })

    it('handles paths with spaces safely', () => {
      const pathWithSpaces = "exec '/usr/local/my tools/claude'"
      const quoted = quoteForSh(pathWithSpaces)
      expect(quoted).to.include('my tools')
      expect(quoted.startsWith("'")).to.be.true
    })
  })
})
