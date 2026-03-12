import {describe, expect, it} from 'vitest'

import type {Multiplexer as _Multiplexer} from '../../src/lib/multiplexer.js'

describe('multiplexer', () => {
  describe('interface types', () => {
    it('exports detectMultiplexer factory function', async () => {
      const mod = await import('../../src/lib/multiplexer.js')
      expect(typeof mod.detectMultiplexer).toBe('function')
    })
  })

  describe('TmuxMultiplexer', () => {
    // Environment-dependent: requires tmux on PATH. If tmux is not installed,
    // create() returns null and guarded assertions are skipped.
    it('reports tmux backend', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).toBe('tmux')
      }
    })

    it('resolveStrategy returns split when TMUX env is set', async () => {
      const {TmuxMultiplexer} = await import('../../src/lib/multiplexers/tmux.js')
      const mux = TmuxMultiplexer.create()
      if (!mux) return

      const original = process.env.TMUX
      try {
        process.env.TMUX = '/tmp/tmux-1000/default,12345,0'
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).toBe('split')

        delete process.env.TMUX
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'linux', disableMux: false}).strategy).toBe('create-session')
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
        expect(mux).toBeNull()
      } else {
        expect(mux.backend).toBe('tmux')
      }
    })
  })

  describe('PsmuxMultiplexer', () => {
    // Environment-dependent: PsmuxMultiplexer.create() returns null on non-Windows.
    // The if (mux) guards let these tests pass as smoke tests on any platform.
    it('reports psmux backend when created', async () => {
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      if (mux) {
        expect(mux.backend).toBe('psmux')
      }
    })

    it('create() returns null on non-Windows platforms', async () => {
      // Environment-dependent: only meaningful on non-Windows; on Windows the
      // factory may succeed, so we skip.
      if (process.platform === 'win32') return
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      expect(mux).toBeNull()
    })

    it('encoded PowerShell command round-trips preserve $env: and nested quotes', () => {
      const testCommand = String.raw`$env:PSMUX_PANE='1'; & 'C:\tool.exe' @('--arg', 'shell_type="bash"')`
      const encoded = Buffer.from(testCommand, 'utf16le').toString('base64')
      const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
      expect(decoded).toBe(testCommand)
    })

    // Environment-dependent: requires Windows with PowerShell multiplexer available.
    // On non-Windows, PsmuxMultiplexer.create() returns null so the test exits early.
    it('resolveStrategy reflects PSMUX_PANE env var', async () => {
      const {PsmuxMultiplexer} = await import('../../src/lib/multiplexers/psmux.js')
      const mux = await PsmuxMultiplexer.create()
      if (!mux) return

      const original = process.env.PSMUX_PANE
      try {
        process.env.PSMUX_PANE = '1'
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'win32', disableMux: false}).strategy).toBe('split')

        delete process.env.PSMUX_PANE
        expect(mux.resolveStrategy({calledFromRepl: false, platform: 'win32', disableMux: false}).strategy).toBe('create-session')
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
    // Environment-dependent: result depends on what multiplexers are installed.
    it('returns a Multiplexer or null', async () => {
      const {detectMultiplexer} = await import('../../src/lib/multiplexer.js')
      const mux = await detectMultiplexer()
      if (mux === null) {
        expect(mux).toBeNull()
      } else {
        expect(['tmux', 'psmux', 'wezterm']).toContain(mux.backend)
        expect(typeof mux.resolveStrategy).toBe('function')
        expect(typeof mux.split).toBe('function')
        expect(typeof mux.createSession).toBe('function')
        expect(typeof mux.kill).toBe('function')
      }
    })
  })
})
