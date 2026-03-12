import {describe, expect, it} from 'vitest'

import {resolveMultiplexerPriority} from '../../src/lib/multiplexer.js'

describe('resolveMultiplexerPriority', () => {
  it('returns tmux for linux', () => {
    expect(resolveMultiplexerPriority('linux')).toEqual(['tmux'])
  })

  it('returns tmux for darwin', () => {
    expect(resolveMultiplexerPriority('darwin')).toEqual(['tmux'])
  })

  it('returns psmux only for win32 without WezTerm env', () => {
    expect(resolveMultiplexerPriority('win32', {})).toEqual(['psmux'])
  })

  it('returns wezterm then psmux for win32 with WEZTERM_PANE', () => {
    expect(resolveMultiplexerPriority('win32', {WEZTERM_PANE: '42'})).toEqual(['wezterm', 'psmux'])
  })

  it('returns wezterm then psmux for win32 with TERM_PROGRAM=WezTerm', () => {
    expect(resolveMultiplexerPriority('win32', {TERM_PROGRAM: 'WezTerm'})).toEqual(['wezterm', 'psmux'])
  })

  it('returns psmux only for win32 with non-WezTerm TERM_PROGRAM', () => {
    expect(resolveMultiplexerPriority('win32', {TERM_PROGRAM: 'ConHost'})).toEqual(['psmux'])
  })

  it('ignores env on unix platforms', () => {
    expect(resolveMultiplexerPriority('linux', {WEZTERM_PANE: '42'})).toEqual(['tmux'])
  })
})
