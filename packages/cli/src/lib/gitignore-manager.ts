import {promises as fs} from 'node:fs'
import {join} from 'node:path'

/**
 * Update .gitignore with patterns for installed folders.
 *
 * Creates .gitignore if it doesn't exist, or appends to existing file.
 * Prevents duplicate patterns by checking if AIW installation header already exists.
 *
 * @param targetDir - Directory containing .gitignore file
 * @param folders - List of folder names to add as gitignore patterns (e.g., ['_bmad', '.claude'])
 */
export async function updateGitignore(targetDir: string, folders: string[]): Promise<void> {
  const gitignorePath = join(targetDir, '.gitignore')

  // Build patterns string with header
  const patterns = folders.map((folder) => `${folder}/`).join('\n')
  const patternsBlock = `# AIW Installation\n${patterns}`

  try {
    // Try to read existing .gitignore
    const existing = await fs.readFile(gitignorePath, 'utf8')

    // Check if AIW patterns already present
    if (existing.includes('# AIW Installation')) {
      return // Already has AIW patterns
    }

    // Append patterns with proper spacing
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : existing.length > 0 ? '\n' : ''
    await fs.writeFile(gitignorePath, existing + separator + patternsBlock + '\n', 'utf8')
  } catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, patternsBlock + '\n', 'utf8')
  }
}
