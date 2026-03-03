import {expect} from 'chai'

import {buildShellCommand} from '../../src/lib/tmux-session.js'
import {quoteForSh} from '../../src/lib/tmux-primitives.js'

describe('tmux-session', () => {
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
      expect(result).to.not.include('tmux set-option')
      expect(result).to.match(/^exec /)
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
