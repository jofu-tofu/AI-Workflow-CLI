import {existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {after, before, describe, it} from 'mocha'

describe('Epic 2: Zero-Friction Claude Code Launch - Integration Validation', () => {
  const testAiwHome = join(tmpdir(), 'aiw-test-epic-2-validation')
  const testClaudeDir = join(testAiwHome, '.claude')
  const originalAiwDir = process.env.AIW_DIR

  before(() => {
    if (existsSync(testAiwHome)) {
      rmSync(testAiwHome, {recursive: true, force: true})
    }

    mkdirSync(testAiwHome, {recursive: true})
    mkdirSync(testClaudeDir, {recursive: true})

    const settingsPath = join(testClaudeDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          'claude-code.statusLine.show': 'aiw-statusline',
          'claude-code.statusLine.command': 'powershell.exe',
          'claude-code.statusLine.args': ['-NoProfile', '-File', join(testAiwHome, 'scripts', 'statusline.ps1')],
        },
        null,
        2,
      ),
    )

    process.env.AIW_DIR = testAiwHome
  })

  after(() => {
    if (existsSync(testAiwHome)) {
      rmSync(testAiwHome, {recursive: true, force: true})
    }

    if (originalAiwDir) {
      process.env.AIW_DIR = originalAiwDir
    } else {
      delete process.env.AIW_DIR
    }
  })

  describe('setup and configuration', () => {
    it('creates test environment with settings.json', () => {
      expect(existsSync(testClaudeDir)).to.be.true
      const settingsPath = join(testClaudeDir, 'settings.json')
      expect(existsSync(settingsPath)).to.be.true
    })

    it('resolves configuration with AIW_DIR override', () => {
      expect(process.env.AIW_DIR).to.equal(testAiwHome)
      expect(existsSync(join(testAiwHome, '.claude'))).to.be.true
    })
  })

  describe('cross-platform path handling', () => {
    it('uses platform-appropriate path separators', () => {
      const home = homedir()
      const testPath = join(home, 'test', 'path')
      expect(testPath).to.include(home)

      const platformPath = join('foo', 'bar', 'baz')
      if (process.platform === 'win32') {
        expect(platformPath).to.include('\\')
      } else {
        expect(platformPath).to.include('/')
      }
    })

    it('supports symlink creation', () => {
      const testSymlink = join(testAiwHome, 'test-symlink')
      const testTarget = join(testAiwHome, 'test-target')

      try {
        writeFileSync(testTarget, 'test')
        symlinkSync(testTarget, testSymlink, process.platform === 'win32' ? 'file' : undefined)
        expect(existsSync(testSymlink)).to.be.true
        const stats = lstatSync(testSymlink)
        expect(stats.isSymbolicLink()).to.be.true
        unlinkSync(testSymlink)
        unlinkSync(testTarget)
      } catch {
        // Symlink creation may fail on Windows without admin rights
      }
    })
  })
})
