import {describe, expect, it} from 'vitest'

import {
  CONTEXT_WARNING_15,
  CONTEXT_WARNING_30,
  selectWarningMessage,
} from '../../../src/templates/core/lib-ts/hooks/context-monitor-logic.js'

describe('context-monitor-logic', () => {
  it('returns null when context remaining is above all warning thresholds', () => {
    expect(selectWarningMessage(50, [])).toBeNull()
  })

  it('returns the 30% warning when crossing 30% and not already fired', () => {
    expect(selectWarningMessage(30, [])).toEqual({pct: 30, msg: CONTEXT_WARNING_30})
  })

  it('returns the 15% warning when crossing 15% and not already fired', () => {
    expect(selectWarningMessage(10, [])).toEqual({pct: 15, msg: CONTEXT_WARNING_15})
  })

  it('returns null when the matching warning threshold was already fired', () => {
    expect(selectWarningMessage(30, [30])).toBeNull()
    expect(selectWarningMessage(15, [15, 30])).toBeNull()
  })
})
