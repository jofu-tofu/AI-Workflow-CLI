import { execSync } from 'node:child_process'
import type { ExecSyncOptionsWithStringEncoding } from 'node:child_process'

import { commandLookupBinary, isWindowsPlatform } from './platform-adapter.js'

export type WindowsLookupProfile = 'cmdOrExeFirst' | 'exeThenExtensionlessThenCmd'

export function parseLookupLines(stdout: string): string[] {
  return stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function pickWindowsPath(lines: string[], profile: WindowsLookupProfile): string | null {
  if (lines.length === 0) return null

  if (profile === 'cmdOrExeFirst') {
    return lines.find((line) => /\.(cmd|exe)$/i.test(line)) ?? lines[0] ?? null
  }

  return lines.find((line) => /\.exe$/i.test(line))
    ?? lines.find((line) => !/\.(cmd|ps1)$/i.test(line))
    ?? lines.find((line) => /\.cmd$/i.test(line))
    ?? lines[0]
    ?? null
}

export function selectLookupPath(
  lines: string[],
  platform: NodeJS.Platform = process.platform,
  windowsProfile: WindowsLookupProfile = 'cmdOrExeFirst',
): string | null {
  if (lines.length === 0) return null
  if (!isWindowsPlatform(platform)) return lines[0] ?? null
  return pickWindowsPath(lines, windowsProfile)
}

export function resolveExecutable(
  name: string,
  options?: {
    platform?: NodeJS.Platform | undefined
    windowsProfile?: WindowsLookupProfile | undefined
    timeoutMs?: number | undefined
    windowsHide?: boolean | undefined
  },
): string | null {
  const platform = options?.platform ?? process.platform
  const lines = lookupExecutables(name, {
    platform,
    timeoutMs: options?.timeoutMs,
    windowsHide: options?.windowsHide,
  })
  return selectLookupPath(lines, platform, options?.windowsProfile ?? 'cmdOrExeFirst')
}

export function isCommandAvailable(
  name: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return resolveExecutable(name, { platform }) !== null
}

export function lookupExecutables(
  name: string,
  options?: {
    platform?: NodeJS.Platform | undefined
    timeoutMs?: number | undefined
    windowsHide?: boolean | undefined
  },
): string[] {
  const platform = options?.platform ?? process.platform
  const lookupBin = commandLookupBinary(platform)
  const cmd = `${lookupBin} ${name}`

  try {
    return parseLookupLines(execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      timeout: options?.timeoutMs ?? 3000,
      windowsHide: options?.windowsHide ?? true,
    } as unknown as ExecSyncOptionsWithStringEncoding))
  } catch {
    return []
  }
}

