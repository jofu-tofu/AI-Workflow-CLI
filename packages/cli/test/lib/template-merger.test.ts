import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {
  CONTENT_FOLDER_TYPES,
  findMethodFolders,
  mergeContentTypeFolders,
  mergeTemplateContent,
} from '../../src/lib/template-merger.js'
import {pathExists} from '../helpers/test-utils.js'

describe('Template Merger', () => {
  let testDir: string
  let srcDir: string
  let destDir: string

  beforeEach(async () => {
    // Create unique temp directories for each test
    testDir = join(tmpdir(), `template-merger-test-${randomUUID()}`)
    srcDir = join(testDir, 'source')
    destDir = join(testDir, 'dest')

    await fs.mkdir(srcDir, {recursive: true})
    await fs.mkdir(destDir, {recursive: true})
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, {force: true, recursive: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('CONTENT_FOLDER_TYPES', () => {
    it('should include expected folder types', () => {
      expect(CONTENT_FOLDER_TYPES).to.include('agents')
      expect(CONTENT_FOLDER_TYPES).to.include('commands')
      expect(CONTENT_FOLDER_TYPES).to.include('workflows')
      expect(CONTENT_FOLDER_TYPES).to.include('tasks')
    })
  })

  describe('findMethodFolders', () => {
    it('should find folders matching the method name', async () => {
      // Create directory structure
      await fs.mkdir(join(srcDir, 'commands', 'bmad', 'agents'), {recursive: true})
      await fs.mkdir(join(srcDir, 'workflows', 'bmad', 'tasks'), {recursive: true})
      await fs.mkdir(join(srcDir, 'other', 'folder'), {recursive: true})

      const folders = await findMethodFolders(srcDir, 'bmad')

      expect(folders).to.have.lengthOf(2)
      expect(folders.some((f) => f.includes('commands'))).to.be.true
      expect(folders.some((f) => f.includes('workflows'))).to.be.true
    })

    it('should return empty array if no matches found', async () => {
      await fs.mkdir(join(srcDir, 'commands', 'other'), {recursive: true})

      const folders = await findMethodFolders(srcDir, 'bmad')

      expect(folders).to.have.lengthOf(0)
    })

    it('should find nested method folders', async () => {
      await fs.mkdir(join(srcDir, 'level1', 'level2', 'bmad'), {recursive: true})

      const folders = await findMethodFolders(srcDir, 'bmad')

      expect(folders).to.have.lengthOf(1)
      expect(folders[0]).to.include('level1')
      expect(folders[0]).to.include('level2')
    })
  })

  describe('mergeTemplateContent', () => {
    it('should merge content from method-named folders', async () => {
      // Create source with method folder
      await fs.mkdir(join(srcDir, 'commands', 'mymethod', 'agents'), {recursive: true})
      await fs.writeFile(join(srcDir, 'commands', 'mymethod', 'agents', 'agent1.md'), 'agent content', 'utf8')

      // Create destination
      await fs.mkdir(join(destDir, 'commands'), {recursive: true})

      const result = await mergeTemplateContent(srcDir, destDir, 'mymethod')

      expect(result.copiedFiles).to.have.lengthOf(1)
      expect(await pathExists(join(destDir, 'commands', 'mymethod', 'agents', 'agent1.md'))).to.be.true
    })

    it('should not overwrite existing files', async () => {
      // Create source with method folder
      await fs.mkdir(join(srcDir, 'commands', 'mymethod'), {recursive: true})
      await fs.writeFile(join(srcDir, 'commands', 'mymethod', 'file.md'), 'new content', 'utf8')

      // Create destination with same file
      await fs.mkdir(join(destDir, 'commands', 'mymethod'), {recursive: true})
      await fs.writeFile(join(destDir, 'commands', 'mymethod', 'file.md'), 'original', 'utf8')

      const result = await mergeTemplateContent(srcDir, destDir, 'mymethod')

      expect(result.skippedFiles).to.have.lengthOf(1)
      expect(result.copiedFiles).to.have.lengthOf(0)

      // Original content preserved
      const content = await fs.readFile(join(destDir, 'commands', 'mymethod', 'file.md'), 'utf8')
      expect(content).to.equal('original')
    })

    it('should create directories as needed', async () => {
      // Create source with nested structure
      await fs.mkdir(join(srcDir, 'commands', 'mymethod', 'deep', 'nested'), {recursive: true})
      await fs.writeFile(join(srcDir, 'commands', 'mymethod', 'deep', 'nested', 'file.md'), 'content', 'utf8')

      const result = await mergeTemplateContent(srcDir, destDir, 'mymethod')

      expect(result.createdDirs.length).to.be.greaterThan(0)
      expect(await pathExists(join(destDir, 'commands', 'mymethod', 'deep', 'nested', 'file.md'))).to.be.true
    })
  })

  describe('mergeContentTypeFolders', () => {
    it('should merge content type folders', async () => {
      // Create source with content type folders
      await fs.mkdir(join(srcDir, 'agents'), {recursive: true})
      await fs.mkdir(join(srcDir, 'workflows'), {recursive: true})
      await fs.writeFile(join(srcDir, 'agents', 'agent1.md'), 'agent', 'utf8')
      await fs.writeFile(join(srcDir, 'workflows', 'workflow1.md'), 'workflow', 'utf8')

      const result = await mergeContentTypeFolders(srcDir, destDir)

      expect(result.copiedFiles).to.have.lengthOf(2)
      expect(await pathExists(join(destDir, 'agents', 'agent1.md'))).to.be.true
      expect(await pathExists(join(destDir, 'workflows', 'workflow1.md'))).to.be.true
    })

    it('should find content type folders in subdirectories', async () => {
      // Create source with nested content type folders
      await fs.mkdir(join(srcDir, 'some', 'path', 'agents'), {recursive: true})
      await fs.writeFile(join(srcDir, 'some', 'path', 'agents', 'nested-agent.md'), 'content', 'utf8')

      const result = await mergeContentTypeFolders(srcDir, destDir)

      expect(result.copiedFiles).to.have.lengthOf(1)
      expect(await pathExists(join(destDir, 'some', 'path', 'agents', 'nested-agent.md'))).to.be.true
    })
  })
})
