/**
 * Tmux in-session pane launcher.
 * Extracted from template _shared/lib-ts/base/launchers/tmux-launcher.ts.
 */

import type {PaneLaunchOptions, PaneLaunchResult, PaneLauncher} from '../pane-launcher.js'
import {execFileAsync, findExecutable} from '../subprocess-utils.js'
import {findBestSplit, listPanes} from '../tmux-pane-placement.js'
import {quoteForSh} from '../tmux-primitives.js'

export type TmuxSplitFlag = '-h' | '-v'

export interface TmuxAvailability {
  available: boolean
  tmuxPath?: string
  reason?: string
}

export interface TmuxLauncherOptions {
  requireSessionEnv?: boolean
}

export {quoteForSh} from '../tmux-primitives.js'

export function normalizeSplitFlag(value: string | undefined): TmuxSplitFlag {
  return value?.trim() === '-v' ? '-v' : '-h'
}

export function getTmuxAvailability(options?: TmuxLauncherOptions): TmuxAvailability {
  const requireSessionEnv = options?.requireSessionEnv ?? true
  if (requireSessionEnv && !process.env.TMUX) {
    return {available: false, reason: 'TMUX is not set'}
  }

  const tmuxPath = findExecutable('tmux')
  if (!tmuxPath) {
    return {available: false, reason: 'tmux not found on PATH'}
  }

  return {available: true, tmuxPath}
}

function splitFlagFromDimensions(width: number, height: number): TmuxSplitFlag {
  const CELL_ASPECT_RATIO = 2
  return width >= height * CELL_ASPECT_RATIO ? '-h' : '-v'
}

function getLastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.at(-1) ?? ''
}

async function resolveSplitFlagForTargetPane(
  tmuxPath: string,
  splitTarget: string,
): Promise<TmuxSplitFlag | null> {
  const size = await execFileAsync(
    tmuxPath,
    ['display-message', '-p', '-t', splitTarget, '#{pane_width} #{pane_height}'],
    {timeout: 3000},
  )
  if (size.exitCode !== 0) return null

  const parts = size.stdout.trim().split(/\s+/)
  if (parts.length < 2) return null

  const width = Number.parseInt(parts[0] ?? '', 10)
  const height = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null

  return splitFlagFromDimensions(width, height)
}

async function resolveAutoSplit(
  tmuxPath: string,
  splitTarget?: string,
): Promise<{splitFlag: TmuxSplitFlag; splitTarget?: string}> {
  const explicitTarget = splitTarget?.trim()
  if (explicitTarget) {
    const splitFlag = await resolveSplitFlagForTargetPane(tmuxPath, explicitTarget)
    return {
      splitFlag: splitFlag ?? '-h',
      splitTarget: explicitTarget,
    }
  }

  const panes = await listPanes(tmuxPath)
  const placement = findBestSplit(panes)
  if (!placement) return {splitFlag: '-h'}

  return {
    splitFlag: placement.splitFlag,
    splitTarget: placement.targetPane,
  }
}

export class TmuxLauncher implements PaneLauncher {
  readonly backend = 'tmux' as const
  private options: TmuxLauncherOptions

  constructor(options?: TmuxLauncherOptions) {
    this.options = options ?? {}
  }

  async available(): Promise<boolean> {
    return getTmuxAvailability(this.options).available
  }

  async kill(paneId: string): Promise<void> {
    if (!paneId) return

    const tmux = getTmuxAvailability(this.options)
    if (!tmux.available || !tmux.tmuxPath) return

    await execFileAsync(tmux.tmuxPath, ['kill-pane', '-t', paneId], {
      timeout: 3000,
    })
  }

  async launch(options: PaneLaunchOptions): Promise<PaneLaunchResult> {
    const tmux = getTmuxAvailability(this.options)
    if (!tmux.available || !tmux.tmuxPath) {
      return {
        launched: false,
        backend: this.backend,
        reason: tmux.reason ?? 'tmux unavailable',
      }
    }

    const splitDirection = options.splitDirection ?? 'h'
    const explicitTarget = options.splitTarget?.trim()

    let splitFlag: TmuxSplitFlag
    let splitTarget: string | undefined

    if (splitDirection === 'auto') {
      try {
        const resolved = await resolveAutoSplit(tmux.tmuxPath, explicitTarget)
        splitFlag = resolved.splitFlag
        splitTarget = resolved.splitTarget
      } catch {
        splitFlag = '-h'
        splitTarget = explicitTarget
      }
    } else {
      splitFlag = splitDirection === 'v' ? '-v' : '-h'
      splitTarget = explicitTarget
    }

    const body = options.cwd?.trim()
      ? `cd ${quoteForSh(options.cwd.trim())} && ${options.command}`
      : options.command

    const tmuxArgs = ['split-window', splitFlag, '-P', '-F', '#{pane_id}']
    if (splitTarget) tmuxArgs.push('-t', splitTarget)
    tmuxArgs.push(`bash -lc ${quoteForSh(body)}`)

    const split = await execFileAsync(tmux.tmuxPath, tmuxArgs, {timeout: 5000})
    if (split.exitCode !== 0) {
      return {
        launched: false,
        backend: this.backend,
        reason: 'tmux split-window failed',
        stderr: split.stderr.trim() || undefined,
      }
    }

    const paneId = getLastLine(split.stdout) || undefined
    return {
      launched: true,
      backend: this.backend,
      paneId,
    }
  }
}
