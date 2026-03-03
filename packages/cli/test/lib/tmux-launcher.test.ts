import {expect} from 'chai'

import {withWindowsTmuxBootstrap} from '../../src/lib/launchers/tmux-launcher.js'

describe('tmux-launcher', () => {
  describe('withWindowsTmuxBootstrap', () => {
    it('prepends tmux runtime bootstrap commands on Windows', () => {
      const result = withWindowsTmuxBootstrap('exec codex --yolo', 'win32')

      expect(result).to.include('tmux set-option -g mouse on')
      expect(result).to.include('tmux set-option -g history-limit 50000')
      expect(result).to.include('tmux set-option -g focus-events off')
      expect(result).to.include('tmux set -a terminal-overrides')
      expect(result).to.include('*:kmous@')
      expect(result.endsWith('exec codex --yolo')).to.equal(true)
    })

    it('is a no-op on non-Windows', () => {
      const command = 'exec claude --dangerously-skip-permissions'
      const result = withWindowsTmuxBootstrap(command, 'linux')
      expect(result).to.equal(command)
    })
  })
})
