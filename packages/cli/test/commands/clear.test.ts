/**
 * @file Unit tests for clear command.
 *
 * Tests command structure, metadata, and folder deletion behavior.
 */

import {expect} from 'chai'
import {beforeAll, describe, it} from 'vitest'

import ClearCommand from '../../src/commands/clear.js'

function getClassMethodNames(): Set<string> {
  const proto = ClearCommand.prototype as unknown as Record<string, unknown>
  return new Set(
    Object.getOwnPropertyNames(proto).filter((name) => typeof proto[name] === 'function'),
  )
}

describe('clear command', () => {
  describe('command metadata', () => {
    it('should have static description field', () => {
      expect(ClearCommand.description).to.be.a('string')
      expect(ClearCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference method runtime folders in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('runtime')
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

    it('should reference .codex in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('.codex')
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
    let methods: Set<string>

    beforeAll(() => {
      methods = getClassMethodNames()
    })

    it('should find output folders', () => {
      expect(methods.has('findOutputFolders')).to.equal(true)
    })

    it('should find method runtime folders', () => {
      expect(methods.has('findMethodRuntimeFolders')).to.equal(true)
    })

    it('should find IDE method folders', () => {
      expect(methods.has('findIdeMethodFolders')).to.equal(true)
    })

    it('should handle folder deletion', () => {
      expect(methods.has('executeFolderDeletion')).to.equal(true)
    })

    it('should update git exclude after clearing', () => {
      expect(methods.has('cleanupGitExclude')).to.equal(true)
    })

    it('should reconstruct IDE settings after clearing', () => {
      expect(methods.has('reconstructSettingsAfterRemoval')).to.equal(true)
    })

    it('should extract method names for settings update', () => {
      expect(methods.has('extractMethodNames')).to.equal(true)
    })

    it('should include cleanup/reporting helpers', () => {
      expect(methods.has('performPostDeleteCleanup')).to.equal(true)
      expect(methods.has('reportClearResults')).to.equal(true)
    })

    it('should support output cleanup mode', () => {
      expect(methods.has('cleanRuntimeOutput')).to.equal(true)
    })

    it('should support IDE folder deletion checks', () => {
      expect(methods.has('tryRemoveIdeFolder')).to.equal(true)
    })

    it('should expose pending-change display helper', () => {
      expect(methods.has('displayPendingChanges')).to.equal(true)
    })
  })
})
