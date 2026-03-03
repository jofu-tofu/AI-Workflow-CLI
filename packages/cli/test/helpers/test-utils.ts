/**
 * @file Shared test utilities
 *
 * Common helpers used across multiple test files to reduce duplication
 * and ensure consistent test setup/teardown patterns.
 */

import {execSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {existsSync, promises as fs, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

/**
 * Check if a path exists
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Create a temporary directory for testing
 * @param prefix - Optional prefix for the directory name (default: 'aiw-test')
 */
export async function createTestDir(prefix = 'aiw-test'): Promise<string> {
  const testDir = join(tmpdir(), `${prefix}-${randomUUID()}`)
  await fs.mkdir(testDir, {recursive: true})
  return testDir
}

/**
 * Clean up a test directory
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await fs.rm(testDir, {force: true, recursive: true})
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a temporary git repository for testing
 */
export async function createTestGitRepo(): Promise<string> {
  const testDir = join(tmpdir(), `aiw-git-test-${randomUUID()}`)
  await fs.mkdir(testDir, {recursive: true})

  // Initialize git repo
  execSync('git init', {cwd: testDir, stdio: 'ignore'})
  execSync('git config user.email "test@example.com"', {cwd: testDir, stdio: 'ignore'})
  execSync('git config user.name "Test User"', {cwd: testDir, stdio: 'ignore'})

  // Create initial commit so we have a valid repo
  await fs.writeFile(join(testDir, 'README.md'), '# Test\n')
  execSync('git add .', {cwd: testDir, stdio: 'ignore'})
  execSync('git commit -m "Initial commit"', {cwd: testDir, stdio: 'ignore'})

  return testDir
}

/**
 * Get absolute path to the CLI bin from packages/cli directory.
 * Uses bin/run.js which points to the compiled dist/ output.
 */
export function getAbsoluteBinPath(): string {
  let current = dirname(fileURLToPath(import.meta.url))

  for (let i = 0; i < 10; i += 1) {
    const pkgPath = join(current, 'package.json')
    const binPath = join(current, 'bin', 'run.js')

    try {
      const pkgRaw = readFileSync(pkgPath, 'utf8')
      const pkg = JSON.parse(pkgRaw) as {name?: string}
      if (pkg.name === 'aiwcli' && existsSync(binPath)) return binPath
    } catch {
      // Keep scanning upwards.
    }

    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }

  throw new Error('Unable to locate packages/cli bin/run.js from test helper')
}
