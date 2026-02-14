import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {pathExists} from './paths.js'

/**
 * AIW gitignore section header marker
 */
const AIW_GITIGNORE_HEADER = '# AIW Installation'

/** Standard gitignore entries managed by AIW */
export const AIW_GITIGNORE_ENTRIES = ['.aiwcli', '_output', '.claude', '.windsurf']

/** Entries that should NEVER be removed from gitignore, even on clear */
const AIW_PERMANENT_ENTRIES = ['_output']

/**
 * Prune stale entries from the AIW Installation section in .gitignore.
 * Checks each entry against disk existence and removes entries whose paths don't exist.
 * Removes the entire section if no entries remain after pruning.
 *
 * @param targetDir - Directory containing .gitignore
 * @returns True if any entries were pruned
 */
export async function pruneGitignoreStaleEntries(targetDir: string): Promise<boolean> {
  const gitignorePath = join(targetDir, '.gitignore')

  try {
    const content = await fs.readFile(gitignorePath, 'utf8')

    if (!content.includes(AIW_GITIGNORE_HEADER)) {
      return false
    }

    const lines = content.split('\n')
    const newLines: string[] = []
    let inAiwSection = false
    const aiwSectionLines: string[] = []
    let pruned = false

    for (const line of lines) {
      if (line === AIW_GITIGNORE_HEADER) {
        inAiwSection = true
        aiwSectionLines.push(line)
        continue
      }

      if (inAiwSection) {
        // AIW section ends at empty line or another comment header
        if (line === '' || (line.startsWith('#') && line !== AIW_GITIGNORE_HEADER)) {
          inAiwSection = false
          const {lines: filtered, pruned: sectionPruned} = await pruneSection(aiwSectionLines, targetDir) // eslint-disable-line no-await-in-loop
          if (sectionPruned) pruned = true
          newLines.push(...filtered, line)
        } else {
          aiwSectionLines.push(line)
        }
      } else {
        newLines.push(line)
      }
    }

    // Handle case where AIW section is at end of file
    if (inAiwSection) {
      const {lines: filtered, pruned: sectionPruned} = await pruneSection(aiwSectionLines, targetDir)
      if (sectionPruned) pruned = true
      newLines.push(...filtered)
    }

    if (!pruned) {
      return false
    }

    // Clean up: remove AIW section entirely if only header remains
    let result = cleanupEmptySections(newLines.join('\n'))

    // Ensure file ends properly
    result = result.replace(/\n+$/, '\n')
    if (result.trim() === '') {
      result = ''
    }

    await fs.writeFile(gitignorePath, result, 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Prune stale entries from a parsed AIW section.
 * Checks each gitignore pattern against disk existence.
 */
async function pruneSection(
  sectionLines: string[],
  targetDir: string,
): Promise<{lines: string[]; pruned: boolean}> {
  let pruned = false
  const filtered: string[] = []

  for (const line of sectionLines) {
    // Always keep the header
    if (line === AIW_GITIGNORE_HEADER) {
      filtered.push(line)
      continue
    }

    // Check if the path exists on disk
    const cleanPath = line.replace(/^\//, '').replace(/\/$/, '')
    const absPath = join(targetDir, cleanPath)
    if (await pathExists(absPath)) { // eslint-disable-line no-await-in-loop
      filtered.push(line)
    } else {
      pruned = true
    }
  }

  return {lines: filtered, pruned}
}

/**
 * Remove empty AIW sections (header with no patterns following).
 */
function cleanupEmptySections(content: string): string {
  const lines = content.split('\n')
  const newLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string

    if (line === AIW_GITIGNORE_HEADER) {
      // Look ahead to see if there are any patterns
      const nextLine = lines[i + 1]
      if (nextLine === undefined || nextLine === '' || nextLine.startsWith('#')) {
        // Skip the header — section is empty
        // Also remove trailing empty lines before the header
        while (newLines.length > 0 && newLines.at(-1) === '') {
          newLines.pop()
        }

        continue
      }
    }

    newLines.push(line)
  }

  return newLines.join('\n')
}

/**
 * Update .gitignore with patterns for installed folders.
 *
 * Creates .gitignore if it doesn't exist, or appends to existing file.
 * Prevents duplicate patterns by checking each pattern individually.
 *
 * @param targetDir - Directory containing .gitignore file
 * @param folders - List of folder names to add as gitignore patterns (e.g., ['_bmad', '.claude'])
 */
export async function updateGitignore(targetDir: string, folders: string[]): Promise<void> {
  const gitignorePath = join(targetDir, '.gitignore')

  try {
    // Try to read existing .gitignore
    const existing = await fs.readFile(gitignorePath, 'utf8')

    // Filter out patterns that already exist in .gitignore
    const newPatterns = folders.filter((folder) => {
      const pattern = `${folder}/`
      // Check if this exact pattern exists in the file
      return !existing.includes(pattern)
    })

    // If no new patterns to add, we're done
    if (newPatterns.length === 0) {
      return
    }

    // Build patterns string
    const patterns = newPatterns.map((folder) => `${folder}/`).join('\n')

    // Check if AIW Installation header already exists
    const hasAiwHeader = existing.includes('# AIW Installation')

    let updatedContent: string
    if (hasAiwHeader) {
      // Find the AIW Installation section and append to it
      const lines = existing.split('\n')
      const headerIndex = lines.findIndex((line) => line.includes('# AIW Installation'))

      if (headerIndex === -1) {
        // Fallback: append at the end with header (shouldn't happen, but defensive)
        const separator = existing.endsWith('\n') ? '\n' : '\n\n'
        updatedContent = existing + separator + `# AIW Installation\n${patterns}\n`
      } else {
        // Insert new patterns right after the header
        lines.splice(headerIndex + 1, 0, patterns)
        updatedContent = lines.join('\n')
      }
    } else {
      // Add new section with header
      const separator = existing.length > 0 && existing.endsWith('\n') ? '\n' : existing.length > 0 ? '\n\n' : ''
      updatedContent = existing + separator + `# AIW Installation\n${patterns}\n`
    }

    await fs.writeFile(gitignorePath, updatedContent, 'utf8')
  } catch {
    // .gitignore doesn't exist, create it
    const patterns = folders.map((folder) => `${folder}/`).join('\n')
    const patternsBlock = `# AIW Installation\n${patterns}`
    await fs.writeFile(gitignorePath, patternsBlock + '\n', 'utf8')
  }
}

/**
 * Compute which AIW gitignore entries should be removed during clear.
 * Returns a simulation result — the caller decides whether to apply.
 *
 * Logic per entry:
 * - If in permanentEntries → keep (reason: "permanent")
 * - If directory exists and is non-empty → keep (reason: "directory has content")
 * - Otherwise → mark for removal
 *
 * @param targetDir - Directory containing .gitignore
 * @param permanentEntries - Entries that should never be removed (defaults to AIW_PERMANENT_ENTRIES)
 * @returns Lists of entries to remove and entries to keep with reasons
 */
export async function computeGitignoreRemovals(
  targetDir: string,
  permanentEntries: string[] = AIW_PERMANENT_ENTRIES,
): Promise<{toKeep: Array<{entry: string; reason: string}>; toRemove: string[]}> {
  const gitignorePath = join(targetDir, '.gitignore')
  const toRemove: string[] = []
  const toKeep: Array<{entry: string; reason: string}> = []

  // Read AIW section entries from .gitignore
  let content: string
  try {
    content = await fs.readFile(gitignorePath, 'utf8')
  } catch {
    return {toRemove, toKeep}
  }

  if (!content.includes(AIW_GITIGNORE_HEADER)) {
    return {toRemove, toKeep}
  }

  // Parse entries from the AIW section
  const lines = content.split('\n')
  let inAiwSection = false
  const aiwEntries: string[] = []

  for (const line of lines) {
    if (line === AIW_GITIGNORE_HEADER) {
      inAiwSection = true
      continue
    }

    if (inAiwSection) {
      if (line === '' || (line.startsWith('#') && line !== AIW_GITIGNORE_HEADER)) {
        inAiwSection = false
      } else {
        // Strip trailing slash to get the directory name
        const entry = line.replace(/\/$/, '')
        if (entry) {
          aiwEntries.push(entry)
        }
      }
    }
  }

  const permanentSet = new Set(permanentEntries)

  // Evaluate each entry
  await Promise.all(
    aiwEntries.map(async (entry) => {
      if (permanentSet.has(entry)) {
        toKeep.push({entry, reason: 'permanent'})
        return
      }

      const dirPath = join(targetDir, entry)
      const exists = await pathExists(dirPath)
      if (exists) {
        // Check if non-empty
        try {
          const entries = await fs.readdir(dirPath)
          if (entries.length > 0) {
            toKeep.push({entry, reason: 'directory has content'})
            return
          }
        } catch {
          // Can't read — be safe, keep it
          toKeep.push({entry, reason: 'directory has content'})
          return
        }
      }

      toRemove.push(entry)
    }),
  )

  return {toRemove, toKeep}
}

/**
 * Remove specific entries from the AIW section in .gitignore.
 * Cleans up the section header if no entries remain.
 *
 * @param targetDir - Directory containing .gitignore
 * @param entriesToRemove - Entry names to remove (without trailing slash)
 */
export async function removeGitignoreEntries(targetDir: string, entriesToRemove: string[]): Promise<void> {
  const gitignorePath = join(targetDir, '.gitignore')

  try {
    const content = await fs.readFile(gitignorePath, 'utf8')

    if (!content.includes(AIW_GITIGNORE_HEADER)) {
      return
    }

    const patternsToRemove = new Set(entriesToRemove.map((e) => `${e}/`))
    const lines = content.split('\n')
    const newLines: string[] = []
    let inAiwSection = false
    const aiwSectionLines: string[] = []

    for (const line of lines) {
      if (line === AIW_GITIGNORE_HEADER) {
        inAiwSection = true
        aiwSectionLines.push(line)
        continue
      }

      if (inAiwSection) {
        if (line === '' || (line.startsWith('#') && line !== AIW_GITIGNORE_HEADER)) {
          inAiwSection = false
          // Filter the AIW section
          const filtered = aiwSectionLines.filter(
            (l) => l === AIW_GITIGNORE_HEADER || !patternsToRemove.has(l),
          )
          newLines.push(...filtered, line)
        } else {
          aiwSectionLines.push(line)
        }
      } else {
        newLines.push(line)
      }
    }

    // Handle AIW section at end of file
    if (inAiwSection) {
      const filtered = aiwSectionLines.filter(
        (l) => l === AIW_GITIGNORE_HEADER || !patternsToRemove.has(l),
      )
      newLines.push(...filtered)
    }

    // Clean up empty AIW section
    let result = cleanupEmptySections(newLines.join('\n'))
    result = result.replace(/\n+$/, '\n')
    if (result.trim() === '') {
      result = ''
    }

    await fs.writeFile(gitignorePath, result, 'utf8')
  } catch {
    // .gitignore doesn't exist or can't be read
  }
}
