/**
 * @file Shared test utilities
 *
 * Common helpers used across multiple test files to reduce duplication
 * and ensure consistent test setup/teardown patterns.
 */

import {execSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

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
  // process.cwd() during tests is packages/cli, and bin is in packages/cli/bin
  return join(process.cwd(), 'bin', 'run.js')
}
