import {promises as fs} from 'node:fs'
import {join} from 'node:path'

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
