/**
 * BSP split algorithm for tmux pane placement.
 * Extracted from template _shared/lib-ts/base/tmux-pane-placement.ts.
 */

import {execFileAsync} from './runtime/subprocess-utils.js'

export type TmuxSplitFlag = '-h' | '-v'

export interface TmuxPaneInfo {
  active: boolean
  height: number
  paneId: string
  width: number
}

export interface PlacementResult {
  splitFlag: TmuxSplitFlag
  targetPane: string
}

const LIST_PANES_FORMAT = '#{pane_id} #{pane_width} #{pane_height} #{pane_active}'

export async function listPanes(tmuxPath: string): Promise<TmuxPaneInfo[]> {
  const result = await execFileAsync(tmuxPath, ['list-panes', '-F', LIST_PANES_FORMAT], {
    timeout: 3000,
  })
  if (result.exitCode !== 0) return []

  const panes: TmuxPaneInfo[] = []
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const parts = line.split(/\s+/)
    if (parts.length < 4) continue

    const paneId = parts[0] ?? ''
    const width = Number.parseInt(parts[1] ?? '', 10)
    const height = Number.parseInt(parts[2] ?? '', 10)
    const activeRaw = parts[3] ?? ''

    if (!paneId || !Number.isFinite(width) || !Number.isFinite(height)) continue
    panes.push({
      paneId,
      width,
      height,
      active: activeRaw === '1',
    })
  }

  return panes
}

export function findBestSplit(panes: TmuxPaneInfo[]): null | PlacementResult {
  if (panes.length === 0) return null

  let best = panes[0]!
  let bestArea = best.width * best.height

  for (let i = 1; i < panes.length; i++) {
    const pane = panes[i]
    if (!pane) continue
    const area = pane.width * pane.height
    if (area > bestArea) {
      best = pane
      bestArea = area
    }
  }

  const CELL_ASPECT_RATIO = 2
  const visualWidth = best.width
  const visualHeight = best.height * CELL_ASPECT_RATIO

  return {
    targetPane: best.paneId,
    splitFlag: visualWidth >= visualHeight ? '-h' : '-v',
  }
}
