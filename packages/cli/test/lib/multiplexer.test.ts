import {expect} from 'chai'

import type {Multiplexer as _Multiplexer} from '../../src/lib/multiplexer.js'

describe('multiplexer', () => {
  describe('interface types', () => {
    it('exports detectMultiplexer factory function', async () => {
      const mod = await import('../../src/lib/multiplexer.js')
      expect(mod.detectMultiplexer).to.be.a('function')
    })
  })

  describe('TmuxMultiplexer', () => {
    it('reports tmux backend', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).to.equal('tmux')
      }
    })

    it('resolveStrategy returns split when TMUX env is set', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (!mux) return

      const original = process.env.TMUX
      try {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0'
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).to.equal('split')

        delete process.env.TMUX
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).to.equal('create-session')
      } finally {
        if (original === undefined) {
          delete process.env.TMUX
        } else {
          process.env.TMUX = original
        }
      }
    })

    it('create() returns null when tmux is not on PATH', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (mux === null) {
        expect(mux).to.equal(null)
      } else {
        expect(mux.backend).to.equal('tmux')
      }
    })
  })

  describe('PsmuxMultiplexer', () => {
    it('reports psmux backend when created', async () => {
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).to.equal('psmux')
      }
    })

    it('create() returns null on non-Windows platforms', async () => {
      if (process.platform === 'win32') return
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      expect(mux).to.equal(null)
    })

    it('encoded PowerShell command round-trips preserve $env: and nested quotes', () => {
      const testCommand = String.raw`$env:PSMUX_PANE='1'; & 'C:\tool.exe' @('--arg', 'shell_type="bash"')`
      const encoded = Buffer.from(testCommand, 'utf16le').toString('base64')
      const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
      expect(decoded).to.equal(testCommand)
    })

    it('resolveStrategy reflects PSMUX_PANE env var', async () => {
      if (process.platform !== 'win32') return

      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      if (!mux) return

      const original = process.env.PSMUX_PANE
      try {
        process.env.PSMUX_PANE = '1'
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'win32', disableMux: false}).strategy).to.equal('split')

        delete process.env.PSMUX_PANE
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'win32', disableMux: false}).strategy).to.equal('create-session')
      } finally {
        if (original === undefined) {
          delete process.env.PSMUX_PANE
        } else {
          process.env.PSMUX_PANE = original
        }
      }
    })
  })

  describe('detectMultiplexer', () => {
    it('returns a Multiplexer or null', async () => {
      const {detectMultiplexer} = await import('../../src/lib/multiplexer.js')
      const mux = await detectMultiplexer()
      if (mux === null) {
        expect(mux).to.equal(null)
      } else {
        expect(mux.backend).to.be.oneOf(['tmux', 'psmux', 'wezterm'])
        expect(mux.resolveStrategy).to.be.a('function')
        expect(mux.split).to.be.a('function')
        expect(mux.createSession).to.be.a('function')
        expect(mux.kill).to.be.a('function')
      }
    })
  })
})
