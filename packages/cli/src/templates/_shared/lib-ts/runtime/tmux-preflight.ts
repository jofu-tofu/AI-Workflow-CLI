import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { isCommandAvailable, lookupExecutables } from './executable-policy.js'
import { isWindowsPlatform } from './platform-adapter.js'

export function selectMsysBashFromLookupPaths(paths: string[]): string | null {
  for (const candidate of paths) {
    const trimmed = candidate.trim()
    if (trimmed && /git|msys|mingw/iu.test(trimmed)) return trimmed
  }

  return null
}

export function deriveMsysBashFromGitPath(gitPath: string): string | null {
  const trimmed = gitPath.trim()
  if (!trimmed) return null

  const gitMatch = trimmed.match(/^(.+[/\\]Git)[/\\]cmd[/\\]git\.exe$/iu)
  if (!gitMatch?.[1]) return null
  return `${gitMatch[1]}\\usr\\bin\\bash.exe`
}

export function findMsysBash(): string | null {
  const directBash = selectMsysBashFromLookupPaths(lookupExecutables('bash', { platform: 'win32' }))
  if (directBash) return directBash

  const gitCandidates = lookupExecutables('git', { platform: 'win32' })
  for (const candidate of gitCandidates) {
    const derived = deriveMsysBashFromGitPath(candidate)
    if (derived && existsSync(derived)) return derived
  }

  const knownPaths = [
    String.raw`C:\Program Files\Git\usr\bin\bash.exe`,
    String.raw`C:\Program Files (x86)\Git\usr\bin\bash.exe`,
  ]

  for (const knownPath of knownPaths) {
    if (existsSync(knownPath)) return knownPath
  }

  return null
}

export function isTmuxReachableViaBash(bashPath: string): boolean {
  try {
    execFileSync(bashPath, ['-lc', 'tmux -V'], {
      timeout: 3000,
      stdio: 'ignore',
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export function isWinptyReachableViaBash(bashPath: string): boolean {
  try {
    execFileSync(bashPath, ['-lc', 'command -v winpty'], {
      timeout: 3000,
      stdio: 'ignore',
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export function isNativeTmuxAvailable(platform: NodeJS.Platform = process.platform): boolean {
  return isCommandAvailable('tmux', platform)
}

export interface WindowsTmuxPreflight {
  available: boolean
  bashPath?: string
  reason?: string
}

export function preflightWindowsTmux(): WindowsTmuxPreflight {
  if (!isWindowsPlatform()) {
    return { available: false, reason: 'not running on Windows' }
  }

  const bashPath = findMsysBash()
  if (!bashPath) {
    return { available: false, reason: 'Git Bash not found' }
  }

  if (!isTmuxReachableViaBash(bashPath)) {
    return { available: false, bashPath, reason: 'tmux not available in Git Bash' }
  }

  if (!isWinptyReachableViaBash(bashPath)) {
    return { available: false, bashPath, reason: 'winpty not available in Git Bash (required for TUI apps in MSYS2 tmux)' }
  }

  return { available: true, bashPath }
}
