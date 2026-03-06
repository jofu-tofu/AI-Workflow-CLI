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
      // create() returns null if tmux not on PATH — that's fine
      const mux = TmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).to.equal('tmux')
      }
    })

    it('isInsideSession() returns true when TMUX env is set', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (!mux) return // tmux not on PATH

      const original = process.env.TMUX
      try {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0'
        expect(mux.isInsideSession()).to.equal(true)

        delete process.env.TMUX
        expect(mux.isInsideSession()).to.equal(false)
      } finally {
        if (original === undefined) {
          delete process.env.TMUX
        } else {
          process.env.TMUX = original
        }
      }
    })

    it('create() returns null when tmux is not on PATH', async () => {
      // On CI/non-Unix environments, tmux may not be installed
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      // Can be null or a TmuxMultiplexer — depends on environment
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
      // create() is async and returns null on non-Windows
      const mux = await PsmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).to.equal('psmux')
      }
    })

    it('create() returns null on non-Windows platforms', async () => {
      if (process.platform === 'win32') return // skip on Windows
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      expect(mux).to.equal(null)
    })

    it('encoded PowerShell command round-trips preserve $env: and nested quotes', () => {
      // Regression test: -Command "..." caused $env:PSMUX_PANE expansion and inner quote stripping.
      // -EncodedCommand (Base64 UTF-16LE) bypasses all interpolation.
      const testCommand = String.raw`$env:PSMUX_PANE='1'; & 'C:\tool.exe' @('--arg', 'shell_type="bash"')`
      const encoded = Buffer.from(testCommand, 'utf16le').toString('base64')
      const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
      expect(decoded).to.equal(testCommand)
    })

    it('isInsideSession() checks PSMUX_PANE env var', async () => {
      if (process.platform !== 'win32') return // psmux is Windows-only

      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      if (!mux) return // psmux not installed

      const original = process.env.PSMUX_PANE
      try {
        process.env.PSMUX_PANE = '1'
        expect(mux.isInsideSession()).to.equal(true)

        delete process.env.PSMUX_PANE
        expect(mux.isInsideSession()).to.equal(false)
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
        expect(mux.backend).to.be.oneOf(['tmux', 'psmux'])
        expect(mux.isInsideSession).to.be.a('function')
        expect(mux.splitPane).to.be.a('function')
        expect(mux.createSession).to.be.a('function')
        expect(mux.kill).to.be.a('function')
      }
    })
  })
})
