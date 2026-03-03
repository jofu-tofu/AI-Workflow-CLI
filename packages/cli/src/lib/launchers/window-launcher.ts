/**
 * Windows new-window fallback launcher.
 * Extracted from template _shared/lib-ts/base/launchers/window-launcher.ts.
 */

import {execFileAsync, findExecutable} from '../subprocess-utils.js'
import {quoteForSh} from '../tmux-primitives.js'
import type {PaneLaunchOptions, PaneLaunchResult, PaneLauncher} from '../pane-launcher.js'

function quoteForPowerShell(input: string): string {
  return `'${input.replaceAll("'", "''")}'`
}

function findPowerShell(): string | null {
  return findExecutable('pwsh') ?? findExecutable('powershell')
}

export class WindowLauncher implements PaneLauncher {
  readonly backend = 'window' as const

  async available(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    return Boolean(findPowerShell() ?? findExecutable('mintty'))
  }

  async launch(options: PaneLaunchOptions): Promise<PaneLaunchResult> {
    if (process.platform !== 'win32') {
      return {
        launched: false,
        backend: this.backend,
        reason: 'window launcher only available on Windows',
      }
    }

    const powershellPath = findPowerShell()
    if (powershellPath) {
      const cwd = options.cwd?.trim() || process.cwd()
      const startProcess = [
        `$cmd = ${quoteForPowerShell(options.command)}`,
        `$wd = ${quoteForPowerShell(cwd)}`,
        `Start-Process -FilePath ${quoteForPowerShell(powershellPath)} -WorkingDirectory $wd -ArgumentList @('-NoProfile','-Command',$cmd) | Out-Null`,
      ].join('; ')

      const psLaunch = await execFileAsync(
        powershellPath,
        ['-NoProfile', '-Command', startProcess],
        {timeout: 5000, shell: false},
      )

      if (psLaunch.exitCode === 0) {
        return {
          launched: true,
          backend: this.backend,
        }
      }

      return {
        launched: false,
        backend: this.backend,
        reason: 'Start-Process launch failed',
        stderr: psLaunch.stderr.trim() || undefined,
      }
    }

    const minttyPath = findExecutable('mintty')
    if (!minttyPath) {
      return {
        launched: false,
        backend: this.backend,
        reason: 'PowerShell and mintty are both unavailable',
      }
    }

    const shellBody = options.cwd?.trim()
      ? `cd ${quoteForSh(options.cwd.trim())} && ${options.command}`
      : options.command

    const minttyLaunch = await execFileAsync(
      minttyPath,
      ['-e', 'bash', '-lc', shellBody],
      {timeout: 5000, shell: false},
    )

    if (minttyLaunch.exitCode !== 0) {
      return {
        launched: false,
        backend: this.backend,
        reason: 'mintty launch failed',
        stderr: minttyLaunch.stderr.trim() || undefined,
      }
    }

    return {
      launched: true,
      backend: this.backend,
    }
  }
}
