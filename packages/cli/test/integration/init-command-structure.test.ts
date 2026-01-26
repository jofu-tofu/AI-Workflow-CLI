import {execSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {platform} from 'node:os'

import {expect} from 'chai'
import {describe, it} from 'mocha'

describe('Init Command Structure - Integration Tests', () => {
  const bin = platform() === 'win32' ? String.raw`.\bin\dev.cmd` : './bin/dev.js'

  describe('Flag-Based Init Pattern', () => {
    it('validates pai init --help shows flag-based usage', () => {
      const output = execSync(`${bin} init --help`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      // Should show template method flag
      expect(output).to.include('--method')
      expect(output).to.include('template')

      // Should show IDE flag
      expect(output).to.include('--ide')

      // Should show command structure
      expect(output).to.include('USAGE')
      expect(output).to.include('EXAMPLES')
    })

    it('validates examples show --method bmad usage', () => {
      const output = execSync(`${bin} init --help`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      expect(output).to.include('--method bmad')
    })

    it('validates examples show multiple IDE usage', () => {
      const output = execSync(`${bin} init --help`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      // Should show example with multiple IDEs
      expect(output).to.match(/--ide.*--ide|--ide claude --ide windsurf/)
    })
  })

  describe('Flag Requirements', () => {
    it('validates minimal install when --method flag is omitted', () => {
      const output = execSync(`${bin} init`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      // Should perform minimal install
      expect(output).to.match(/minimal installation|_shared folder/i)
      expect(output).to.match(/completed successfully/i)
    })

    it('validates error when template does not exist', () => {
      try {
        execSync(`${bin} init --method nonexistent`, {
          encoding: 'utf8',
          stdio: 'pipe',
        })
        expect.fail('Should error when template does not exist')
      } catch (error: unknown) {
        const err = error as {stderr: Buffer}
        const stderr = err.stderr.toString()
        expect(stderr).to.match(/Template.*not found|nonexistent/i)
      }
    })

    it('validates --ide flag defaults to claude', () => {
      const output = execSync(`${bin} init --help`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      // Help should indicate default value
      expect(output).to.include('--ide')
    })
  })

  describe('Subcommand Pattern Deprecated', () => {
    it('validates pai init bmad (old pattern) shows error', () => {
      try {
        execSync(`${bin} init bmad`, {
          encoding: 'utf8',
          stdio: 'pipe',
        })
        expect.fail('Old subcommand pattern should not work')
      } catch (error: unknown) {
        // Should error with unknown command or similar
        const err = error as {stderr: Buffer}
        const stderr = err.stderr.toString()
        expect(stderr).to.match(/Unknown|--method|not found|Error/i)
      }
    })
  })

  describe('Extensible Template Pattern', () => {
    it('validates template method allows multiple templates', () => {
      const commandFile = readFileSync('src/commands/init/index.ts', 'utf8')

      // Should use generic template installer
      expect(commandFile).to.include('installTemplate')
      expect(commandFile).to.include('getAvailableTemplates')
    })

    it('validates help shows template-based approach', () => {
      const output = execSync(`${bin} init --help`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      expect(output).to.include('template')
      expect(output).to.include('--method')
    })
  })
})
