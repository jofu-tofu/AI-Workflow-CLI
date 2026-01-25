import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {copyDir, installTemplate} from '../../src/lib/template-installer.js'
import {pathExists} from '../helpers/test-utils.js'

describe('Template Installer', () => {
  let testDir: string
  let mockTemplateDir: string

  beforeEach(async () => {
    // Create unique temp directories for each test
    testDir = join(tmpdir(), `pai-template-test-${randomUUID()}`)
    mockTemplateDir = join(tmpdir(), `pai-mock-template-${randomUUID()}`)

    await fs.mkdir(testDir, {recursive: true})
    await fs.mkdir(mockTemplateDir, {recursive: true})
  })

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, {force: true, recursive: true})
    } catch {
      // Ignore cleanup errors
    }

    try {
      await fs.rm(mockTemplateDir, {force: true, recursive: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('copyDir', () => {
    it('should copy a directory recursively', async () => {
      // Create mock directory structure
      const srcDir = join(mockTemplateDir, 'source')
      await fs.mkdir(join(srcDir, 'subdir'), {recursive: true})
      await fs.writeFile(join(srcDir, 'file1.txt'), 'content1', 'utf8')
      await fs.writeFile(join(srcDir, 'subdir', 'file2.txt'), 'content2', 'utf8')

      const destDir = join(testDir, 'destination')

      // Copy directory
      await copyDir(srcDir, destDir)

      // Verify structure copied
      expect(await pathExists(destDir)).to.be.true
      expect(await pathExists(join(destDir, 'file1.txt'))).to.be.true
      expect(await pathExists(join(destDir, 'subdir'))).to.be.true
      expect(await pathExists(join(destDir, 'subdir', 'file2.txt'))).to.be.true

      // Verify content
      const content1 = await fs.readFile(join(destDir, 'file1.txt'), 'utf8')
      const content2 = await fs.readFile(join(destDir, 'subdir', 'file2.txt'), 'utf8')
      expect(content1).to.equal('content1')
      expect(content2).to.equal('content2')
    })
  })

  describe('installTemplate', () => {
    beforeEach(async () => {
      // Create mock template structure
      // Non-dot folders
      await fs.mkdir(join(mockTemplateDir, '_bmad'), {recursive: true})
      await fs.mkdir(join(mockTemplateDir, 'GSR'), {recursive: true})

      // Dot folders (IDE-specific)
      await fs.mkdir(join(mockTemplateDir, '.claude'), {recursive: true})
      await fs.mkdir(join(mockTemplateDir, '.windsurf'), {recursive: true})

      // Add some files to verify copying
      await fs.writeFile(join(mockTemplateDir, '_bmad', 'config.yaml'), 'bmad config', 'utf8')
      await fs.writeFile(join(mockTemplateDir, '.claude', 'settings.json'), 'claude settings', 'utf8')
    })

    it('should install all non-dot folders inside .aiwcli container', async () => {
      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Verify .aiwcli container created
      expect(await pathExists(join(testDir, '.aiwcli'))).to.be.true

      // Verify non-dot folders installed inside .aiwcli
      expect(await pathExists(join(testDir, '.aiwcli', '_bmad'))).to.be.true
      expect(await pathExists(join(testDir, '.aiwcli', 'GSR'))).to.be.true

      // Verify result includes non-dot folders
      expect(result.installedFolders).to.include('_bmad')
      expect(result.installedFolders).to.include('GSR')
    })

    it('should install only matching IDE folders', async () => {
      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Verify claude installed
      expect(await pathExists(join(testDir, '.claude'))).to.be.true
      expect(result.installedFolders).to.include('.claude')

      // Verify windsurf NOT installed
      expect(await pathExists(join(testDir, '.windsurf'))).to.be.false
      expect(result.installedFolders).to.not.include('.windsurf')
    })

    it('should install multiple IDE folders when specified', async () => {
      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude', 'windsurf'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Verify both IDEs installed
      expect(await pathExists(join(testDir, '.claude'))).to.be.true
      expect(await pathExists(join(testDir, '.windsurf'))).to.be.true

      expect(result.installedFolders).to.include('.claude')
      expect(result.installedFolders).to.include('.windsurf')
    })

    it('should error when requested IDE folder not in template', async () => {
      try {
        await installTemplate({
          templateName: 'mock',
          targetDir: testDir,
          ides: ['nonexistent'],
          username: 'TestUser',
          projectName: 'test-project',
          templatePath: mockTemplateDir,
        })

        // Should not reach here
        expect.fail('Expected error to be thrown')
      } catch (error) {
        const err = error as Error
        expect(err.message).to.include("IDE 'nonexistent' not available")
        expect(err.message).to.include('Available: claude, windsurf')
      }
    })

    it('should error when template path does not exist', async () => {
      const nonexistentPath = join(mockTemplateDir, 'nonexistent')

      try {
        await installTemplate({
          templateName: 'nonexistent',
          targetDir: testDir,
          ides: ['claude'],
          username: 'TestUser',
          projectName: 'test-project',
          templatePath: nonexistentPath,
        })

        expect.fail('Expected error to be thrown')
      } catch (error) {
        const err = error as Error
        expect(err.message).to.include("Template 'nonexistent' not found")
      }
    })

    it('should return correct installation result', async () => {
      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude', 'windsurf'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Verify result structure
      expect(result).to.have.property('installedFolders')
      expect(result).to.have.property('skippedFolders')
      expect(result).to.have.property('mergedFolders')
      expect(result).to.have.property('mergedFileCount')
      expect(result).to.have.property('templatePath')

      expect(result.installedFolders).to.be.an('array')
      expect(result.installedFolders.length).to.equal(4) // _bmad, GSR, .claude, .windsurf

      expect(result.mergedFolders).to.be.an('array')
      expect(result.mergedFileCount).to.be.a('number')

      expect(result.templatePath).to.equal(mockTemplateDir)
    })

    it('should copy file contents correctly', async () => {
      await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Verify non-dot folder files copied inside .aiwcli
      const bmadConfig = await fs.readFile(join(testDir, '.aiwcli', '_bmad', 'config.yaml'), 'utf8')
      expect(bmadConfig).to.equal('bmad config')

      // Verify IDE folder files copied at root level
      const claudeSettings = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      expect(claudeSettings).to.equal('claude settings')
    })
  })

  describe('Content merging', () => {
    it('should merge template content when IDE folder already exists', async () => {
      // Create existing .claude folder with some content
      await fs.mkdir(join(testDir, '.claude', 'commands'), {recursive: true})
      await fs.writeFile(join(testDir, '.claude', 'commands', 'existing.md'), 'existing command', 'utf8')

      // Create template with method-named folder structure
      await fs.mkdir(join(mockTemplateDir, '.claude', 'commands', 'mock', 'agents'), {recursive: true})
      await fs.writeFile(
        join(mockTemplateDir, '.claude', 'commands', 'mock', 'agents', 'new-agent.md'),
        'new agent content',
        'utf8',
      )

      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Should have merged content
      expect(result.mergedFolders).to.include('.claude')
      expect(result.mergedFileCount).to.be.greaterThan(0)

      // Existing content should still be there
      expect(await pathExists(join(testDir, '.claude', 'commands', 'existing.md'))).to.be.true

      // New content should be merged
      expect(await pathExists(join(testDir, '.claude', 'commands', 'mock', 'agents', 'new-agent.md'))).to.be.true

      // Verify new content
      const newAgentContent = await fs.readFile(
        join(testDir, '.claude', 'commands', 'mock', 'agents', 'new-agent.md'),
        'utf8',
      )
      expect(newAgentContent).to.equal('new agent content')
    })

    it('should not overwrite existing files when merging', async () => {
      // Create existing .claude folder with a file that also exists in template
      await fs.mkdir(join(testDir, '.claude', 'commands', 'mock'), {recursive: true})
      await fs.writeFile(
        join(testDir, '.claude', 'commands', 'mock', 'same-file.md'),
        'original content',
        'utf8',
      )

      // Create template with the same file
      await fs.mkdir(join(mockTemplateDir, '.claude', 'commands', 'mock'), {recursive: true})
      await fs.writeFile(
        join(mockTemplateDir, '.claude', 'commands', 'mock', 'same-file.md'),
        'template content',
        'utf8',
      )

      await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['claude'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Original content should be preserved
      const content = await fs.readFile(join(testDir, '.claude', 'commands', 'mock', 'same-file.md'), 'utf8')
      expect(content).to.equal('original content')
    })
  })

  describe('IDE folder detection', () => {
    it('should correctly extract IDE names from dot folders', async () => {
      // Create template with various dot folders
      await fs.mkdir(join(mockTemplateDir, '.claude'), {recursive: true})
      await fs.mkdir(join(mockTemplateDir, '.windsurf'), {recursive: true})
      await fs.mkdir(join(mockTemplateDir, '.vscode'), {recursive: true})
      await fs.mkdir(join(mockTemplateDir, '_bmad'), {recursive: true})

      // Request a specific IDE
      const result = await installTemplate({
        templateName: 'mock',
        targetDir: testDir,
        ides: ['vscode'],
        username: 'TestUser',
        projectName: 'test-project',
        templatePath: mockTemplateDir,
      })

      // Only .vscode should be installed at root (non-dot _bmad inside .aiwcli)
      expect(result.installedFolders).to.include('.vscode')
      expect(result.installedFolders).to.include('_bmad')
      expect(result.installedFolders).to.not.include('.claude')
      expect(result.installedFolders).to.not.include('.windsurf')

      // Verify .vscode at root level
      expect(await pathExists(join(testDir, '.vscode'))).to.be.true
      // Verify _bmad inside .aiwcli
      expect(await pathExists(join(testDir, '.aiwcli', '_bmad'))).to.be.true
    })
  })
})
