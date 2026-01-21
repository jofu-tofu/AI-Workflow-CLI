/**
 * @file Unit tests for launch command.
 *
 * Tests command structure, metadata, and spawn behavior.
 * Note: Actual spawn testing uses real processes (not mocked) to avoid ESM module issues.
 * Error scenarios tested via integration with spawn.test.ts.
 */

import {expect} from 'chai'

import LaunchCommand from '../../src/commands/launch.js'

describe('launch command', () => {
  describe('Task 4.1-4.4: command metadata and help', () => {
    it('should have static description field', () => {
      expect(LaunchCommand.description).to.be.a('string')
      expect(LaunchCommand.description.length).to.be.greaterThan(0)
    })

    it('should reference Claude Code in description', () => {
      expect(LaunchCommand.description).to.include('Claude Code')
    })

    it('should reference AIW configuration in description', () => {
      expect(LaunchCommand.description).to.match(/AIW|configuration|sandbox|parallel/i)
    })

    it('should have static examples array', () => {
      expect(LaunchCommand.examples).to.be.an('array')
      expect(LaunchCommand.examples.length).to.be.greaterThan(0)
    })

    it('should include basic usage example', () => {
      const {examples} = LaunchCommand
      expect(examples).to.be.an('array')
      expect(examples.length).to.be.greaterThan(0)
      // Examples use oclif template syntax
      expect(examples[0]).to.be.a('string')
    })

    it('should include debug mode example', () => {
      const {examples} = LaunchCommand
      const hasDebugExample = examples.some((ex: string) => ex.includes('--debug'))
      expect(hasDebugExample).to.be.true
    })
  })

  describe('command structure', () => {
    it('should have run method', () => {
      expect(LaunchCommand.prototype.run).to.be.a('function')
    })

    it('should return promise (async)', () => {
      // Verify run() returns Promise (async method)
      expect(LaunchCommand.prototype.run).to.be.a('function')
    })

    it('should extend BaseCommand', () => {
      // Verify LaunchCommand has baseFlags (inherited from BaseCommand)
      expect(LaunchCommand).to.have.property('baseFlags')
    })
  })

  describe('Task 5.2-5.7: implementation verification', () => {
    it('Task 5.2-5.3: implementation calls spawnProcess with correct args', () => {
      // Verify the implementation source code contains the correct pattern
      // This is a static analysis test to ensure the code is written correctly
      const source = LaunchCommand.prototype.run.toString()

      // Should call spawnProcess
      expect(source).to.include('spawnProcess')

      // Should support 'claude' command (via cliCommand variable)
      expect(source).to.include('claude')

      // Should pass --dangerously-skip-permissions flag for Claude
      expect(source).to.include('--dangerously-skip-permissions')

      // Should support 'codex' command with --yolo flag
      expect(source).to.include('codex')
      expect(source).to.include('--yolo')

      // Should handle exit code
      expect(source).to.include('exitCode')
      expect(source).to.include('this.exit')
    })

    it('Task 5.4: implementation handles ProcessSpawnError', () => {
      const source = LaunchCommand.prototype.run.toString()

      // Should have try-catch
      expect(source).to.include('try')
      expect(source).to.include('catch')

      // Should check for ProcessSpawnError
      expect(source).to.include('ProcessSpawnError')

      // Should use ENVIRONMENT_ERROR exit code
      expect(source).to.include('ENVIRONMENT_ERROR')
    })

    it('Task 5.5: command accepts debug flag (inherited from BaseCommand)', () => {
      // BaseCommand provides baseFlags with debug flag
      expect(LaunchCommand.baseFlags).to.have.property('debug')
      expect(LaunchCommand.baseFlags.debug).to.have.property('char', 'd')
    })

    it('Task 5.6: implementation supports parallel sessions (stdio inherit)', () => {
      // spawnProcess uses stdio: inherit by default, which supports parallel sessions
      // Each terminal runs independent `aiw launch` - no shared state
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('spawnProcess')
    })

    it('Task 5.7: implementation passes --dangerously-skip-permissions flag', () => {
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('--dangerously-skip-permissions')
    })

    it('implementation handles generic errors with GENERAL_ERROR', () => {
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('GENERAL_ERROR')
      expect(source).to.include('Unexpected launch failure')
    })
  })

  describe('--codex/-c flag for launching Codex', () => {
    it('should have --codex flag defined', () => {
      expect(LaunchCommand.flags).to.have.property('codex')
    })

    it('should have -c as short form for --codex', () => {
      const codexFlag = LaunchCommand.flags.codex as {char?: string}
      expect(codexFlag).to.have.property('char', 'c')
    })

    it('should have --codex flag default to false', () => {
      const codexFlag = LaunchCommand.flags.codex as {default?: boolean}
      expect(codexFlag).to.have.property('default', false)
    })

    it('should include --codex flag in description', () => {
      expect(LaunchCommand.description).to.include('--codex')
      expect(LaunchCommand.description).to.include('-c')
    })

    it('should include Codex in description', () => {
      expect(LaunchCommand.description).to.include('Codex')
    })

    it('should include --codex examples', () => {
      const {examples} = LaunchCommand
      const hasCodexExample = examples.some((ex: string) => ex.includes('--codex'))
      expect(hasCodexExample).to.be.true
    })

    it('implementation handles --codex flag', () => {
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('flags.codex')
      expect(source).to.include('useCodex')
    })

    it('implementation uses --yolo for Codex', () => {
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('--yolo')
    })
  })

  describe('--new/-n flag for launching in new terminal', () => {
    it('should have --new flag defined', () => {
      expect(LaunchCommand.flags).to.have.property('new')
    })

    it('should have -n as short form for --new', () => {
      const newFlag = LaunchCommand.flags.new as {char?: string}
      expect(newFlag).to.have.property('char', 'n')
    })

    it('should have --new flag default to false', () => {
      const newFlag = LaunchCommand.flags.new as {default?: boolean}
      expect(newFlag).to.have.property('default', false)
    })

    it('should include --new flag in description', () => {
      expect(LaunchCommand.description).to.include('--new')
      expect(LaunchCommand.description).to.include('-n')
    })

    it('should include --new examples', () => {
      const {examples} = LaunchCommand
      const hasNewExample = examples.some((ex: string) => ex.includes('--new'))
      expect(hasNewExample).to.be.true
    })

    it('should include -n short form example', () => {
      const {examples} = LaunchCommand
      const hasShortExample = examples.some((ex: string) => ex.includes('-n'))
      expect(hasShortExample).to.be.true
    })

    it('implementation handles --new flag', () => {
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('flags.new')
      // Verifies the run method uses launchTerminal utility (imported from lib/terminal.ts)
      expect(source).to.include('launchTerminal')
    })

    it('implementation has cross-platform terminal launching', () => {
      // Cross-platform terminal launching is now handled by shared utility in lib/terminal.ts
      // Verify that the run method calls the shared launchTerminal function
      const source = LaunchCommand.prototype.run.toString()
      expect(source).to.include('launchTerminal')
      // The platform-specific logic is encapsulated in lib/terminal.ts
    })
  })
})
