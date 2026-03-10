/**
 * PromptFileManager — owns prompt file lifecycle (creation, cleanup).
 * Replaces scattered writeFileSync calls for prompt temp files.
 */

import {writeFileSync} from 'node:fs'
import * as fs from 'node:fs'
import path from 'node:path'

export class PromptFileManager {
  private readonly files: string[] = []
  private readonly tempDir: string
  private readonly now: () => number
  private readonly pid: number

  constructor(options: { tempDir: string; now: () => number; pid: number }) {
    this.tempDir = options.tempDir
    this.now = options.now
    this.pid = options.pid
  }

  /**
   * Write prompt text to a temp file and return the path.
   */
  materialize(promptText: string): string {
    const filePath = path.join(this.tempDir, `aiwcli-prompt-${this.now()}-${this.pid}.txt`)
    writeFileSync(filePath, promptText, {encoding: 'utf8', mode: 0o600})
    this.files.push(filePath)
    return filePath
  }

  /**
   * Clean up all created prompt files. Call in finally block.
   */
  cleanup(): void {
    for (const filePath of this.files) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        // Best-effort cleanup.
      }
    }
    this.files.length = 0
  }
}
