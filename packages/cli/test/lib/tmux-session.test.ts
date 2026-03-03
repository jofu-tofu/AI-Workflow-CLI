import {expect} from 'chai'

import {quoteForSh} from '../../src/lib/tmux-primitives.js'
import {buildShellCommand, buildTmuxRuntimeBootstrapCommands, resolveTmuxColorMode} from '../../src/lib/tmux-session.js'

describe('tmux-session', () => {
  describe('resolveTmuxColorMode', () => {
    it('uses 256-color mode on Windows', () => {
      expect(resolveTmuxColorMode('win32')).to.equal('c256')
    })

    it('uses truecolor mode on non-Windows', () => {
      expect(resolveTmuxColorMode('linux')).to.equal('truecolor')
      expect(resolveTmuxColorMode('darwin')).to.equal('truecolor')
    })
  })

  describe('buildShellCommand', () => {
    it('produces exec command with single-quoted path and args', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/c/Users/test/.local/bin/claude.exe',
        toolArgs: ['--dangerously-skip-permissions'],
      })
      expect(result).to.include("'/c/Users/test/.local/bin/claude.exe'")
      expect(result).to.include("'--dangerously-skip-permissions'")
      expect(result).to.match(/^tmux set-option .+; exec /)
    })

    it('preserves quoting for paths with spaces', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/c/Program Files/tool/claude.exe',
        toolArgs: ['--flag'],
      })
      // Space must be inside quotes, not word-split
      expect(result).to.include("'/c/Program Files/tool/claude.exe'")
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

    it('applies COLORTERM policy for current platform color mode', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/usr/bin/claude',
        toolArgs: [],
      })

      if (resolveTmuxColorMode() === 'c256') {
        expect(result).to.include('unset COLORTERM')
        expect(result).to.not.include('export COLORTERM=truecolor')
      } else {
        expect(result).to.include('export COLORTERM=truecolor')
      }
    })

    it('adds Windows cursor-stability terminal overrides in tmux bootstrap', () => {
      const result = buildShellCommand({
        sessionName: 'test',
        toolPath: '/c/Users/test/.local/bin/claude.exe',
        toolArgs: ['--dangerously-skip-permissions'],
        platform: 'win32',
      })

      expect(result).to.include('tmux set -a terminal-overrides')
      expect(result).to.include('*:kmous@')
      expect(result).to.include('*:Ss@')
      expect(result).to.include('*:Se@')
      expect(result).to.include('*:Cs@')
      expect(result).to.include('*:Cr@')
      expect(result).to.include('tmux set-option -g focus-events off')
      expect(result).to.not.include('tmux set -ga terminal-overrides')
    })
  })

  describe('buildTmuxRuntimeBootstrapCommands', () => {
    it('includes mouse/history/terminal overrides on Windows', () => {
      const commands = buildTmuxRuntimeBootstrapCommands('win32')
      const result = commands.join('; ')

      expect(result).to.include('tmux set-option -g mouse on')
      expect(result).to.include('tmux set-option -g history-limit 50000')
      expect(result).to.include('tmux set-option -g focus-events off')
      expect(result).to.include('tmux set -a terminal-overrides')
      expect(result).to.include('*:kmous@')
    })

    it('omits mouse command when enableMouse is false', () => {
      const commands = buildTmuxRuntimeBootstrapCommands('win32', false)
      const result = commands.join('; ')

      expect(result).to.not.include('tmux set-option -g mouse on')
      expect(result).to.include('tmux set-option -g history-limit 50000')
    })
  })

  // Verify quoteForSh round-trip: the quoting contract that tmux-session.ts
  // depends on for safe bash→tmux→sh transport.
  describe('quoteForSh round-trip safety', () => {
    it('preserves single quotes through double quoting (nested tmux scenario)', () => {
      // Simulates: buildShellCommand produces inner-quoted string,
      // then launchInTmuxSession wraps it with quoteForSh for the bash -lc layer.
      const innerCmd = "exec '/c/Users/test/claude.exe' '--dangerously-skip-permissions'"
      const outerQuoted = quoteForSh(innerCmd)
      // Outer layer must produce valid bash that, when parsed, yields the original string
      expect(outerQuoted).to.be.a('string')
      expect(outerQuoted.startsWith("'")).to.be.true
      expect(outerQuoted.endsWith("'")).to.be.true
      // Inner single quotes must be escaped (not bare — bare would terminate outer quoting)
      expect(outerQuoted).to.not.equal(`'${innerCmd}'`) // would break if inner ' not escaped
      // The standard escape sequence for single quotes inside single quotes
      expect(outerQuoted).to.include("'\"'\"'")
    })

    it('handles paths with spaces safely', () => {
      const pathWithSpaces = "exec '/c/Program Files/tool/claude.exe'"
      const quoted = quoteForSh(pathWithSpaces)
      expect(quoted).to.include('Program Files')
      // Must be a single quoted unit (no unquoted spaces)
      expect(quoted.startsWith("'")).to.be.true
    })
  })
})
