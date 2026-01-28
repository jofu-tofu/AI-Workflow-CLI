import {execSync} from 'node:child_process'

/**
 * Detect username from git config or environment variables.
 * Priority: git config user.name > USER env > USERNAME env > fallback to "User"
 */
export async function detectUsername(): Promise<string> {
  // Try git config first
  try {
    const gitUser = execSync('git config user.name', {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']})
    const username = gitUser.trim()
    if (username) return username
  } catch {
    // Git command failed or not configured, continue to env vars
  }

  // Try environment variables
  const envUser = process.env['USER'] ?? process.env['USERNAME']
  if (envUser) return envUser

  // Fallback
  return 'User'
}
