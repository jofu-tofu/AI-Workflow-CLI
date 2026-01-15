import {expect} from 'chai'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import BranchCommand from '../../src/commands/branch.js'

describe('branch command', () => {
  describe('command structure', () => {
    it('should have correct description', () => {
      expect(BranchCommand.description).to.include('git worktree')
    })

    it('should have --clean flag defined', () => {
      const flags = BranchCommand.flags
      expect(flags).to.have.property('clean')
      expect(flags.clean.char).to.equal('c')
    })

    it('should have inherited base flags', () => {
      const flags = BranchCommand.flags
      expect(flags).to.have.property('debug')
      expect(flags).to.have.property('help')
      expect(flags).to.have.property('quiet')
    })

    it('should have examples', () => {
      expect(BranchCommand.examples).to.be.an('array')
      expect(BranchCommand.examples.length).to.be.greaterThan(0)
    })
  })

  describe('command file', () => {
    it('should exist in dist directory after build', () => {
      const distPath = join(process.cwd(), 'dist', 'commands', 'branch.js')
      expect(existsSync(distPath)).to.be.true
    })
  })

  // Note: Full integration tests would require:
  // - Setting up git repository with worktrees
  // - Testing actual branch deletion
  // - Testing directory detection
  // These are better suited for integration tests
  // that can set up temporary git environments
})
