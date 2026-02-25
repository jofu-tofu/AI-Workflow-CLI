/**
 * @file Unit tests for branch command.
 *
 * Tests command structure, metadata, and behavior through the public API.
 * Uses real temporary git repositories to test actual behavior rather than
 * mocking private methods or checking source code strings.
 */

import {execSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import BranchCommand from '../../src/commands/branch.js'
import {runCommand} from '../helpers/run-command.js'
import {cleanupTestDir, createTestGitRepo, getAbsoluteBinPath} from '../helpers/test-utils.js'

describe('branch command', () => {
  describe('command metadata and help', () => {
    it('should have static description field', () => {
      expect(BranchCommand.description).to.be.a('string')
      expect(BranchCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference main/master branch in description', () => {
      expect(BranchCommand.description).to.match(/main|master/i)
    })

    it('should reference terminal and git requirements in description', () => {
      expect(BranchCommand.description).to.match(/terminal|git|repository/i)
    })

    it('should have static examples array', () => {
      expect(BranchCommand.examples).to.be.an('array')
      expect(BranchCommand.examples.length).to.be.greaterThan(0)
    })

    it('should include --main flag in examples', () => {
      const {examples} = BranchCommand
      const hasMainExample = examples.some((ex: string) => ex.includes('--main'))
      expect(hasMainExample).to.be.true
    })

    it('should include debug mode example', () => {
      const {examples} = BranchCommand
      const hasDebugExample = examples.some((ex: string) => ex.includes('--debug'))
      expect(hasDebugExample).to.be.true
    })

    it('should include --delete --all example', () => {
      const {examples} = BranchCommand
      const hasDeleteAllExample = examples.some((ex: string) => ex.includes('--delete') && ex.includes('--all'))
      expect(hasDeleteAllExample).to.be.true
    })

    it('should reference soft delete in description', () => {
      expect(BranchCommand.description).to.match(/soft delete/i)
    })

    it('should reference unpushed commits in description', () => {
      expect(BranchCommand.description).to.match(/unpushed/i)
    })

    it('should reference pull requests in description', () => {
      expect(BranchCommand.description).to.match(/pull request/i)
    })
  })

  describe('command structure', () => {
    it('should have run method', () => {
      expect(BranchCommand.prototype.run).to.be.a('function')
    })

    it('should extend BaseCommand', () => {
      expect(BranchCommand).to.have.property('baseFlags')
    })

    it('should define --main flag with correct properties', () => {
      expect(BranchCommand.flags).to.have.property('main')
      expect(BranchCommand.flags.main).to.have.property('char', 'm')
      expect(BranchCommand.flags.main).to.have.property('exclusive')
      expect(BranchCommand.flags.main.exclusive).to.include('launch')
      expect(BranchCommand.flags.main.exclusive).to.include('delete')
    })

    it('should define --launch flag with correct properties', () => {
      expect(BranchCommand.flags).to.have.property('launch')
      expect(BranchCommand.flags.launch).to.have.property('char', 'l')
      expect(BranchCommand.flags.launch).to.have.property('exclusive')
      expect(BranchCommand.flags.launch.exclusive).to.include('main')
      expect(BranchCommand.flags.launch.exclusive).to.include('delete')
    })

    it('should define --delete flag with correct properties', () => {
      expect(BranchCommand.flags).to.have.property('delete')
      expect(BranchCommand.flags.delete).to.have.property('char', 'd')
      expect(BranchCommand.flags.delete).to.have.property('exclusive')
      expect(BranchCommand.flags.delete.exclusive).to.include('main')
      expect(BranchCommand.flags.delete.exclusive).to.include('launch')
    })

    it('should define --all flag that depends on --delete', () => {
      expect(BranchCommand.flags).to.have.property('all')
      expect(BranchCommand.flags.all).to.have.property('char', 'a')
      expect(BranchCommand.flags.all).to.have.property('dependsOn')
      expect(BranchCommand.flags.all.dependsOn).to.include('delete')
    })

    it('should define branchName argument as optional', () => {
      expect(BranchCommand.args).to.have.property('branchName')
      expect(BranchCommand.args.branchName).to.have.property('required', false)
    })
  })

  describe('flag validation (in-process)', () => {
    it('should error when no flag is provided', async () => {
      const {error} = await runCommand('branch')
      expect(error).to.exist
      expect(error!.message).to.match(/--main|--launch|--delete.*required/i)
    })

    it('should show help output when requested', async () => {
      const {stdout} = await runCommand('branch --help')
      expect(stdout).to.include('USAGE')
      expect(stdout).to.include('--main')
      expect(stdout).to.include('--launch')
      expect(stdout).to.include('--delete')
      expect(stdout).to.include('--all')
      expect(stdout).to.include('-m')
      expect(stdout).to.include('-l')
      expect(stdout).to.include('-d')
      expect(stdout).to.include('-a')
    })

    it('should error when --launch provided without branch name', async () => {
      const {error} = await runCommand('branch --launch')
      expect(error).to.exist
      expect(error!.message).to.match(/branch name.*required/i)
    })

    it('should reject invalid branch names with spaces for --launch', async () => {
      const {error} = await runCommand(['branch', '--launch', 'branch with spaces'])
      expect(error).to.exist
      expect(error!.message).to.match(/invalid characters/i)
    })

    it('should exit with code 2 for invalid usage (no flags)', async () => {
      const {error} = await runCommand('branch')
      expect(error).to.exist
      // oclif sets exitCode on errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).oclif?.exit).to.equal(2)
    })
  })

  describe('--delete flag behavior', () => {
    let testDir: string

    beforeEach(async function() {
      this.timeout(5000)
      testDir = await createTestGitRepo()
    })

    afterEach(async () => {
      await cleanupTestDir(testDir)
    })

    it('should error when branch name is not provided', () => {
      const absoluteBin = getAbsoluteBinPath()
      try {
        execSync(`node "${absoluteBin}" branch --delete`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        expect(err.stderr).to.match(/branch name.*required/i)
      }
    })

    it('should prevent deletion of main branch', () => {
      const absoluteBin = getAbsoluteBinPath()
      try {
        execSync(`node "${absoluteBin}" branch --delete main`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        expect(err.stderr).to.match(/cannot delete.*main|main.*protected/i)
      }
    })

    it('should prevent deletion of master branch', () => {
      const absoluteBin = getAbsoluteBinPath()
      try {
        execSync(`node "${absoluteBin}" branch --delete master`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        expect(err.stderr).to.match(/cannot delete.*master|master.*protected/i)
      }
    })

    it('should error when branch does not exist', () => {
      const absoluteBin = getAbsoluteBinPath()
      try {
        execSync(`node "${absoluteBin}" branch --delete nonexistent-branch`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        const normalizedError = err.stderr.replaceAll(/[^a-zA-Z0-9\s]/g, ' ').replaceAll(/\s+/g, ' ')
        expect(normalizedError).to.match(/does not exist|not found|no such branch/i)
      }
    })

    it('should error when trying to delete current branch', async () => {
      execSync('git checkout -b feature-branch', {cwd: testDir, stdio: 'ignore'})
      const absoluteBin = getAbsoluteBinPath()

      try {
        execSync(`node "${absoluteBin}" branch --delete feature-branch`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        expect(err.stderr).to.match(/currently on it/i)
      }
    })

    it('should delete a branch when not on it', async function() {
      this.timeout(5000)
      const absoluteBin = getAbsoluteBinPath()

      execSync('git checkout -b feature-to-delete', {cwd: testDir, stdio: 'ignore'})
      await fs.writeFile(join(testDir, 'feature.txt'), 'feature\n')
      execSync('git add .', {cwd: testDir, stdio: 'ignore'})
      execSync('git commit -m "Feature commit"', {cwd: testDir, stdio: 'ignore'})

      try {
        execSync('git checkout main', {cwd: testDir, stdio: 'ignore'})
      } catch {
        execSync('git checkout master', {cwd: testDir, stdio: 'ignore'})
      }

      const result = execSync(`node "${absoluteBin}" branch --delete feature-to-delete`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(result).to.match(/deleted/i)

      const branches = execSync('git branch', {cwd: testDir, encoding: 'utf8'})
      expect(branches).to.not.include('feature-to-delete')
    })
  })

  describe('--main flag behavior', () => {
    let testDir: string

    beforeEach(async function() {
      this.timeout(5000)
      testDir = await createTestGitRepo()
    })

    afterEach(async () => {
      await cleanupTestDir(testDir)
    })

    it('should error when already on main branch', async function() {
      this.timeout(5000)
      const absoluteBin = getAbsoluteBinPath()

      try {
        execSync('git checkout -b main', {cwd: testDir, stdio: 'ignore'})
      } catch {
        try {
          execSync('git checkout main', {cwd: testDir, stdio: 'ignore'})
        } catch {
          // Already on main or using master
        }
      }

      try {
        execSync(`node "${absoluteBin}" branch --main`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {stderr: string}
        expect(err.stderr).to.match(/already on|neither.*exists|worktree/i)
      }
    })
  })

  describe('--delete --all flag behavior', () => {
    let testDir: string

    beforeEach(async function() {
      this.timeout(5000)
      testDir = await createTestGitRepo()
    })

    afterEach(async () => {
      await cleanupTestDir(testDir)
    })

    it('should complete without error when there are no worktrees to delete', function() {
      this.timeout(5000)
      const absoluteBin = getAbsoluteBinPath()

      const result = execSync(`node "${absoluteBin}" branch --delete --all`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(result).to.match(/cleanup complete/i)
    })

    it('should preserve main/master branch (protected)', function() {
      this.timeout(5000)
      const absoluteBin = getAbsoluteBinPath()

      const result = execSync(`node "${absoluteBin}" branch --delete --all`, {
        cwd: testDir,
        encoding: 'utf8',
      })

      expect(result).to.match(/preserved/i)
    })
  })

  describe('exit codes (subprocess)', () => {
    it('should exit with non-zero code for environment error (not a git repo)', async () => {
      const nonGitDir = join(tmpdir(), `aiw-non-git-test-${randomUUID()}`)
      await fs.mkdir(nonGitDir, {recursive: true})
      const absoluteBin = getAbsoluteBinPath()

      try {
        execSync(`node "${absoluteBin}" branch --delete some-branch`, {
          cwd: nonGitDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {status: number; stderr: string}
        expect(err.status).to.be.greaterThan(0)
        expect(err.stderr).to.match(/not a git repository/i)
      } finally {
        await cleanupTestDir(nonGitDir)
      }
    })

    it('should exit with non-zero code for invalid usage (protected branch)', async () => {
      const testDir = await createTestGitRepo()
      const absoluteBin = getAbsoluteBinPath()

      try {
        execSync(`node "${absoluteBin}" branch --delete main`, {
          cwd: testDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        expect.fail('Should have thrown')
      } catch (error) {
        const err = error as {status: number; stderr: string}
        expect(err.status).to.be.greaterThan(0)
        expect(err.stderr).to.match(/cannot delete.*main|main.*protected/i)
      } finally {
        await cleanupTestDir(testDir)
      }
    })
  })

  describe('git repository requirement', () => {
    const flagsRequiringGitRepo = [
      {flag: '--delete some-branch', name: '--delete'},
      {flag: '--launch new-feature', name: '--launch'},
      {flag: '--main', name: '--main'},
      {flag: '--delete --all', name: '--delete --all'},
    ]

    for (const {flag, name} of flagsRequiringGitRepo) {
      it(`should error when not in a git repository (${name})`, async () => {
        const nonGitDir = join(tmpdir(), `aiw-non-git-test-${randomUUID()}`)
        await fs.mkdir(nonGitDir, {recursive: true})
        const absoluteBin = getAbsoluteBinPath()

        try {
          execSync(`node "${absoluteBin}" branch ${flag}`, {
            cwd: nonGitDir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          expect.fail('Should have thrown')
        } catch (error) {
          const err = error as {stderr: string}
          expect(err.stderr).to.match(/not a git repository/i)
        } finally {
          await cleanupTestDir(nonGitDir)
        }
      })
    }
  })

  describe('branch name validation', () => {
    const validPattern = /^[a-zA-Z0-9._/-]+$/

    it('should accept valid branch names', () => {
      const validNames = [
        'feature-v1.0', 'release.1.2.3', 'fix.bug',
        'feature-branch', 'my-new-feature', 'bug-fix-123',
        'feature_branch', 'my_new_feature', 'bug_fix_123',
        'feature/my-branch', 'bugfix/issue-123', 'release/v1.0',
      ]
      for (const name of validNames) {
        expect(validPattern.test(name), `Expected "${name}" to be valid`).to.be.true
      }
    })

    it('should reject invalid branch names', () => {
      const invalidNames = [
        'my branch', 'feature branch', 'bug fix',
        'branch@name', 'feature#123', 'bug$fix', 'test!branch',
      ]
      for (const name of invalidNames) {
        expect(validPattern.test(name), `Expected "${name}" to be invalid`).to.be.false
      }
    })
  })
})
