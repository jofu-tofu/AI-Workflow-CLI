import {existsSync, statSync} from 'node:fs'
import {access} from 'node:fs/promises'
import {homedir} from 'node:os'
import {dirname, join, normalize} from 'node:path'

/**
 * Get the user's home directory path.
 * Wrapper around os.homedir() for consistency.
 * @returns Absolute path to user's home directory
 */
export function getHomePath(): string {
  return homedir()
}

/**
 * Expand a path that may contain ~ (tilde) home directory shorthand.
 * @param inputPath - Path that may start with ~
 * @returns Path with ~ expanded to home directory, or original path
 */
export function expandPath(inputPath: string): string {
  if (!inputPath) {
    return inputPath
  }

  // Only expand ~ at the start of the path
  if (inputPath === '~') {
    return homedir()
  }

  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return join(homedir(), inputPath.slice(2))
  }

  return inputPath
}

/**
 * Convert a path to Unix-style forward slashes.
 * Useful for cross-platform logging or display.
 * @param inputPath - Path with any separator style
 * @returns Path with forward slashes only
 */
export function toUnixPath(inputPath: string): string {
  return inputPath.replaceAll('\\', '/')
}

/**
 * Convert a path to Windows-style backslashes.
 * Useful for cross-platform logging or display.
 * @param inputPath - Path with any separator style
 * @returns Path with backslashes only
 */
export function toWindowsPath(inputPath: string): string {
  return inputPath.replaceAll('/', '\\')
}

/**
 * Normalize a path to use platform-native separators.
 * Handles mixed forward/back slashes and removes redundant separators.
 * @param inputPath - Path with potentially mixed separators
 * @returns Path with platform-native separators
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath) {
    return '.'
  }

  // Replace all forward and back slashes with forward slashes first,
  // then let normalize() handle the platform conversion
  const unified = inputPath.replaceAll(/[\\/]+/g, '/')
  return normalize(unified)
}

/**
 * Check if a path exists asynchronously.
 *
 * WARNING: Subject to Time-of-Check-Time-of-Use (TOCTOU) race condition.
 * The path may be created/deleted between checking and using it.
 * For critical operations, use try/catch around the actual file operation instead.
 *
 * @param pathToCheck - Path to check for existence
 * @returns Promise resolving to true if path exists, false otherwise
 */
export async function pathExists(pathToCheck: string): Promise<boolean> {
  try {
    await access(pathToCheck)
    return true
  } catch {
    return false
  }
}

/**
 * Join path segments using platform-appropriate separator.
 */
export function resolvePath(...segments: string[]): string {
  return join(...segments)
}

/**
 * Check if directory is an AI Workflow workspace (contains .aiw directory marker).
 * Per AC3: The marker must be a directory, not a file.
 */
export function isWorkspace(dir: string): boolean {
  const aiwPath = join(dir, '.aiw')
  try {
    return existsSync(aiwPath) && statSync(aiwPath).isDirectory()
  } catch {
    return false
  }
}

/**
 * Search up the directory tree for a .aiw workspace marker.
 * @param startDir - Directory to start searching from
 * @returns Path to workspace root, or null if not found
 */
export function findWorkspaceRoot(startDir: string): null | string {
  let currentDir = normalize(startDir)

  while (true) {
    if (isWorkspace(currentDir)) {
      return currentDir
    }

    const parentDir = dirname(currentDir)

    // Reached filesystem root
    if (parentDir === currentDir) {
      return null
    }

    currentDir = parentDir
  }
}

/**
 * Get the workspace path if in an AI Workflow workspace, or null otherwise.
 * Alias for findWorkspaceRoot with current directory as default.
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Path to workspace root, or null if not in a workspace or cwd unavailable
 */
export function getWorkspacePath(startDir?: string): null | string {
  try {
    const dir = startDir ?? process.cwd()
    return findWorkspaceRoot(dir)
  } catch {
    // process.cwd() can throw ENOENT if current directory was deleted
    return null
  }
}
