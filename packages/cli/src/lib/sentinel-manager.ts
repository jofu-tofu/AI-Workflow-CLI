/**
 * SentinelManager — owns sentinel IPC lifecycle (creation, wait, cleanup).
 * Replaces scattered createSentinelIpcPaths + cleanupSentinelIpc across backends.
 */

import {
  cleanupSentinelIpc,
  createSentinelIpcPaths,
  readSentinelExitCode,
  type SentinelIpcPaths,
  waitForSentinelFile,
} from './runtime/sentinel-ipc.js'

export interface SentinelIO {
  create(toolName: string): SentinelIpcPaths
  waitForExit(sentinelPath: string, timeoutMs: number): Promise<number | null>
  cleanup(paths: SentinelIpcPaths): void
}

const defaultIO: SentinelIO = {
  create(toolName: string): SentinelIpcPaths {
    return createSentinelIpcPaths(`aiwcli-pane-${toolName}`)
  },
  async waitForExit(sentinelPath: string, timeoutMs: number): Promise<number | null> {
    const found = await waitForSentinelFile(sentinelPath, timeoutMs)
    return found ? readSentinelExitCode(sentinelPath, 1) : null
  },
  cleanup(paths: SentinelIpcPaths): void {
    cleanupSentinelIpc(paths)
  },
}

export class SentinelManager {
  private readonly tracked: SentinelIpcPaths[] = []
  private readonly io: SentinelIO

  constructor(io?: SentinelIO) {
    this.io = io ?? defaultIO
  }

  /**
   * Create a sentinel IPC path set for tracking a pane's exit code.
   * Returns the sentinelPath string, or undefined if disabled.
   */
  create(toolName: string, enabled = true): string | undefined {
    if (!enabled) return undefined
    const paths = this.io.create(toolName)
    this.tracked.push(paths)
    return paths.sentinelPath
  }

  /**
   * Wait for the sentinel file to be written, then read the exit code.
   */
  async waitForExit(sentinelPath: string, timeoutMs = 14_400_000): Promise<number | null> {
    return this.io.waitForExit(sentinelPath, timeoutMs)
  }

  /**
   * Clean up a specific sentinel by its path.
   */
  cleanup(sentinelPath: string): void {
    const entry = this.tracked.find((p) => p.sentinelPath === sentinelPath)
    if (entry) {
      this.io.cleanup(entry)
      const index = this.tracked.indexOf(entry)
      if (index >= 0) this.tracked.splice(index, 1)
    }
  }

  /**
   * Clean up all tracked sentinels. Call in finally block.
   */
  cleanupAll(): void {
    for (const paths of this.tracked) {
      this.io.cleanup(paths)
    }
    this.tracked.length = 0
  }
}
