/**
 * @file Process spawning utilities for AI Workflow CLI.
 *
 * This module provides utilities for spawning external processes (e.g., Claude Code)
 * with proper error handling, stdio configuration, and debug logging.
 *
 * ## Key Features
 * - Spawn external processes with configurable stdio (inherit, pipe)
 * - Exit code capture and error handling
 * - Detached mode for parallel sessions
 * - Debug logging integration
 * - Cross-platform compatibility
 *
 * ## Usage Examples
 *
 * ### Basic Spawn (Interactive)
 * ```typescript
 * import {spawnProcess} from '../lib/spawn.js'
 *
 * const exitCode = await spawnProcess('claude', ['--dangerously-skip-permissions'])
 * if (exitCode !== 0) {
 *   console.error('Claude Code exited with error')
 * }
 * ```
 *
 * ### Parallel Sessions (Detached Mode)
 * ```typescript
 * // Launch multiple Claude Code sessions concurrently
 * const session1 = spawnProcess('claude', ['--dangerously-skip-permissions'], {detached: true})
 * const session2 = spawnProcess('claude', ['--dangerously-skip-permissions'], {detached: true})
 * await Promise.all([session1, session2])
 * ```
 *
 * ### Custom Working Directory
 * ```typescript
 * await spawnProcess('npm', ['install'], {cwd: '/path/to/project'})
 * ```
 *
 * @module lib/spawn
 */

import {execSync, spawn as nodeSpawn} from 'node:child_process'
import type {ChildProcess, SpawnOptions} from 'node:child_process'

import {debug, debugSpawn} from './debug.js'
import {ProcessSpawnError} from './errors.js'

/**
 * Spawn options for process execution.
 */
export interface SpawnProcessOptions {
  /**
   * Working directory for spawned process.
   * Defaults to current working directory if not specified.
   */
  cwd?: string

  /**
   * Spawn detached process for parallel sessions.
   * When true, process runs independently and parent can exit without waiting.
   * Useful for launching multiple Claude Code sessions concurrently.
   *
   * @default false
   */
  detached?: boolean

  /**
   * Stdio configuration.
   * - 'inherit': Connect child stdio to parent (default, for interactive sessions)
   * - 'pipe': Capture child stdio for programmatic access
   */
  stdio?: 'inherit' | 'pipe'
}

/**
 * Spawn an external process and return its exit code.
 *
 * This function wraps Node.js child_process.spawn with PAI-specific
 * error handling, debug logging, and parallel session support.
 *
 * ## Exit Code Mapping
 * - 0: Success
 * - Non-zero: Error (actual code from child process)
 * - null code: Defaults to 1
 *
 * ## Error Handling
 * - ENOENT: Command not found → ProcessSpawnError with install instructions
 * - EACCES: Permission denied → ProcessSpawnError with permission fix
 * - Other errors: ProcessSpawnError with error details
 *
 * ## Parallel Sessions
 * Use `detached: true` to spawn independent processes that don't block parent.
 * Multiple calls can run concurrently without conflicts.
 *
 * @param command - Command to execute (e.g., 'claude', 'npm', 'git')
 * @param args - Arguments array (e.g., ['--dangerously-skip-permissions'])
 * @param options - Spawn configuration options
 * @returns Promise<number> - Exit code (0 = success, non-zero = error)
 * @throws ProcessSpawnError - When spawn fails (command not found, permissions, etc.)
 *
 * @example
 * // Launch Claude Code with sandbox disabled
 * const exitCode = await spawnProcess('claude', ['--dangerously-skip-permissions'])
 *
 * @example
 * // Parallel session with detached mode
 * const session1 = spawnProcess('claude', ['--dangerously-skip-permissions'], {detached: true})
 * const session2 = spawnProcess('claude', ['--dangerously-skip-permissions'], {detached: true})
 * await Promise.all([session1, session2])
 *
 * @example
 * // Custom working directory
 * await spawnProcess('npm', ['test'], {cwd: '/path/to/project'})
 */
export async function spawnProcess(
  command: string,
  args: string[] = [],
  options: SpawnProcessOptions = {},
): Promise<number> {
  const {cwd, stdio = 'inherit', detached = false} = options

  // Log spawn details in debug mode
  debugSpawn(command, args)

  // Windows hybrid approach: try without shell first, fallback to .cmd if ENOENT
  // This preserves error detection while supporting .cmd files from npm
  if (process.platform === 'win32') {
    try {
      return await attemptSpawn(command, args, {cwd, stdio, detached, shell: false})
    } catch (error) {
      // If command not found and .cmd file exists, use cmd.exe wrapper
      // This avoids DEP0190 deprecation warning while supporting npm-installed commands
      if (error instanceof ProcessSpawnError && error.code === 'ENOENT' && commandExistsInPath(`${command}.cmd`)) {
        // Use cmd.exe /c to execute .cmd file without shell mode or deprecation warning
        return attemptSpawn('cmd.exe', ['/c', command, ...args], {cwd, stdio, detached, shell: false})
      }

      throw error
    }
  }

  // Unix: always use shell: false for security
  return attemptSpawn(command, args, {cwd, stdio, detached, shell: false})
}

/**
 * Check if a command exists in PATH (Windows only).
 * Uses 'where' command to check if file exists in PATH.
 */
function commandExistsInPath(command: string): boolean {
  try {
    execSync(`where ${command}`, {stdio: 'ignore', windowsHide: true})
    return true
  } catch {
    return false
  }
}

/**
 * Internal helper to attempt process spawn with given options.
 */
function attemptSpawn(command: string, args: string[], spawnOptions: SpawnOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const childProcess: ChildProcess = nodeSpawn(command, args, spawnOptions)

      // Handle spawn errors (ENOENT, EACCES, etc.)
      childProcess.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(
            new ProcessSpawnError(
              `Command not found: ${command}. Install Claude Code from https://claude.ai/download.`,
              'ENOENT',
            ),
          )
        } else if (error.code === 'EACCES') {
          reject(new ProcessSpawnError(`Permission denied: ${command}. Check file permissions.`, 'EACCES'))
        } else {
          reject(
            new ProcessSpawnError(
              `Failed to spawn ${command}: ${error.message}. Check that the command exists and is executable.`,
              error.code,
            ),
          )
        }
      })

      // Capture exit code on process close
      childProcess.on('close', (code: null | number, signal: null | string) => {
        const exitCode = code ?? 1 // Default to error if no code

        if (signal) {
          debug(`Process terminated by signal: ${signal}`)
        }

        debug(`Process exited with code: ${exitCode}`)
        resolve(exitCode)
      })

      // Unref detached processes to allow parent to exit
      if (spawnOptions.detached && childProcess.unref) {
        childProcess.unref()
      }
    } catch (error) {
      reject(new ProcessSpawnError(`Spawn error: ${error instanceof Error ? error.message : String(error)}`))
    }
  })
}
