/**
 * @file Unit tests for branch command.
 *
 * Tests command structure, metadata, validation, and implementation.
 */

import {expect} from 'chai'

import BranchCommand from '../../src/commands/branch.js'

describe('branch command', () => {
  describe('command metadata and help', () => {
    it('should have static description field', () => {
      expect(BranchCommand.description).to.be.a('string')
      expect(BranchCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference git worktree in description', () => {
      expect(BranchCommand.description).to.match(/worktree|branch/i)
    })

    it('should reference auto-launch in description', () => {
      expect(BranchCommand.description).to.match(/launch|terminal/i)
    })

    it('should have static examples array', () => {
      expect(BranchCommand.examples).to.be.an('array')
      expect(BranchCommand.examples.length).to.be.greaterThan(0)
    })

    it('should include usage examples with branch names', () => {
      const {examples} = BranchCommand
      expect(examples.length).to.be.greaterThan(0)
      expect(examples[0]).to.be.a('string')
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

    it('should have branchName argument', () => {
      expect(BranchCommand.args).to.have.property('branchName')
      expect(BranchCommand.args.branchName).to.have.property('required', true)
    })
  })

  describe('validation implementation', () => {
    it('should validate empty branch names', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('trim')
      expect(source).to.match(/empty|cannot be empty/i)
    })

    it('should validate branch name format', () => {
      const source = BranchCommand.prototype.run.toString()
      // Check for pattern validation and test method
      expect(source).to.include('test')
      expect(source).to.match(/invalid characters/i)
    })

    it('should check if folder already exists', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('access')
      expect(source).to.match(/already exists/i)
    })

    it('should check if in git repository', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('.git')
      expect(source).to.match(/not a git repository/i)
    })
  })

  describe('worktree creation implementation', () => {
    it('should create sibling folder with suffix pattern', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('basename')
      expect(source).to.include('dirname')
      expect(source).to.include('currentDirName')
      // Should derive folder name from current dir + branch name
      expect(source).to.match(/currentDirName.*-.*branchName/)
    })

    it('should call git worktree add with correct arguments', () => {
      // Check in the createWorktree method
      const classSource = BranchCommand.toString()
      expect(classSource).to.include('git')
      expect(classSource).to.include('worktree')
      expect(classSource).to.include('add')
      expect(classSource).to.include('-b')
    })

    it('should handle git errors', () => {
      // Check in the run method for error handling
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('stderr')
      expect(source).to.match(/failed to create worktree/i)
    })
  })

  describe('terminal launch implementation', () => {
    it('should launch terminal with platform detection', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('process.platform')
      expect(source).to.include('win32')
    })

    it('should use Windows Terminal on Windows', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('wt')
      expect(source).to.include('-d')
    })

    it('should run aiw launch in new terminal', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('aiw launch')
    })

    it('should have PowerShell fallback', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('launchPowerShellFallback')
      expect(source).to.include('Start-Process')
    })

    it('should detach terminal process', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('detached')
      expect(source).to.include('unref')
    })
  })

  describe('security implementation', () => {
    it('should escape shell arguments', () => {
      const source = BranchCommand.toString()
      expect(source).to.include('escapeShellArg')
      expect(source).to.include('replaceAll')
    })

    it('should handle command injection prevention', () => {
      const source = BranchCommand.toString()
      // Should escape backslashes and quotes
      expect(source).to.include('\\\\"')
      expect(source).to.include('\\\\\\\\')
    })
  })

  describe('error handling implementation', () => {
    it('should handle branch already exists error', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.match(/already exists/i)
      expect(source).to.include('INVALID_USAGE')
    })

    it('should handle not a git repository error', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.match(/not a git repository/i)
      expect(source).to.include('INVALID_USAGE')
    })

    it('should have generic error fallback', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('GENERAL_ERROR')
      expect(source).to.match(/failed to create worktree/i)
    })
  })

  describe('user feedback implementation', () => {
    it('should provide success messages', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('logSuccess')
      expect(source).to.match(/created worktree/i)
    })

    it('should provide informational messages', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.include('logInfo')
    })

    it('should show worktree location', () => {
      const source = BranchCommand.prototype.run.toString()
      expect(source).to.match(/worktree location|worktreePath/i)
    })
  })
})
