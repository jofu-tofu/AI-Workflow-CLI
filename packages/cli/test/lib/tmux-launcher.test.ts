import {expect} from 'chai'

import {withWindowsTmuxBootstrap} from '../../src/lib/launchers/tmux-launcher.js'

describe('tmux-launcher', () => {
  describe('withWindowsTmuxBootstrap', () => {
    it('prepends tmux runtime bootstrap commands on Windows', () => {
      const result = withWindowsTmuxBootstrap('exec codex --yolo', 'win32')

      expect(result).to.include('mouse on')
      expect(result).to.include('history-limit')
      expect(result).to.include('terminal-overrides')
      expect(result.endsWith('exec codex --yolo')).to.equal(true)
    })

    it('is a no-op on non-Windows', () => {
      const command = 'exec claude --dangerously-skip-permissions'
      const result = withWindowsTmuxBootstrap(command, 'linux')
      expect(result).to.equal(command)
    })
  })
})
