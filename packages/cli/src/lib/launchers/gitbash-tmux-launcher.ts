/**
 * Git Bash tmux launcher for Windows.
 * Extracted from template _shared/lib-ts/base/launchers/gitbash-tmux-launcher.ts.
 */

import {createHash} from 'node:crypto'
import * as fs from 'node:fs'

import type {PaneLaunchOptions, PaneLaunchResult, PaneLauncher} from '../pane-launcher.js'
import {execFileAsync, findExecutable} from '../subprocess-utils.js'
import {findBestSplit, type TmuxPaneInfo} from '../tmux-pane-placement.js'
import {TMUX_SOCKET_PATH, quoteForSh, toMsysPosixPath} from '../tmux-primitives.js'

async function tmuxViaBash(
  bashPath: string,
  tmuxArgs: string[],
  timeoutMs = 5000,
): Promise<{exitCode: number; stdout: string; stderr: string}> {
  const argStr = tmuxArgs.map(quoteForSh).join(' ')
  const cmd = `tmux -S ${TMUX_SOCKET_PATH} ${argStr}`
  return execFileAsync(bashPath, ['-lc', cmd], {
    timeout: timeoutMs,
    env: {...process.env, MSYS_NO_PATHCONV: '1'},
  })
}

function parsePaneList(stdout: string): TmuxPaneInfo[] {
  const panes: TmuxPaneInfo[] = []
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const parts = line.split(/\s+/)
    if (parts.length < 4) continue

    const paneId = parts[0] ?? ''
    const width = Number.parseInt(parts[1] ?? '', 10)
    const height = Number.parseInt(parts[2] ?? '', 10)
    const activeRaw = parts[3] ?? ''

    if (!paneId || !Number.isFinite(width) || !Number.isFinite(height)) continue
    panes.push({paneId, width, height, active: activeRaw === '1'})
  }

  return panes
}

export class GitBashTmuxLauncher implements PaneLauncher {
  readonly backend = 'tmux' as const

  async available(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    if (process.env.TMUX) return false

    const bashPath = findExecutable('bash')
    if (!bashPath) return false

    const probe = await execFileAsync(bashPath, ['-lc', 'tmux -V'], {
      timeout: 3000,
      env: {...process.env, MSYS_NO_PATHCONV: '1'},
    })
    if (probe.exitCode !== 0) return false

    return Boolean(findExecutable('mintty') ?? findExecutable('git-bash'))
  }

  async kill(paneId: string): Promise<void> {
    const bash = findExecutable('bash')
    if (!bash || !paneId) return
    await tmuxViaBash(bash, ['kill-pane', '-t', paneId])
  }

  async launch(options: PaneLaunchOptions): Promise<PaneLaunchResult> {
    const bash = findExecutable('bash')
    if (!bash) {
      return {launched: false, backend: this.backend, reason: 'bash not found'}
    }

    const projectRoot = options.cwd?.trim() || process.cwd()
    const projectHash = createHash('md5').update(projectRoot).digest('hex').slice(0, 8)
    const sessionName = `aiwcli-${projectHash}`

    let existed: boolean
    const hasResult = await tmuxViaBash(bash, ['has-session', '-t', sessionName])
    if (hasResult.exitCode !== 0 && hasResult.stderr.includes('error connecting')) {
      try {
        fs.unlinkSync(TMUX_SOCKET_PATH)
      } catch { /* ignore */ }

      existed = (await tmuxViaBash(bash, ['has-session', '-t', sessionName])).exitCode === 0
    } else {
      existed = hasResult.exitCode === 0
    }

    if (!existed) {
      const posixCwd = toMsysPosixPath(projectRoot)
      const create = await tmuxViaBash(bash, ['new-session', '-d', '-s', sessionName, '-c', posixCwd])
      if (create.exitCode !== 0) {
        return {
          launched: false,
          backend: this.backend,
          reason: 'tmux new-session failed',
          stderr: create.stderr.trim() || undefined,
        }
      }
    }

    const listResult = await tmuxViaBash(bash, [
      'list-panes', '-t', sessionName, '-F', '#{pane_id} #{pane_width} #{pane_height} #{pane_active}',
    ])
    const panes = parsePaneList(listResult.stdout)
    const placement = findBestSplit(panes)
    const splitFlag = placement?.splitFlag ?? '-h'
    const targetPane = placement?.targetPane ?? sessionName

    const posixCwd = toMsysPosixPath(projectRoot)
    const splitArgs = [
      'split-window', splitFlag,
      '-c', posixCwd,
      '-P', '-F', '#{pane_id}',
      '-t', targetPane,
      options.command,
    ]
    const split = await tmuxViaBash(bash, splitArgs)

    if (split.exitCode !== 0) {
      if (!existed) {
        await tmuxViaBash(bash, ['kill-session', '-t', sessionName]).catch(() => {})
      }

      return {
        launched: false,
        backend: this.backend,
        reason: 'tmux split-window failed',
        stderr: split.stderr.trim() || undefined,
      }
    }

    const paneId = split.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? undefined

    const clients = await tmuxViaBash(bash, ['list-clients', '-t', sessionName])
    if (clients.exitCode !== 0 || !clients.stdout.trim()) {
      const terminal = findExecutable('mintty') ?? findExecutable('git-bash')
      if (terminal) {
        const attachCmd = `tmux -S ${quoteForSh(TMUX_SOCKET_PATH)} attach -t ${quoteForSh(sessionName)}`
        execFileAsync(terminal, ['-e', bash, '-lc', attachCmd], {timeout: 5000})
          .catch(() => { /* fire-and-forget */ })
      }
    }

    return {
      launched: true,
      backend: this.backend,
      paneId,
    }
  }
}
