import {expect} from 'chai'

import {
  buildTmuxLaunchEnv,
  getWindowsTmuxPreflightFailureReason,
  withWindowsTmuxWinpty,
} from '../../src/lib/pane-driver.js'

describe('pane-driver', () => {
  describe('buildTmuxLaunchEnv', () => {
    it('injects truecolor COLORTERM on non-Windows', () => {
      const result = buildTmuxLaunchEnv({FOO: 'bar'}, 'linux')
      expect(result).to.deep.equal({COLORTERM: 'truecolor', FOO: 'bar'})
    })

    it('removes COLORTERM on Windows to avoid winpty truecolor corruption', () => {
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
        reason: 'winpty not available in Git Bash',
      }))
      expect(result).to.equal('winpty not available in Git Bash')
    })
  })

  describe('withWindowsTmuxWinpty', () => {
    it('wraps tmux commands with winpty on Windows', () => {
      const result = withWindowsTmuxWinpty('codex --yolo', 'tmux', 'win32')
      expect(result).to.match(/^winpty bash -lc /)
      expect(result).to.include("'codex --yolo'")
    })

    it('does not wrap non-tmux backends', () => {
      const result = withWindowsTmuxWinpty('codex --yolo', 'exec', 'win32')
      expect(result).to.equal('codex --yolo')
    })
  })
})
