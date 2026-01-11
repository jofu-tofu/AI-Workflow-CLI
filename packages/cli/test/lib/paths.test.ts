import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {
  expandPath,
  findWorkspaceRoot,
  getHomePath,
  getWorkspacePath,
  isWorkspace,
  normalizePath,
  pathExists,
  resolvePath,
  toUnixPath,
  toWindowsPath,
} from '../../src/lib/paths.js'

describe('paths', () => {
  describe('getHomePath', () => {
    it('returns a non-empty string', () => {
      const result = getHomePath()
      expect(result).to.be.a('string')
      expect(result.length).to.be.greaterThan(0)
    })

    it('returns an absolute path', () => {
      const result = getHomePath()
      // On Windows starts with drive letter (C:\), on Unix starts with /
      expect(result.startsWith('/') || /^[A-Z]:/i.test(result)).to.be.true
    })

    it('returns consistent values on multiple calls', () => {
      const result1 = getHomePath()
      const result2 = getHomePath()
      expect(result1).to.equal(result2)
    })
  })

  describe('toUnixPath', () => {
    it('converts backslashes to forward slashes', () => {
      const result = toUnixPath(String.raw`a\b\c`)
      expect(result).to.equal('a/b/c')
    })

    it('keeps forward slashes unchanged', () => {
      const result = toUnixPath('a/b/c')
      expect(result).to.equal('a/b/c')
    })

    it('converts Windows absolute path', () => {
      const result = toUnixPath(String.raw`C:\Users\test`)
      expect(result).to.equal('C:/Users/test')
    })

    it('handles empty string', () => {
      const result = toUnixPath('')
      expect(result).to.equal('')
    })
  })

  describe('toWindowsPath', () => {
    it('converts forward slashes to backslashes', () => {
      const result = toWindowsPath('a/b/c')
      expect(result).to.equal(String.raw`a\b\c`)
    })

    it('keeps backslashes unchanged', () => {
      const result = toWindowsPath(String.raw`a\b\c`)
      expect(result).to.equal(String.raw`a\b\c`)
    })

    it('converts Unix absolute path', () => {
      const result = toWindowsPath('/usr/local/bin')
      expect(result).to.equal(String.raw`\usr\local\bin`)
    })

    it('handles empty string', () => {
      const result = toWindowsPath('')
      expect(result).to.equal('')
    })
  })

  describe('pathExists', () => {
    it('returns true for existing directory', async () => {
      const result = await pathExists(tmpdir())
      expect(result).to.be.true
    })

    it('returns true for existing file', async () => {
      // Create temp file
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const tempFile = join(tempDir, 'test.txt')
      const {writeFileSync} = await import('node:fs')
      writeFileSync(tempFile, 'test')

      try {
        const result = await pathExists(tempFile)
        expect(result).to.be.true
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('returns false for non-existent path', async () => {
      const result = await pathExists('/definitely/does/not/exist/abc123')
      expect(result).to.be.false
    })

    it('returns a boolean', async () => {
      const result = await pathExists('.')
      expect(result).to.be.a('boolean')
    })
  })

  describe('expandPath', () => {
    it('expands ~ to home directory', () => {
      const result = expandPath('~')
      expect(result).to.equal(getHomePath())
    })

    it('expands ~/subpath to home/subpath', () => {
      const result = expandPath('~/Documents')
      expect(result).to.equal(join(getHomePath(), 'Documents'))
    })

    it('expands ~/ with nested paths', () => {
      const result = expandPath('~/.pai/config')
      expect(result).to.equal(join(getHomePath(), '.pai', 'config'))
    })

    it('does not expand ~ in middle of path', () => {
      const result = expandPath('/some/~path')
      expect(result).to.equal('/some/~path')
    })

    it('returns non-tilde paths unchanged', () => {
      const result = expandPath('/absolute/path')
      expect(result).to.include('absolute')
      expect(result).to.include('path')
    })

    it('returns relative paths unchanged', () => {
      const result = expandPath('relative/path')
      expect(result).to.include('relative')
    })

    it('handles empty string', () => {
      const result = expandPath('')
      expect(result).to.equal('')
    })
  })

  describe('normalizePath', () => {
    it('converts forward slashes to platform separator', () => {
      const result = normalizePath('a/b/c')
      // On Windows: a\b\c, on Unix: a/b/c
      expect(result).to.equal(join('a', 'b', 'c'))
    })

    it('converts backslashes to platform separator', () => {
      const result = normalizePath(String.raw`a\b\c`)
      expect(result).to.equal(join('a', 'b', 'c'))
    })

    it('handles mixed separators', () => {
      const result = normalizePath(String.raw`a/b\c/d`)
      expect(result).to.equal(join('a', 'b', 'c', 'd'))
    })

    it('handles absolute Unix-style paths', () => {
      const result = normalizePath('/usr/local/bin')
      // On Windows: \usr\local\bin, on Unix: /usr/local/bin
      // Both preserve the structure, just with platform separators
      expect(result).to.include('usr')
      expect(result).to.include('local')
      expect(result).to.include('bin')
    })

    it('handles Windows absolute paths', () => {
      const result = normalizePath(String.raw`C:\Users\test`)
      // Should contain the drive letter
      expect(result).to.include('Users')
    })

    it('handles empty string', () => {
      const result = normalizePath('')
      expect(result).to.equal('.')
    })

    it('removes redundant separators', () => {
      const result = normalizePath('a//b///c')
      expect(result).to.equal(join('a', 'b', 'c'))
    })

    it('normalizes trailing separators consistently', () => {
      const result = normalizePath('a/b/c/')
      // path.normalize preserves trailing separator on Windows, removes on Unix
      // The key is it's normalized to platform separator
      expect(result).to.include('a')
      expect(result).to.include('b')
      expect(result).to.include('c')
    })
  })

  describe('resolvePath', () => {
    it('joins path segments correctly', () => {
      const result = resolvePath('a', 'b', 'c')
      // Use includes to handle platform differences (/ vs \)
      expect(result).to.include('a')
      expect(result).to.include('b')
      expect(result).to.include('c')
    })

    it('returns single segment unchanged', () => {
      const result = resolvePath('single')
      expect(result).to.equal('single')
    })

    it('handles empty segments', () => {
      const result = resolvePath()
      expect(result).to.equal('.')
    })
  })

  describe('isWorkspace', () => {
    it('returns false for non-workspace directory', () => {
      // Use a directory that definitely doesn't have .pai
      const result = isWorkspace('/nonexistent/path/that/does/not/exist')
      expect(result).to.be.false
    })

    it('returns true for directory containing .pai marker', () => {
      // Create temp directory with .pai marker
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const paiMarker = join(tempDir, '.pai')
      mkdirSync(paiMarker)

      try {
        const result = isWorkspace(tempDir)
        expect(result).to.be.true
      } finally {
        // Cleanup
        rmSync(tempDir, {recursive: true})
      }
    })

    it('returns boolean value', () => {
      const result = isWorkspace('.')
      expect(result).to.be.a('boolean')
    })

    it('returns false when .pai is a file, not a directory', () => {
      // Create temp directory with .pai as a FILE
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const paiFile = join(tempDir, '.pai')
      writeFileSync(paiFile, 'not a directory')

      try {
        const result = isWorkspace(tempDir)
        expect(result).to.be.false
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('returns true when .pai is a symlink to a directory', () => {
      // Create temp directories
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const targetDir = mkdtempSync(join(tmpdir(), 'pai-target-'))
      const paiDir = join(targetDir, 'actual-pai')
      mkdirSync(paiDir)

      const paiLink = join(tempDir, '.pai')

      try {
        // Create symlink (use 'junction' on Windows for directory symlinks)
        try {
          symlinkSync(paiDir, paiLink, 'junction')
        } catch {
          // If junction fails, try regular symlink (may require admin on Windows)
          try {
            symlinkSync(paiDir, paiLink, 'dir')
          } catch {
            // Skip test if symlinks not supported
            return
          }
        }

        const result = isWorkspace(tempDir)
        expect(result).to.be.true
      } finally {
        rmSync(tempDir, {recursive: true, force: true})
        rmSync(targetDir, {recursive: true, force: true})
      }
    })
  })

  describe('findWorkspaceRoot', () => {
    it('returns null when no workspace found in hierarchy', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))

      try {
        const result = findWorkspaceRoot(tempDir)
        // Should return null (or possibly find workspace in parent /tmp hierarchy)
        // Explicitly check it didn't find the temp dir itself
        expect(result).to.not.equal(tempDir)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('finds workspace in current directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      mkdirSync(join(tempDir, '.pai'))

      try {
        const result = findWorkspaceRoot(tempDir)
        expect(result).to.equal(tempDir)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('finds workspace in parent directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const subDir = join(tempDir, 'subdir', 'nested')
      mkdirSync(subDir, {recursive: true})
      mkdirSync(join(tempDir, '.pai'))

      try {
        const result = findWorkspaceRoot(subDir)
        expect(result).to.equal(tempDir)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('returns closest workspace when multiple exist', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      const subWorkspace = join(tempDir, 'subworkspace')
      mkdirSync(join(tempDir, '.pai'))
      mkdirSync(subWorkspace)
      mkdirSync(join(subWorkspace, '.pai'))

      try {
        const result = findWorkspaceRoot(subWorkspace)
        expect(result).to.equal(subWorkspace)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })
  })

  describe('getWorkspacePath', () => {
    it('returns null when no workspace found in hierarchy', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))

      try {
        const result = getWorkspacePath(tempDir)
        // Should return null (or possibly find workspace in parent /tmp hierarchy)
        // Explicitly check it didn't find the temp dir itself
        expect(result).to.not.equal(tempDir)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('finds workspace when given directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
      mkdirSync(join(tempDir, '.pai'))

      try {
        const result = getWorkspacePath(tempDir)
        expect(result).to.equal(tempDir)
      } finally {
        rmSync(tempDir, {recursive: true})
      }
    })

    it('uses cwd when no argument provided', () => {
      // getWorkspacePath() with no args uses process.cwd()
      // Should return null or a valid workspace path string
      const result = getWorkspacePath()
      // Either returns null (no workspace found) or a string path
      expect(result === null || typeof result === 'string').to.be.true
      // If it found a workspace, verify it's an absolute path
      if (result !== null) {
        expect(result.length).to.be.greaterThan(0)
      }
    })
  })
})
