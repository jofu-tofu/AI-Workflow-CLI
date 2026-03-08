import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  archivePlan,
  extractPlanAnchors,
  generatePlanId,
  normalizePlanContent,
} from '../../../src/templates/core/lib-ts/context/plan-manager.js'
import {getContextPlansDir} from '../../../src/templates/core/lib-ts/runtime/constants.js'

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aiwcli-plan-manager-'))
  mkdirSync(join(root, '.aiwcli'), {recursive: true})
  return root
}

describe('plan-manager', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, {force: true, recursive: true})
    }

    roots.length = 0
  })

  describe('archivePlan', () => {
    it('archives a plan file into the context plans directory', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      const planContent = '# My Plan\n\nThis is the body of the plan.\n\n## Phase 1\n\nDo the thing.\n'
      const planPath = join(projectRoot, 'plan.md')
      writeFileSync(planPath, planContent, 'utf8')

      const [archivedPath, planHash, planSignature] = archivePlan(planPath, 'ctx-test', projectRoot)

      expect(archivedPath).not.toBeNull()
      expect(planHash).not.toBeNull()
      expect(planSignature).not.toBeNull()

      // Archived file should exist with the same content
      expect(existsSync(archivedPath!)).toBe(true)
      expect(readFileSync(archivedPath!, 'utf8')).toBe(planContent)

      // Hash should be a 12-character hex string (first 12 chars of SHA-256)
      expect(planHash).toMatch(/^[0-9a-f]{12}$/)

      // Signature should be the first 200 characters of content
      expect(planSignature).toBe(planContent.slice(0, 200))
    })

    it('produces deterministic hashes for the same content', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      const content = '# Deterministic Plan\n\nSame content, same hash.\n'

      const pathA = join(projectRoot, 'plan-a.md')
      const pathB = join(projectRoot, 'plan-b.md')
      writeFileSync(pathA, content, 'utf8')
      writeFileSync(pathB, content, 'utf8')

      const [, hashA] = archivePlan(pathA, 'ctx-test', projectRoot)
      const [, hashB] = archivePlan(pathB, 'ctx-test', projectRoot)

      expect(hashA).not.toBeNull()
      expect(hashB).not.toBeNull()
      expect(hashA).toBe(hashB)
    })

    it('returns [null, null, null] for a non-existent plan path', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      const result = archivePlan('/nonexistent/path.md', 'ctx-test', projectRoot)

      expect(result).toEqual([null, null, null])
    })
  })

  describe('generatePlanId', () => {
    it('returns an 8-character hex string', () => {
      for (let i = 0; i < 10; i++) {
        const id = generatePlanId()
        expect(id).toMatch(/^[0-9a-f]{8}$/)
      }
    })

    it('generates unique IDs across calls', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 20; i++) {
        ids.add(generatePlanId())
      }

      // With 8 hex chars the collision probability for 20 samples is negligible
      expect(ids.size).toBe(20)
    })
  })

  describe('normalizePlanContent', () => {
    it('strips XML/HTML tags and collapses whitespace', () => {
      const input = '<xml>hello</xml>  world   \n  test'
      const output = normalizePlanContent(input)

      expect(output).not.toContain('<xml>')
      expect(output).not.toContain('</xml>')
      // Whitespace should be collapsed to single spaces
      expect(output).not.toMatch(/  /)
      expect(output).toContain('hello')
      expect(output).toContain('world')
      expect(output).toContain('test')
    })

    it('trims leading and trailing whitespace', () => {
      const output = normalizePlanContent('   padded   ')
      expect(output).toBe('padded')
    })

    it('handles empty string', () => {
      expect(normalizePlanContent('')).toBe('')
    })
  })

  describe('extractPlanAnchors', () => {
    it('extracts markdown headings as anchors', () => {
      const content = [
        '# First Heading',
        'Some intro text that is long enough to be interesting.',
        '## Second Heading',
        'More body content here.',
        '### Third Heading',
        'Even more content.',
      ].join('\n')

      const anchors = extractPlanAnchors(content)

      expect(anchors.length).toBeGreaterThanOrEqual(3)
      expect(anchors).toContain('# First Heading')
      expect(anchors).toContain('## Second Heading')
      expect(anchors).toContain('### Third Heading')
    })

    it('respects the maxAnchors parameter', () => {
      const content = [
        '# Heading 1',
        '## Heading 2',
        '### Heading 3',
        '#### Heading 4',
        '##### Heading 5',
        '###### Heading 6',
      ].join('\n')

      const anchors = extractPlanAnchors(content, 2)
      expect(anchors.length).toBeLessThanOrEqual(2)
    })

    it('returns an empty array for content with no headings and no substantial lines', () => {
      const anchors = extractPlanAnchors('hi')
      expect(anchors).toEqual([])
    })

    it('truncates long headings to 80 characters', () => {
      const longHeading = '# ' + 'A'.repeat(200)
      const anchors = extractPlanAnchors(longHeading)

      expect(anchors.length).toBe(1)
      expect(anchors[0].length).toBeLessThanOrEqual(80)
    })
  })
})
