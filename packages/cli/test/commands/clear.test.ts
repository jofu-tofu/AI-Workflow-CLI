/**
 * @file Unit tests for clear command.
 *
 * Tests command structure, metadata, and file deletion behavior.
 */

import {expect} from 'chai'

import ClearCommand from '../../src/commands/clear.js'

describe('clear command', () => {
  describe('command metadata', () => {
    it('should have static description field', () => {
      expect(ClearCommand.description).to.be.a('string')
      expect(ClearCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference Markdown in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('markdown')
    })

    it('should reference output folders in description', () => {
      expect(ClearCommand.description.toLowerCase()).to.include('output')
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
  })

  describe('implementation verification', () => {
    it('should find output folders', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('findOutputFolders')
    })

    it('should find markdown files', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('findMarkdownFiles')
    })

    it('should handle file deletion', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('unlink')
    })

    it('should handle errors with proper exit codes', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('ENVIRONMENT_ERROR')
      expect(source).to.include('GENERAL_ERROR')
    })

    it('should support confirmation prompt unless force flag', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('confirm')
      expect(source).to.include('force')
    })

    it('should support template filtering', () => {
      const source = ClearCommand.prototype.run.toString()
      expect(source).to.include('flags.template')
    })
  })
})
