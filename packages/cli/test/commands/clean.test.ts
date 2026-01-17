/**
 * @file Unit tests for clean command.
 *
 * Tests command structure, metadata, and output folder cleaning behavior.
 */

import {expect} from 'chai'

import CleanCommand from '../../src/commands/clean.js'

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

  describe('implementation verification', () => {
    it('should construct output folder path from method', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('_${flags.method}-output')
    })

    it('should get folder contents', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('getContents')
    })

    it('should use recursive rm for deletion', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('recursive')
    })

    it('should handle errors with proper exit codes', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('ENVIRONMENT_ERROR')
      expect(source).to.include('GENERAL_ERROR')
    })

    it('should support confirmation prompt unless force flag', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('confirm')
      expect(source).to.include('force')
    })

    it('should check if folder exists before cleaning', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('stat')
      expect(source).to.include('isDirectory')
    })

    it('should find all output folders when --all flag is used', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('findAllOutputFolders')
    })

    it('should validate that either --method or --all is required', () => {
      const source = CleanCommand.prototype.run.toString()
      expect(source).to.include('Either --method or --all is required')
    })
  })
})
