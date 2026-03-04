import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {AIW_EXCLUDE_ENTRIES, updateGitExclude} from '../../src/lib/git-exclude-manager.js'
import {cleanupTestDir, createTestDir, pathExists} from '../helpers/test-utils.js'

describe('Git Exclude Manager', () => {
  let testDir: string
  let gitDir: string
  let excludePath: string

  beforeEach(async () => {
    testDir = await createTestDir('aiw-git-exclude-test')
    gitDir = join(testDir, '.git')
    await fs.mkdir(join(gitDir, 'info'), {recursive: true})
    excludePath = join(gitDir, 'info', 'exclude')
  })

  afterEach(async () => {
    await cleanupTestDir(testDir)
  })

  describe('updateGitExclude', () => {
    it('should include all supported IDE folders in managed defaults', () => {
      expect(AIW_EXCLUDE_ENTRIES).to.include('.claude')
      expect(AIW_EXCLUDE_ENTRIES).to.include('.codex')
      expect(AIW_EXCLUDE_ENTRIES).to.include('.windsurf')
    })

    it('should create exclude file when it does not exist', async () => {
      expect(await pathExists(excludePath)).to.be.false

      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      expect(await pathExists(excludePath)).to.be.true
    })

    it('should add folder patterns with trailing slashes', async () => {
      await updateGitExclude(gitDir, ['_bmad', '.claude', '.codex', '_bmad-output'])

      const content = await fs.readFile(excludePath, 'utf8')

      expect(content).to.include('_bmad/')
      expect(content).to.include('.claude/')
      expect(content).to.include('.codex/')
      expect(content).to.include('_bmad-output/')
    })

    it('should add AIW Installation header', async () => {
      await updateGitExclude(gitDir, ['_bmad'])

      const content = await fs.readFile(excludePath, 'utf8')

      expect(content).to.include('# AIW Installation')
    })

    it('should append to existing exclude file', async () => {
      // Create existing exclude file
      await fs.writeFile(excludePath, 'node_modules/\n.env\n', 'utf8')

      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      const content = await fs.readFile(excludePath, 'utf8')

      // Should contain both old and new patterns
      expect(content).to.include('node_modules/')
      expect(content).to.include('.env')
      expect(content).to.include('_bmad/')
      expect(content).to.include('.claude/')
    })

    it('should not duplicate patterns if already present', async () => {
      // First installation
      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      const firstContent = await fs.readFile(excludePath, 'utf8')
      const firstHeaderCount = (firstContent.match(/# AIW Installation/g) || []).length

      // Second installation attempt
      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      const secondContent = await fs.readFile(excludePath, 'utf8')
      const secondHeaderCount = (secondContent.match(/# AIW Installation/g) || []).length

      // Header should only appear once
      expect(firstHeaderCount).to.equal(1)
      expect(secondHeaderCount).to.equal(1)

      // Content should be identical
      expect(secondContent).to.equal(firstContent)
    })

    it('should handle multiple folder patterns', async () => {
      await updateGitExclude(gitDir, ['_bmad', '_bmad-output', '.claude', 'bmad-output', '**/bmad-output'])

      const content = await fs.readFile(excludePath, 'utf8')

      expect(content).to.include('_bmad/')
      expect(content).to.include('_bmad-output/')
      expect(content).to.include('.claude/')
      expect(content).to.include('bmad-output/')
      expect(content).to.include('**/bmad-output/')
    })

    it('should handle empty folder list', async () => {
      await updateGitExclude(gitDir, [])

      const content = await fs.readFile(excludePath, 'utf8')

      // Should create file with header but no patterns
      expect(content).to.include('# AIW Installation')
      expect(content.trim()).to.equal('# AIW Installation')
    })

    it('should preserve existing exclude file content structure', async () => {
      // Create exclude file with specific structure
      const existingContent = `# Build outputs
dist/
build/

# Dependencies
node_modules/

# Environment
.env
.env.local`

      await fs.writeFile(excludePath, existingContent, 'utf8')

      await updateGitExclude(gitDir, ['_bmad'])

      const newContent = await fs.readFile(excludePath, 'utf8')

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
      // Create exclude file with _bmad/ but no header (edge case)
      await fs.writeFile(excludePath, '_bmad/\n', 'utf8')

      // Should add header and new patterns
      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      const content = await fs.readFile(excludePath, 'utf8')

      // Should have AIW Installation header
      expect(content).to.include('# AIW Installation')

      // Should have both patterns (may have _bmad twice - once from original, once from update)
      expect(content).to.include('.claude/')
    })

    it('should format patterns with newlines correctly', async () => {
      await updateGitExclude(gitDir, ['_bmad', '.claude'])

      const content = await fs.readFile(excludePath, 'utf8')

      // Should have proper newline formatting
      expect(content).to.match(/# AIW Installation\n_bmad\/\n\.claude\/\n/)

      // Should end with newline
      expect(content).to.match(/\n$/)
    })

    it('should add only missing patterns when some already exist', async () => {
      // First installation with .aiwcli
      await updateGitExclude(gitDir, ['.aiwcli'])

      const firstContent = await fs.readFile(excludePath, 'utf8')
      const firstLineCount = firstContent.split('\n').filter((line) => line.trim()).length

      // Second installation with .aiwcli (existing) and _bmad (new)
      await updateGitExclude(gitDir, ['.aiwcli', '_bmad'])

      const secondContent = await fs.readFile(excludePath, 'utf8')

      // .aiwcli should appear exactly once
      const aiwcliMatches = secondContent.match(/\.aiwcli\//g) || []
      expect(aiwcliMatches.length).to.equal(1)

      // _bmad should be added
      expect(secondContent).to.include('_bmad/')

      // Header should still appear only once
      const headerMatches = secondContent.match(/# AIW Installation/g) || []
      expect(headerMatches.length).to.equal(1)

      // Should have added only one new line (_bmad/)
      const secondLineCount = secondContent.split('\n').filter((line) => line.trim()).length
      expect(secondLineCount).to.equal(firstLineCount + 1)
    })

    it('should create info/ directory if it does not exist', async () => {
      // Remove the info dir we created in beforeEach
      await fs.rm(join(gitDir, 'info'), {recursive: true})

      await updateGitExclude(gitDir, ['.aiwcli'])

      expect(await pathExists(excludePath)).to.be.true
      const content = await fs.readFile(excludePath, 'utf8')
      expect(content).to.include('.aiwcli/')
    })
  })
})
