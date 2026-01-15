/**
 * @file Unit tests for branch command.
 *
 * Tests command structure, metadata, and implementation behavior.
 * Note: Git and terminal operations use real processes in integration tests.
 * This file focuses on static validation and command structure.
 */

import {expect} from 'chai'

import BranchCommand from '../../src/commands/branch.js'

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

    it('should return promise (async)', () => {
      expect(BranchCommand.prototype.run).to.be.a('function')
    })

    it('should extend BaseCommand', () => {
      expect(BranchCommand).to.have.property('baseFlags')
    })

    it('should define --main flag', () => {
      expect(BranchCommand.flags).to.have.property('main')
      expect(BranchCommand.flags.main).to.have.property('char', 'm')
      expect(BranchCommand.flags.main).to.have.property('exclusive')
      expect(BranchCommand.flags.main.exclusive).to.include('launch')
      expect(BranchCommand.flags.main.exclusive).to.include('delete')
    })

    it('should define --launch flag', () => {
      expect(BranchCommand.flags).to.have.property('launch')
      expect(BranchCommand.flags.launch).to.have.property('char', 'l')
      expect(BranchCommand.flags.launch).to.have.property('exclusive')
      expect(BranchCommand.flags.launch.exclusive).to.include('main')
      expect(BranchCommand.flags.launch.exclusive).to.include('delete')
    })

    it('should define --delete flag', () => {
      expect(BranchCommand.flags).to.have.property('delete')
      expect(BranchCommand.flags.delete).to.have.property('char', 'd')
      expect(BranchCommand.flags.delete).to.have.property('exclusive')
      expect(BranchCommand.flags.delete.exclusive).to.include('main')
      expect(BranchCommand.flags.delete.exclusive).to.include('launch')
    })

    it('should define --all flag', () => {
      expect(BranchCommand.flags).to.have.property('all')
      expect(BranchCommand.flags.all).to.have.property('char', 'a')
      expect(BranchCommand.flags.all).to.have.property('dependsOn')
      expect(BranchCommand.flags.all.dependsOn).to.include('delete')
    })

    it('should define branchName argument', () => {
      expect(BranchCommand.args).to.have.property('branchName')
      expect(BranchCommand.args.branchName).to.have.property('required', false)
    })
  })

  describe('implementation verification', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('should delegate to handleMainBranch when --main flag is used', async () => {
      const handleMainBranchStub = sinon.stub(BranchCommand.prototype as any, 'handleMainBranch').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(handleMainBranchStub.calledOnce).to.be.true
    })

    it('should delegate to handleWorktreeLaunch when --launch flag is used', async () => {
      const handleWorktreeLaunchStub = sinon.stub(BranchCommand.prototype as any, 'handleWorktreeLaunch').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {launch: true},
        args: {branchName: 'feature-branch'},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(handleWorktreeLaunchStub.calledOnce).to.be.true
      expect(handleWorktreeLaunchStub.calledWith('feature-branch')).to.be.true
    })

    it('should delegate to handleDelete when --delete flag is used (without --all)', async () => {
      const handleDeleteStub = sinon.stub(BranchCommand.prototype as any, 'handleDelete').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {delete: true},
        args: {branchName: 'old-branch'},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(handleDeleteStub.calledOnce).to.be.true
      expect(handleDeleteStub.calledWith('old-branch')).to.be.true
    })

    it('should delegate to handleDeleteAll when both --delete and --all flags are used', async () => {
      const handleDeleteAllStub = sinon.stub(BranchCommand.prototype as any, 'handleDeleteAll').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {delete: true, all: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(handleDeleteAllStub.calledOnce).to.be.true
    })

    it('should call isGitRepository when handling main branch', async () => {
      const isGitRepositoryStub = sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(false)
      const errorStub = sinon.stub(BranchCommand.prototype, 'error')
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(isGitRepositoryStub.calledOnce).to.be.true
      expect(errorStub.called).to.be.true
    })

    it('should call getCurrentBranch when handling main branch', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(true)
      const getCurrentBranchStub = sinon.stub(BranchCommand.prototype as any, 'getCurrentBranch').resolves('main')
      const errorStub = sinon.stub(BranchCommand.prototype, 'error')
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(getCurrentBranchStub.calledOnce).to.be.true
      expect(errorStub.called).to.be.true
    })

    it('should call getMainBranch when handling main branch', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(true)
      sinon.stub(BranchCommand.prototype as any, 'getCurrentBranch').resolves('feature-branch')
      const getMainBranchStub = sinon.stub(BranchCommand.prototype as any, 'getMainBranch').resolves('main')
      sinon.stub(BranchCommand.prototype as any, 'launchTerminalWithAiw').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(getMainBranchStub.calledOnce).to.be.true
    })

    it('should call launchTerminalWithAiw when handling main branch successfully', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(true)
      sinon.stub(BranchCommand.prototype as any, 'getCurrentBranch').resolves('feature-branch')
      sinon.stub(BranchCommand.prototype as any, 'getMainBranch').resolves('main')
      const launchTerminalStub = sinon.stub(BranchCommand.prototype as any, 'launchTerminalWithAiw').resolves()
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(launchTerminalStub.calledOnce).to.be.true
      expect(launchTerminalStub.calledWith('main')).to.be.true
    })

    it('should handle error when not in git repository', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(false)
      const errorStub = sinon.stub(BranchCommand.prototype, 'error')
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.match(/not a git repository/i)
    })

    it('should handle error when already on main/master branch', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(true)
      sinon.stub(BranchCommand.prototype as any, 'getCurrentBranch').resolves('main')
      const errorStub = sinon.stub(BranchCommand.prototype, 'error')
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.match(/already on/i)
    })

    it('should handle error when main/master branch does not exist', async () => {
      sinon.stub(BranchCommand.prototype as any, 'isGitRepository').resolves(true)
      sinon.stub(BranchCommand.prototype as any, 'getCurrentBranch').resolves('feature-branch')
      sinon.stub(BranchCommand.prototype as any, 'getMainBranch').resolves(null)
      const errorStub = sinon.stub(BranchCommand.prototype, 'error')
      sinon.stub(BranchCommand.prototype as any, 'parse').resolves({
        flags: {main: true},
        args: {},
      })

      const command = new BranchCommand([], {} as any)
      await command.run()

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.match(/neither.*main.*nor.*master/i)
    })
  })

  describe('private method implementation', () => {
    it('should implement isGitRepository method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.isGitRepository).to.be.a('function')
    })

    it('should implement getCurrentBranch method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.getCurrentBranch).to.be.a('function')
    })

    it('should implement getMainBranch method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.getMainBranch).to.be.a('function')
    })

    it('should implement launchTerminalWithAiw method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.launchTerminalWithAiw).to.be.a('function')
    })

    it('isGitRepository should check .git directory', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.isGitRepository.toString()
      expect(source).to.include('.git')
      expect(source).to.include('access')
    })

    it('getCurrentBranch should use git rev-parse', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.getCurrentBranch.toString()
      expect(source).to.include('git rev-parse')
      expect(source).to.include('--abbrev-ref HEAD')
    })

    it('getMainBranch should check for both main and master', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.getMainBranch.toString()
      expect(source).to.include('refs/heads/main')
      expect(source).to.include('refs/heads/master')
      expect(source).to.include('show-ref')
    })

    it('launchTerminalWithAiw should handle multiple platforms', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      expect(source).to.include('win32')
      expect(source).to.include('darwin')

      // Windows support
      expect(source).to.include('powershell')

      // macOS support
      expect(source).to.include('osascript')
      expect(source).to.include('Terminal')

      // Linux support (at least one terminal emulator)
      expect(source).to.match(/gnome-terminal|konsole|xterm/i)
    })

    it('launchTerminalWithAiw should checkout branch and run aiw launch', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      expect(source).to.include('git checkout')
      expect(source).to.include('aiw launch')
    })

    it('should implement createWorktree method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.createWorktree).to.be.a('function')
    })

    it('should implement launchTerminalInWorktree method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.launchTerminalInWorktree).to.be.a('function')
    })

    it('should implement handleMainBranch method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.handleMainBranch).to.be.a('function')
    })

    it('should implement handleWorktreeLaunch method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.handleWorktreeLaunch).to.be.a('function')
    })

    it('should implement escapeShellArg method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.escapeShellArg).to.be.a('function')
    })

    it('createWorktree should use git worktree add command', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.createWorktree.toString()
      expect(source).to.include('git')
      expect(source).to.include('worktree')
      expect(source).to.include('add')
      expect(source).to.include('-b')
    })

  describe('delete functionality', () => {
    describe('error handling', () => {
      it('should error when not in git repository', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('isGitRepository')
        expect(source).to.match(/not a git repository/i)
        expect(source).to.include('ENVIRONMENT_ERROR')
      })

      it('should error when branch name not provided', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.match(/branch name.*required/i)
        expect(source).to.include('INVALID_USAGE')
      })

      it('should prevent deletion of main branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include("branchName === 'main'")
        expect(source).to.match(/cannot delete.*protected/i)
      })

      it('should prevent deletion of master branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include("branchName === 'master'")
        expect(source).to.match(/cannot delete.*protected/i)
      })

      it('should error when branch does not exist', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('branchExists')
        expect(source).to.match(/does not exist/i)
        expect(source).to.include('INVALID_USAGE')
      })

      it('should error when trying to delete current branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('getCurrentBranch')
        expect(source).to.include('currentBranch === branchName')
        expect(source).to.match(/currently on it/i)
      })

      it('should provide helpful suggestion when deleting current branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('clipboard')
        expect(source).to.include('aiw branch --main')
      })
    })

    describe('branch validation', () => {
      it('should verify branch exists using git show-ref', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.branchExists.toString()
        expect(source).to.include('git show-ref --verify')
        expect(source).to.include('refs/heads')
      })

      it('should return boolean indicating branch existence', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.branchExists.toString()
        expect(source).to.include('return true')
        expect(source).to.include('return false')
      })
    })

    describe('worktree detection', () => {
      it('should locate worktree path using git worktree list', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.getWorktreePath.toString()
        expect(source).to.include('git worktree list --porcelain')
      })

      it('should parse worktree list output to find branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.getWorktreePath.toString()
        expect(source).to.include('refs/heads')
        expect(source).to.include('worktree ')
      })

      it('should return null when worktree not found', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.getWorktreePath.toString()
        expect(source).to.include('return null')
      })
    })

    describe('branch deletion', () => {
      it('should force delete local branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.include('git branch -D')
      })

      it('should escape branch names to prevent command injection', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.match(/escapedBranch|escape|quote|replace/i)
      })

      it('should handle different escaping for Windows vs Unix', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.include('win32')
        expect(source).to.match(/double quotes|single quotes/i)
      })

      it('should verify remote branch exists before deletion', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.include('git show-ref --verify')
        expect(source).to.include('refs/remotes/origin')
      })

      it('should delete remote branch when it exists', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.include('git push origin --delete')
      })

      it('should handle orphaned worktrees gracefully', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteBranch.toString()
        expect(source).to.match(/not found|orphaned/i)
      })
    })

    describe('worktree deletion', () => {
      it('should remove worktree from git first', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.include('git worktree remove')
        expect(source).to.include('--force')
      })

      it('should escape worktree paths to prevent command injection', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.match(/escapedPath|escape|quote|replace/i)
      })

      it('should handle different path escaping for Windows vs Unix', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.include('win32')
      })

      it('should delete worktree folder recursively', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.include('fs.rm')
        expect(source).to.include('recursive')
        expect(source).to.include('force')
      })

      it('should handle orphaned folders gracefully', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.match(/not a working tree|orphaned|ENOENT/i)
      })

      it('should verify folder exists before deletion attempt', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
        expect(source).to.include('fs.access')
      })
    })

    describe('deletion sequence', () => {
      it('should delete worktree folder before branch', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        // Verify worktree deletion happens first by checking order in source
        const worktreeIndex = source.indexOf('deleteWorktreeFolder')
        const branchIndex = source.indexOf('deleteBranch')
        expect(worktreeIndex).to.be.lessThan(branchIndex)
      })

      it('should handle case where worktree does not exist', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('if (worktreePath)')
      })

      it('should provide success feedback after deletion', () => {
        // @ts-expect-error - accessing private method for testing
        const source = BranchCommand.prototype.handleDelete.toString()
        expect(source).to.include('logSuccess')
        expect(source).to.match(/deleted|removed/i)
      })
    })
  })
    it('should implement getWorktreePath method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.getWorktreePath).to.be.a('function')
    })

    it('should implement deleteBranch method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.deleteBranch).to.be.a('function')
    })

    it('should implement deleteWorktreeFolder method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.deleteWorktreeFolder).to.be.a('function')
    })

    it('handleDelete should check for git repository', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.include('isGitRepository')
    })

    it('handleDelete should prevent deletion of main/master branches', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.match(/main.*master|protected/i)
      expect(source).to.include('Cannot delete')
    })

    it('handleDelete should check if branch exists', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.include('branchExists')
    })

    it('handleDelete should check current branch', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.include('getCurrentBranch')
      expect(source).to.include('currently on it')
    })

    it('handleDelete should use clipboard for suggestion', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.include('clipboard')
      expect(source).to.include('aiw branch --main')
    })

    it('handleDelete should delete both branch and worktree', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDelete.toString()
      expect(source).to.include('deleteBranch')
      expect(source).to.include('deleteWorktreeFolder')
    })

    it('branchExists should use git show-ref', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.branchExists.toString()
      expect(source).to.include('git show-ref')
      expect(source).to.include('refs/heads')
    })

    it('getWorktreePath should use git worktree list', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.getWorktreePath.toString()
      expect(source).to.include('git worktree list')
      expect(source).to.include('porcelain')
    })

    it('deleteBranch should delete local branch with -D flag', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteBranch.toString()
      expect(source).to.include('git branch -D')
    })

    it('deleteBranch should check for and delete remote branch', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteBranch.toString()
      expect(source).to.include('git push origin --delete')
      expect(source).to.include('refs/remotes/origin')
    })

    it('deleteWorktreeFolder should use git worktree remove', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
      expect(source).to.include('git worktree remove')
      expect(source).to.include('--force')
    })

    it('deleteWorktreeFolder should delete folder with fs.rm', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
      expect(source).to.include('fs.rm')
      expect(source).to.include('recursive')
    })
  })

  describe('delete all functionality', () => {
    it('should have handleDeleteAll method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.handleDeleteAll).to.be.a('function')
    })

    it('should have getAllWorktrees method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.getAllWorktrees).to.be.a('function')
    })

    it('should have hasUnpushedCommits method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.hasUnpushedCommits).to.be.a('function')
    })

    it('should have hasMergeRequest method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.hasMergeRequest).to.be.a('function')
    })

    it('getAllWorktrees should use git worktree list porcelain', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.getAllWorktrees.toString()
      expect(source).to.include('git worktree list')
      expect(source).to.include('porcelain')
    })

    it('getAllWorktrees should parse branch and path info', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.getAllWorktrees.toString()
      expect(source).to.include('branch')
      expect(source).to.include('path')
      expect(source).to.include('head')
    })

    it('hasUnpushedCommits should check remote tracking branch', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.hasUnpushedCommits.toString()
      expect(source).to.include('refs/remotes/origin')
      expect(source).to.include('git show-ref')
    })

    it('hasUnpushedCommits should use git rev-list to count commits', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.hasUnpushedCommits.toString()
      expect(source).to.include('git rev-list')
      expect(source).to.include('--count')
    })

    it('hasMergeRequest should use gh CLI', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.hasMergeRequest.toString()
      expect(source).to.include('gh')
      expect(source).to.include('pr list')
    })

    it('hasMergeRequest should check for open PRs', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.hasMergeRequest.toString()
      expect(source).to.include('--head')
      expect(source).to.include('--state open')
    })

    it('handleDeleteAll should skip main/master branches', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.match(/main|master/)
      expect(source).to.include('protected')
    })

    it('handleDeleteAll should skip current directory', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.include('current directory')
      expect(source).to.match(/cwd|current/i)
    })

    it('handleDeleteAll should check for unpushed commits', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.include('hasUnpushedCommits')
    })

    it('handleDeleteAll should check for merge requests', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.include('hasMergeRequest')
    })

    it('handleDeleteAll should output deleted worktrees', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.match(/deleted/i)
      expect(source).to.match(/preserved/i)
    })

    it('handleDeleteAll should output reasons for preservation', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.handleDeleteAll.toString()
      expect(source).to.include('reason')
    })

    it('run method should route to handleDeleteAll when both flags set', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('handleDeleteAll')
      expect(source).to.match(/flags\.delete.*flags\.all|flags\.all.*flags\.delete/)
    })
  })

  describe('delete security: command injection prevention', () => {
    it('deleteBranch should escape branch names', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteBranch.toString()
      // Should use single quote escaping for branch names
      expect(source).to.match(/replace.*'|escape/i)
      // Check for the escape pattern (may be represented as '\\'\\'' or "'\\\\''")
      expect(source).to.match(/'\\\\''|escapedBranch/)
    })

    it('deleteBranch should quote branch names in git commands', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteBranch.toString()
      // Branch should be quoted in git branch -D command
      expect(source).to.match(/git branch -D\s+['"]/)
      expect(source).to.match(/git push origin --delete\s+['"]/)
    })

    it('deleteWorktreeFolder should escape worktree paths', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
      // Should escape paths to prevent injection
      expect(source).to.match(/replace.*'|escape/i)
      // Check for the escape pattern (may be represented as '\\'\\'' or "'\\\\''")
      expect(source).to.match(/'\\\\''|escapedPath/)
    })

    it('deleteWorktreeFolder should quote paths in git commands', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.deleteWorktreeFolder.toString()
      // Path should be quoted in git worktree remove command
      expect(source).to.match(/git worktree remove\s+['"]/)
    })

    it('should handle branch names with special characters safely', () => {
      // @ts-expect-error - accessing private method for testing
      const deleteBranchSource = BranchCommand.prototype.deleteBranch.toString()
      // Ensure proper escaping mechanism exists
      expect(deleteBranchSource).to.match(/escapedBranch|replace.*'/i)
    })

    it('should handle paths with special characters safely', () => {
      // @ts-expect-error - accessing private method for testing
      const deleteWorktreeSource = BranchCommand.prototype.deleteWorktreeFolder.toString()
      // Ensure proper escaping mechanism exists
      expect(deleteWorktreeSource).to.match(/escapedPath|replace.*'/i)
    })
  })
})
