import {existsSync} from 'node:fs'
import {join} from 'node:path'

/**
 * Build a PATH env that only includes the directory containing bun.
 * Useful for hook tests that need a minimal PATH.
 */
export function bunOnlyPathEnv(): Record<string, string> {
  const rawPath = process.env.PATH ?? process.env.Path ?? ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun'
  const bunDir = rawPath
    .split(separator)
    .find((entry) => entry.length > 0 && existsSync(join(entry, bunBinaryName)))
  if (!bunDir) return {}
  if (process.platform === 'win32') {
    return {PATH: bunDir, Path: bunDir}
  }
  return {PATH: bunDir}
}

/**
 * Build a PATH env with a custom bin directory prepended.
 */
export function withPathPrefix(binDir: string): Record<string, string> {
  const basePath = process.env.PATH ?? process.env.Path ?? ''
  const sep = process.platform === 'win32' ? ';' : ':'
  const combined = basePath ? `${binDir}${sep}${basePath}` : binDir
  if (process.platform === 'win32') {
    return {PATH: combined, Path: combined}
  }
  return {PATH: combined}
}
