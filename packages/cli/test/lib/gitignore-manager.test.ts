import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {updateGitignore} from '../../src/lib/gitignore-manager.js'

/**
 * Helper to check if path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

describe('Gitignore Manager', () => {
  let testDir: string

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = join(tmpdir(), `aiw-gitignore-test-${randomUUID()}`)
    await fs.mkdir(testDir, {recursive: true})
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, {force: true, recursive: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('updateGitignore', () => {
    it('should create .gitignore when it does not exist', async () => {
      const gitignorePath = join(testDir, '.gitignore')
      expect(await pathExists(gitignorePath)).to.be.false

      await updateGitignore(testDir, ['_bmad', '.claude'])

      expect(await pathExists(gitignorePath)).to.be.true
    })

    it('should add folder patterns with trailing slashes', async () => {
      await updateGitignore(testDir, ['_bmad', '.claude', '_bmad-output'])

      const content = await fs.readFile(join(testDir, '.gitignore'), 'utf8')

      expect(content).to.include('_bmad/')
      expect(content).to.include('.claude/')
      expect(content).to.include('_bmad-output/')
    })

    it('should add AIW Installation header', async () => {
      await updateGitignore(testDir, ['_bmad'])

      const content = await fs.readFile(join(testDir, '.gitignore'), 'utf8')

      expect(content).to.include('# AIW Installation')
    })

    it('should append to existing .gitignore', async () => {
      const gitignorePath = join(testDir, '.gitignore')

      // Create existing .gitignore
      await fs.writeFile(gitignorePath, 'node_modules/\n.env\n', 'utf8')

      await updateGitignore(testDir, ['_bmad', '.claude'])

      const content = await fs.readFile(gitignorePath, 'utf8')

      // Should contain both old and new patterns
      expect(content).to.include('node_modules/')
      expect(content).to.include('.env')
      expect(content).to.include('_bmad/')
      expect(content).to.include('.claude/')
    })

    it('should not duplicate patterns if already present', async () => {
      const gitignorePath = join(testDir, '.gitignore')

      // First installation
      await updateGitignore(testDir, ['_bmad', '.claude'])

      const firstContent = await fs.readFile(gitignorePath, 'utf8')
      const firstHeaderCount = (firstContent.match(/# AIW Installation/g) || []).length

      // Second installation attempt
      await updateGitignore(testDir, ['_bmad', '.claude'])

      const secondContent = await fs.readFile(gitignorePath, 'utf8')
      const secondHeaderCount = (secondContent.match(/# AIW Installation/g) || []).length

      // Header should only appear once
      expect(firstHeaderCount).to.equal(1)
      expect(secondHeaderCount).to.equal(1)

      // Content should be identical
      expect(secondContent).to.equal(firstContent)
    })

    it('should handle multiple folder patterns', async () => {
      await updateGitignore(testDir, ['_bmad', '_bmad-output', '.claude', 'bmad-output', '**/bmad-output'])

      const content = await fs.readFile(join(testDir, '.gitignore'), 'utf8')

      expect(content).to.include('_bmad/')
      expect(content).to.include('_bmad-output/')
      expect(content).to.include('.claude/')
      expect(content).to.include('bmad-output/')
      expect(content).to.include('**/bmad-output/')
    })

    it('should handle empty folder list', async () => {
      await updateGitignore(testDir, [])

      const content = await fs.readFile(join(testDir, '.gitignore'), 'utf8')

      // Should create file with header but no patterns
      expect(content).to.include('# AIW Installation')
      expect(content.trim()).to.equal('# AIW Installation')
    })

    it('should preserve existing .gitignore content structure', async () => {
      const gitignorePath = join(testDir, '.gitignore')

      // Create .gitignore with specific structure
      const existingContent = `# Build outputs
dist/
build/

# Dependencies
node_modules/

# Environment
.env
.env.local`

      await fs.writeFile(gitignorePath, existingContent, 'utf8')

      await updateGitignore(testDir, ['_bmad'])

      const newContent = await fs.readFile(gitignorePath, 'utf8')

      // Original content should be preserved
      expect(newContent).to.include('# Build outputs')
      expect(newContent).to.include('dist/')
      expect(newContent).to.include('node_modules/')
      expect(newContent).to.include('.env.local')

      // New patterns should be appended
      expect(newContent).to.include('# AIW Installation')
      expect(newContent).to.include('_bmad/')
    })

    it('should add header even if patterns already exist', async () => {
      const gitignorePath = join(testDir, '.gitignore')

      // Create .gitignore with _bmad/ but no header (edge case)
      await fs.writeFile(gitignorePath, '_bmad/\n', 'utf8')

      // Should add header and new patterns
      await updateGitignore(testDir, ['_bmad', '.claude'])

      const content = await fs.readFile(gitignorePath, 'utf8')

      // Should have AIW Installation header
      expect(content).to.include('# AIW Installation')

      // Should have both patterns (may have _bmad twice - once from original, once from update)
      expect(content).to.include('.claude/')
    })

    it('should format patterns with newlines correctly', async () => {
      await updateGitignore(testDir, ['_bmad', '.claude'])

      const content = await fs.readFile(join(testDir, '.gitignore'), 'utf8')

      // Should have proper newline formatting
      expect(content).to.match(/# AIW Installation\n_bmad\/\n\.claude\/\n/)

      // Should end with newline
      expect(content).to.match(/\n$/)
    })
  })
})
