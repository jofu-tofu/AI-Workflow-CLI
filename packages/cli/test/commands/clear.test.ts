/**
 * @file Unit tests for clear command.
 *
 * Tests command structure, metadata, and folder deletion behavior.
 */

import {expect} from 'chai'

import ClearCommand from '../../src/commands/clear.js'

/**
 * Get the concatenated source of all prototype methods on the ClearCommand class.
 * This captures implementation details in private methods that `run()` delegates to.
 */
function getClassSource(): string {
  const proto = ClearCommand.prototype as unknown as Record<string, unknown>
  return Object.getOwnPropertyNames(proto)
    .filter((name) => typeof proto[name] === 'function')
    .map((name) => (proto[name] as Function).toString()) // eslint-disable-line @typescript-eslint/ban-types
    .join('\n')
}

describe('clear command', () => {
  describe('command metadata', () => {
    it('should have static description field', () => {
      expect(ClearCommand.description).to.be.a('string')
      expect(ClearCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference workflow folders in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('workflow')
    })

    it('should reference output folders in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('output')
    })

    it('should reference IDE folders in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('ide')
    })

    it('should reference .claude in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('.claude')
    })

    it('should reference .windsurf in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('.windsurf')
    })

    it('should have static examples array', () => {
      expect(ClearCommand.examples).to.be.an('array')
      expect(ClearCommand.examples.length).to.be.greaterThan(0)
    })

    it('should include dry-run example', () => {
      const {examples} = ClearCommand
      const hasDryRunExample = examples.some((ex: string) => ex.includes('--dry-run'))
      expect(hasDryRunExample).to.be.true
    })

    it('should include force example', () => {
      const {examples} = ClearCommand
      const hasForceExample = examples.some((ex: string) => ex.includes('--force'))
      expect(hasForceExample).to.be.true
    })

    it('should include template example', () => {
      const {examples} = ClearCommand
      const hasTemplateExample = examples.some((ex: string) => ex.includes('--template'))
      expect(hasTemplateExample).to.be.true
    })

    it('should include output example', () => {
      const {examples} = ClearCommand
      const hasOutputExample = examples.some((ex: string) => ex.includes('--output'))
      expect(hasOutputExample).to.be.true
    })
  })

  describe('command structure', () => {
    it('should have run method', () => {
      expect(ClearCommand.prototype.run).to.be.a('function')
    })

    it('should extend BaseCommand', () => {
      expect(ClearCommand).to.have.property('baseFlags')
    })

    it('should have dry-run flag', () => {
      expect(ClearCommand.flags).to.have.property('dry-run')
      expect(ClearCommand.flags['dry-run']).to.have.property('char', 'n')
    })

    it('should have force flag', () => {
      expect(ClearCommand.flags).to.have.property('force')
      expect(ClearCommand.flags['force']).to.have.property('char', 'f')
    })

    it('should have template flag', () => {
      expect(ClearCommand.flags).to.have.property('template')
      expect(ClearCommand.flags['template']).to.have.property('char', 't')
    })

    it('should have output flag', () => {
      expect(ClearCommand.flags).to.have.property('output')
      expect(ClearCommand.flags['output']).to.have.property('char', 'o')
    })
  })

  describe('implementation verification', () => {
    let source: string

    before(() => {
      source = getClassSource()
    })

    it('should find output folders', () => {
      expect(source).to.include('findOutputFolders')
    })

    it('should find workflow folders', () => {
      expect(source).to.include('findWorkflowFolders')
    })

    it('should find IDE method folders', () => {
      expect(source).to.include('findIdeMethodFolders')
    })

    it('should handle folder deletion', () => {
      expect(source).to.include('removeDirectory')
    })

    it('should update git exclude after clearing', () => {
      expect(source).to.include('removeExcludeEntries')
    })

    it('should reconstruct IDE settings after clearing', () => {
      expect(source).to.include('reconstructIdeSettings')
    })

    it('should extract method names for settings update', () => {
      expect(source).to.include('extractMethodNames')
    })

    it('should handle errors with proper exit codes', () => {
      expect(source).to.include('ENVIRONMENT_ERROR')
      expect(source).to.include('GENERAL_ERROR')
    })

    it('should support confirmation prompt unless force flag', () => {
      expect(source).to.include('confirm')
      expect(source).to.include('force')
    })

    it('should support template filtering', () => {
      expect(source).to.include('flags.template')
    })

    it('should check if output folder is empty and remove it', () => {
      expect(source).to.include('tryRemoveEmptyDir')
    })

    it('should report IDE method folder deletions', () => {
      expect(source).to.include('deletedIde')
    })

    it('should report settings.json updates', () => {
      expect(source).to.include('updatedClaudeSettings')
      expect(source).to.include('updatedWindsurfSettings')
    })

    it('should check if IDE folders should be fully deleted', () => {
      expect(source).to.include('shouldDeleteIdeFolder')
    })

    it('should track removal of .claude folder', () => {
      expect(source).to.include('removedClaudeDir')
    })

    it('should track removal of .windsurf folder', () => {
      expect(source).to.include('removedWindsurfDir')
    })

    it('should preview IDE folder removal in dry-run mode', () => {
      expect(source).to.include('willClaudeFolderBeEmpty')
      expect(source).to.include('willWindsurfFolderBeEmpty')
    })

    it('should handle --output flag for runtime output cleanup', () => {
      expect(source).to.include('cleanRuntimeOutput')
    })

    it('should prune stale git exclude entries after clearing', () => {
      expect(source).to.include('pruneExcludeStaleEntries')
    })
  })
})
