/**
 * @file Unit tests for clean command.
 *
 * Tests command structure, metadata, and output folder cleaning behavior.
 * Uses real temporary directories to test actual behavior rather than
 * checking source code strings.
 */

import {execSync} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'

import CleanCommand from '../../src/commands/clean.js'
import {cleanupTestDir, createTestDir, getAbsoluteBinPath} from '../helpers/test-utils.js'

describe('clean command', () => {
  describe('command metadata', () => {
    it('should have static description field', () => {
      expect(CleanCommand.description).to.be.a('string')
      expect(CleanCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference output folder in description', () => {
      expect(CleanCommand.description.toLowerCase()).to.include('output')
    })

    it('should reference method in description', () => {
      expect(CleanCommand.description.toLowerCase()).to.include('method')
    })

    it('should have static examples array', () => {
      expect(CleanCommand.examples).to.be.an('array')
      expect(CleanCommand.examples.length).to.be.greaterThan(0)
    })

    it('should include method flag example', () => {
      const {examples} = CleanCommand
      const hasMethodExample = examples.some((ex: string) => ex.includes('--method'))
      expect(hasMethodExample).to.be.true
    })

    it('should include -m shorthand example', () => {
      const {examples} = CleanCommand
      const hasShortExample = examples.some((ex: string) => ex.includes('-m '))
      expect(hasShortExample).to.be.true
    })

    it('should include dry-run example', () => {
      const {examples} = CleanCommand
      const hasDryRunExample = examples.some((ex: string) => ex.includes('--dry-run'))
      expect(hasDryRunExample).to.be.true
    })

    it('should include force example', () => {
      const {examples} = CleanCommand
      const hasForceExample = examples.some((ex: string) => ex.includes('--force'))
      expect(hasForceExample).to.be.true
    })

    it('should include --all example', () => {
      const {examples} = CleanCommand
      const hasAllExample = examples.some((ex: string) => ex.includes('--all'))
      expect(hasAllExample).to.be.true
    })

    it('should include -a shorthand example', () => {
      const {examples} = CleanCommand
      const hasShortExample = examples.some((ex: string) => ex.includes('-a '))
      expect(hasShortExample).to.be.true
    })
  })

  describe('command structure', () => {
    it('should have run method', () => {
      expect(CleanCommand.prototype.run).to.be.a('function')
    })

    it('should extend BaseCommand', () => {
      expect(CleanCommand).to.have.property('baseFlags')
    })

    it('should have method flag', () => {
      expect(CleanCommand.flags).to.have.property('method')
      expect(CleanCommand.flags['method']).to.have.property('char', 'm')
    })

    it('should have all flag', () => {
      expect(CleanCommand.flags).to.have.property('all')
      expect(CleanCommand.flags['all']).to.have.property('char', 'a')
    })

    it('should have method and all flags as mutually exclusive', () => {
      expect(CleanCommand.flags['method']).to.have.property('exclusive').that.includes('all')
      expect(CleanCommand.flags['all']).to.have.property('exclusive').that.includes('method')
    })

    it('should have dry-run flag', () => {
      expect(CleanCommand.flags).to.have.property('dry-run')
      expect(CleanCommand.flags['dry-run']).to.have.property('char', 'n')
    })

    it('should have force flag', () => {
      expect(CleanCommand.flags).to.have.property('force')
      expect(CleanCommand.flags['force']).to.have.property('char', 'f')
    })
  })

  describe('behavioral tests', () => {
    let testDir: string
    const binPath = getAbsoluteBinPath()

    beforeEach(async () => {
      testDir = await createTestDir()
    })

    afterEach(async () => {
      await cleanupTestDir(testDir)
    })

    it('should construct output folder path as _method-output', async () => {
      // Create output folder with expected naming pattern
      const outputFolder = join(testDir, '_bmad-output')
      await fs.mkdir(outputFolder)
      await fs.writeFile(join(outputFolder, 'test.txt'), 'content')

      // Run with dry-run to verify folder is found
      const result = execSync(`node "${binPath}" clean --method bmad --dry-run`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      expect(result).to.include('_bmad-output')
      expect(result).to.include('test.txt')
    })

    it('should list folder contents in dry-run mode', async () => {
      const outputFolder = join(testDir, '_gsd-output')
      await fs.mkdir(outputFolder)
      await fs.writeFile(join(outputFolder, 'file1.md'), 'content1')
      await fs.writeFile(join(outputFolder, 'file2.md'), 'content2')
      const subDir = join(outputFolder, 'subdir')
      await fs.mkdir(subDir)

      const result = execSync(`node "${binPath}" clean --method gsd --dry-run`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      expect(result).to.include('file1.md')
      expect(result).to.include('file2.md')
      expect(result).to.include('subdir')
      expect(result).to.include('3 item(s)')
    })

    it('should delete folder contents with --force flag', async () => {
      const outputFolder = join(testDir, '_test-output')
      await fs.mkdir(outputFolder)
      await fs.writeFile(join(outputFolder, 'delete-me.txt'), 'to be deleted')

      // Verify file exists before
      const beforeStat = await fs.stat(join(outputFolder, 'delete-me.txt'))
      expect(beforeStat.isFile()).to.be.true

      // Run with force to skip confirmation
      execSync(`node "${binPath}" clean --method test --force`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Verify file is deleted
      const entries = await fs.readdir(outputFolder)
      expect(entries).to.have.length(0)
    })

    it('should report error when neither --method nor --all is provided', () => {
      try {
        execSync(`node "${binPath}" clean`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        const err = error as {status: number; stderr: string;}
        expect(err.stderr).to.include('Either --method or --all is required')
        expect(err.status).to.be.greaterThan(0)
      }
    })

    it('should report when output folder does not exist', () => {
      const result = execSync(`node "${binPath}" clean --method nonexistent --dry-run`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      expect(result).to.include('does not exist')
    })

    it('should find all output folders with --all flag', async () => {
      // Create multiple output folders
      await fs.mkdir(join(testDir, '_bmad-output'))
      await fs.writeFile(join(testDir, '_bmad-output', 'file1.txt'), 'content')
      await fs.mkdir(join(testDir, '_gsd-output'))
      await fs.writeFile(join(testDir, '_gsd-output', 'file2.txt'), 'content')
      // Create a non-output folder (should be ignored)
      await fs.mkdir(join(testDir, 'regular-folder'))
      await fs.writeFile(join(testDir, 'regular-folder', 'ignored.txt'), 'content')

      const result = execSync(`node "${binPath}" clean --all --dry-run`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      expect(result).to.include('_bmad-output')
      expect(result).to.include('_gsd-output')
      expect(result).to.not.include('regular-folder')
      expect(result).to.include('2 output folder(s)')
    })

    it('should report when all output folders are empty', async () => {
      // Create empty output folder
      await fs.mkdir(join(testDir, '_empty-output'))

      const result = execSync(`node "${binPath}" clean --method empty --dry-run`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      expect(result).to.include('already empty')
    })

    it('should recursively delete subdirectories', async () => {
      const outputFolder = join(testDir, '_nested-output')
      await fs.mkdir(outputFolder)
      const subDir = join(outputFolder, 'level1')
      await fs.mkdir(subDir)
      const deepDir = join(subDir, 'level2')
      await fs.mkdir(deepDir)
      await fs.writeFile(join(deepDir, 'deep-file.txt'), 'deep content')

      // Run with force
      execSync(`node "${binPath}" clean --method nested --force`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Verify all contents deleted
      const entries = await fs.readdir(outputFolder)
      expect(entries).to.have.length(0)
    })
  })
})
