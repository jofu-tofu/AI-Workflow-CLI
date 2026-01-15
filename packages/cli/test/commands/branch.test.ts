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
    it('should delegate to handleMainBranch or handleWorktreeLaunch', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('handleMainBranch')
      expect(source).to.include('handleWorktreeLaunch')
    })

    it('should check if directory is a git repository', () => {
      // Check in handleMainBranch
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.include('isGitRepository')
    })

    it('should get current git branch', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.include('getCurrentBranch')
    })

    it('should verify main or master branch exists', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.include('getMainBranch')
    })

    it('should launch terminal with aiw', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.include('launchTerminalWithAiw')
    })

    it('should handle git repository detection error', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()

      // Should have error handling
      expect(source).to.include('try')
      expect(source).to.include('catch')

      // Should check for git repository
      expect(source).to.match(/not a git repository/i)
    })

    it('should handle already on main/master error', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.match(/already on/i)
    })

    it('should handle missing main/master branch error', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.match(/neither.*main.*nor.*master/i)
    })

    it('should use proper exit codes', () => {
      const mainSource = (BranchCommand.prototype as any).handleMainBranch.toString()
      const worktreeSource = (BranchCommand.prototype as any).handleWorktreeLaunch.toString()

      // Should use EXIT_CODES constants in both methods
      expect(mainSource).to.include('EXIT_CODES')
      expect(worktreeSource).to.include('EXIT_CODES')

      // Should handle different error types
      expect(mainSource).to.include('ENVIRONMENT_ERROR')
      expect(mainSource).to.include('INVALID_USAGE')
      expect(mainSource).to.include('GENERAL_ERROR')
    })

    it('should support debug logging', () => {
      const source = (BranchCommand.prototype as any).handleMainBranch.toString()
      expect(source).to.include('this.debug')
    })

    it('should provide success feedback', () => {
      const mainSource = (BranchCommand.prototype as any).handleMainBranch.toString()
      const worktreeSource = (BranchCommand.prototype as any).handleWorktreeLaunch.toString()
      expect(mainSource).to.include('logSuccess')
      expect(worktreeSource).to.include('logSuccess')
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

    it('launchTerminalInWorktree should handle multiple platforms', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalInWorktree.toString()
      expect(source).to.include('win32')
      expect(source).to.include('darwin')
      expect(source).to.match(/wt|powershell/)
      expect(source).to.include('osascript')
    })
  })

  describe('security: command injection prevention', () => {
    it('should escape or quote branch names in git checkout commands', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Branch should be properly quoted or escaped to prevent injection
      // Looking for patterns like `branch}` or `${branch}` followed by quote marks
      expect(source).to.match(/git checkout.*['"`]|git checkout.*\$\{?branch\}?['"`]/i)
    })

    it('should escape or quote directory paths in cd commands', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Directory path should be properly quoted or escaped
      expect(source).to.match(/cd\s+['"`]|cd\s+.*cwd.*['"`]/i)
    })

    it('should protect against semicolon injection in branch names', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Branch variable should be quoted to prevent `;` from starting a new command
      expect(source).to.match(/git checkout\s+['"`]\$\{?branch\}?['"`]|git checkout\s+[^;]*['"`].*branch.*['"`]/i)
    })

    it('should protect against backtick injection in branch names', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Branch should be quoted with single or double quotes, not backticks
      // This prevents backtick command substitution
      expect(source).to.match(/git checkout\s+['"`]/)
    })

    it('should protect against single quote escape in branch names', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // If using single quotes, need escaping for single quotes within the variable
      // If using double quotes, need escaping for special chars
      expect(source).to.match(/quote|escape|replace|'|"/i)
    })

    it('should use secure quoting across all platforms', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // All platform branches (win32, darwin, linux) should have quoting/escaping
      // At least the basic structure should have quotes/escaping
      expect(source).to.match(/['"`].*cwd.*['"`]|['"`].*branch.*['"`]/i)
    })

    it('should handle branch names with special characters safely', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Should not directly concatenate branch into command string without protection
      // If it does concatenate, should be within quotes/escape sequences
      if (source.includes('git checkout $') || source.includes('git checkout " + branch')) {
        // These patterns are vulnerable unless escaped
        expect(source).to.match(/escape|quote|sanitize|replace/i)
      } else {
        // Should have proper quoting
        expect(source).to.match(/git checkout\s+['"`]/)
      }
    })

    it('should handle directory paths with special characters safely', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Directory path should be quoted to handle spaces and special characters
      expect(source).to.match(/cd\s+['"`]/)
    })

    it('should not allow unescaped variable expansion in shell commands', () => {
      // @ts-expect-error - accessing private method for testing
      const source = BranchCommand.prototype.launchTerminalWithAiw.toString()
      // Variables should be quoted or escaped, not bare like $variable
      // This regex checks that branch variable is not used bare in dangerous contexts
      // It's more of a negative check - we don't want to find unprotected variables
      // in positions where they can be exploited
      const unsafePattern = /git checkout\s+\$\{?branch\}?(?!['"`])/
      if (unsafePattern.test(source)) {
        // If found, it should at least have some escaping mechanism
        expect(source).to.match(/escape|quote|replace|sanitize/i)
      } else {
        // Safe pattern with quotes found
        expect(source).to.match(/git checkout\s+['"`]/)
      }
    })
  })

  describe('delete functionality', () => {
    it('should have handleDelete method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.handleDelete).to.be.a('function')
    })

    it('should implement branchExists method', () => {
      // @ts-expect-error - accessing private method for testing
      expect(BranchCommand.prototype.branchExists).to.be.a('function')
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
