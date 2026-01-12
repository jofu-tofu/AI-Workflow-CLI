import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {expect} from 'chai'

import {getPaiHome} from '../../src/lib/config.js'

/**
 * Integration tests for statusLine configuration
 *
 * These tests verify that:
 * 1. statusline.ps1 script exists
 * 2. settings.json contains proper statusLine configuration
 * 3. Configuration uses correct environment variable references
 */
describe('statusLine configuration', () => {
  describe('statusline.ps1 script', () => {
    it('should exist in AIW_DIR/scripts directory', async () => {
      const aiwDir = getPaiHome()
      const scriptPath = join(aiwDir, 'scripts', 'statusline.ps1')

      // Verify script exists
      const scriptContent = await readFile(scriptPath, 'utf8')
      expect(scriptContent).to.be.a('string')
      expect(scriptContent.length).to.be.greaterThan(0)
    })

    it('should contain model name extraction logic', async () => {
      const aiwDir = getPaiHome()
      const scriptPath = join(aiwDir, 'scripts', 'statusline.ps1')
      const scriptContent = await readFile(scriptPath, 'utf8')

      // Check for model name regex patterns
      expect(scriptContent).to.include('opus-4')
      expect(scriptContent).to.include('sonnet-4')
      expect(scriptContent).to.include('haiku')
    })

    it('should calculate token usage with cache tokens', async () => {
      const aiwDir = getPaiHome()
      const scriptPath = join(aiwDir, 'scripts', 'statusline.ps1')
      const scriptContent = await readFile(scriptPath, 'utf8')

      // Check for cache token inclusion
      expect(scriptContent).to.include('cache_creation_input_tokens')
      expect(scriptContent).to.include('cache_read_input_tokens')
    })

    it('should use Floor() for percentage calculation', async () => {
      const aiwDir = getPaiHome()
      const scriptPath = join(aiwDir, 'scripts', 'statusline.ps1')
      const scriptContent = await readFile(scriptPath, 'utf8')

      // Check for Floor method
      expect(scriptContent).to.include('[math]::Floor')
    })

    it('should have error handling for JSON parsing', async () => {
      const aiwDir = getPaiHome()
      const scriptPath = join(aiwDir, 'scripts', 'statusline.ps1')
      const scriptContent = await readFile(scriptPath, 'utf8')

      // Check for try-catch block
      expect(scriptContent).to.include('try')
      expect(scriptContent).to.include('catch')
    })
  })

  describe('settings.json configuration', () => {
    it('should exist in AIW_DIR/.claude directory', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')

      // Verify settings file exists
      const settingsContent = await readFile(settingsPath, 'utf8')
      expect(settingsContent).to.be.a('string')
      expect(settingsContent.length).to.be.greaterThan(0)
    })

    it('should contain statusLine configuration', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')
      const settingsContent = await readFile(settingsPath, 'utf8')
      const settings = JSON.parse(settingsContent)

      // Verify statusLine exists
      expect(settings).to.have.property('statusLine')
      expect(settings.statusLine).to.be.an('object')
    })

    it('should have statusLine type set to "command"', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')
      const settingsContent = await readFile(settingsPath, 'utf8')
      const settings = JSON.parse(settingsContent)

      expect(settings.statusLine).to.have.property('type', 'command')
    })

    it('should reference statusline.ps1 script via $env:AIW_DIR', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')
      const settingsContent = await readFile(settingsPath, 'utf8')
      const settings = JSON.parse(settingsContent)

      const {command} = settings.statusLine
      expect(command).to.be.a('string')
      expect(command).to.include('$env:AIW_DIR')
      expect(command).to.include('statusline.ps1')
    })

    it('should use PowerShell -NoProfile flag', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')
      const settingsContent = await readFile(settingsPath, 'utf8')
      const settings = JSON.parse(settingsContent)

      const {command} = settings.statusLine
      expect(command).to.include('powershell')
      expect(command).to.include('-NoProfile')
    })

    it('should properly escape JSON special characters', async () => {
      const aiwDir = getPaiHome()
      const settingsPath = join(aiwDir, '.claude', 'settings.json')
      const settingsContent = await readFile(settingsPath, 'utf8')
      const settings = JSON.parse(settingsContent)

      // Verify JSON is valid (parsing succeeded)
      expect(settings).to.be.an('object')

      // Verify command contains backslashes (properly parsed from JSON)
      const {command} = settings.statusLine
      expect(command).to.include('\\') // Should contain backslashes after JSON parsing
    })
  })

  describe('documentation', () => {
    it('should have STATUS_LINE_README.md in .claude directory', async () => {
      const aiwDir = getPaiHome()
      const readmePath = join(aiwDir, '.claude', 'STATUS_LINE_README.md')

      // Verify README exists
      const readmeContent = await readFile(readmePath, 'utf8')
      expect(readmeContent).to.be.a('string')
      expect(readmeContent.length).to.be.greaterThan(0)
    })

    it('should document input data format', async () => {
      const aiwDir = getPaiHome()
      const readmePath = join(aiwDir, '.claude', 'STATUS_LINE_README.md')
      const readmeContent = await readFile(readmePath, 'utf8')

      expect(readmeContent).to.include('Input Data')
      expect(readmeContent).to.include('context_window')
      expect(readmeContent).to.include('model')
    })

    it('should document output format', async () => {
      const aiwDir = getPaiHome()
      const readmePath = join(aiwDir, '.claude', 'STATUS_LINE_README.md')
      const readmeContent = await readFile(readmePath, 'utf8')

      expect(readmeContent).to.include('Output Format')
      expect(readmeContent).to.include('[')
      expect(readmeContent).to.include('tokens')
      expect(readmeContent).to.include('%')
    })

    it('should include troubleshooting steps', async () => {
      const aiwDir = getPaiHome()
      const readmePath = join(aiwDir, '.claude', 'STATUS_LINE_README.md')
      const readmeContent = await readFile(readmePath, 'utf8')

      expect(readmeContent).to.include('Troubleshooting')
      expect(readmeContent).to.include('$env:AIW_DIR')
    })
  })
})
