import {expect} from 'chai'

import {
  buildTmuxLaunchEnv,
  getWindowsTmuxPreflightFailureReason,
} from '../../src/lib/pane-driver.js'

describe('pane-driver', () => {
  describe('buildTmuxLaunchEnv', () => {
    it('injects truecolor COLORTERM on non-Windows', () => {
      const result = buildTmuxLaunchEnv({FOO: 'bar'}, 'linux')
      expect(result).to.deep.equal({COLORTERM: 'truecolor', FOO: 'bar'})
    })

    it('removes COLORTERM on Windows for 256-color tmux policy', () => {
      const result = buildTmuxLaunchEnv({COLORTERM: 'truecolor', FOO: 'bar'}, 'win32')
      expect(result).to.deep.equal({FOO: 'bar'})
      expect(result).to.not.have.property('COLORTERM')
    })
  })

  describe('getWindowsTmuxPreflightFailureReason', () => {
    it('returns null outside Windows tmux backend', () => {
      const result = getWindowsTmuxPreflightFailureReason('exec', 'win32', () => ({
        available: false,
        reason: 'irrelevant',
      }))
      expect(result).to.equal(null)
    })

    it('returns reason when Windows tmux preflight fails', () => {
      const result = getWindowsTmuxPreflightFailureReason('tmux', 'win32', () => ({
        available: false,
        reason: 'tmux not available in Git Bash',
      }))
      expect(result).to.equal('tmux not available in Git Bash')
    })
  })
})
