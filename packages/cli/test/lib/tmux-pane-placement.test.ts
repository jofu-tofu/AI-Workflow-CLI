import {describe, expect, it} from 'vitest'

import {findBestSplit, type TmuxPaneInfo} from '../../src/lib/tmux-pane-placement.js'

describe('tmux-pane-placement', () => {
  it('returns null when there are no panes', () => {
    expect(findBestSplit([])).toBeNull()
  })

  it('chooses horizontal split for a wide pane', () => {
    const panes: TmuxPaneInfo[] = [{paneId: '%1', width: 220, height: 80, active: true}]
    expect(findBestSplit(panes)).toEqual({targetPane: '%1', splitFlag: '-h'})
  })

  it('chooses vertical split for a tall pane', () => {
    const panes: TmuxPaneInfo[] = [{paneId: '%1', width: 120, height: 90, active: true}]
    expect(findBestSplit(panes)).toEqual({targetPane: '%1', splitFlag: '-v'})
  })

  it('uses horizontal split on exact visual boundary', () => {
    const panes: TmuxPaneInfo[] = [{paneId: '%1', width: 200, height: 100, active: false}]
    expect(findBestSplit(panes)).toEqual({targetPane: '%1', splitFlag: '-h'})
  })

  it('targets the pane with the largest area', () => {
    const panes: TmuxPaneInfo[] = [
      {paneId: '%1', width: 100, height: 60, active: true},   // 6000
      {paneId: '%2', width: 160, height: 60, active: false},  // 9600
      {paneId: '%3', width: 120, height: 70, active: false},  // 8400
    ]

    expect(findBestSplit(panes)).toEqual({targetPane: '%2', splitFlag: '-h'})
  })

  it('does not prioritize active pane over larger inactive pane', () => {
    const panes: TmuxPaneInfo[] = [
      {paneId: '%1', width: 120, height: 70, active: true},   // 8400
      {paneId: '%2', width: 120, height: 80, active: false},  // 9600
    ]

    expect(findBestSplit(panes)?.targetPane).toBe('%2')
  })

  it('keeps the first pane when areas are equal', () => {
    const panes: TmuxPaneInfo[] = [
      {paneId: '%1', width: 120, height: 80, active: false}, // 9600
      {paneId: '%2', width: 160, height: 60, active: true},  // 9600
    ]

    expect(findBestSplit(panes)?.targetPane).toBe('%1')
  })
})
