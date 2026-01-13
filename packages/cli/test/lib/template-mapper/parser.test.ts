import {expect} from 'chai'
import {describe, it} from 'mocha'

import {
  parseTemplateString,
  isValidTemplate,
  extractFrontmatter,
  ParseError,
} from '../../../src/lib/template-mapper/parser.js'

describe('Template Parser', () => {
  describe('parseTemplateString', () => {
    it('should parse a valid template with frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
version: "1.0.0"
---

# Test Content

This is the body.`

      const result = parseTemplateString(content)

      expect(result.metadata.name).to.equal('test-skill')
      expect(result.metadata.description).to.equal('A test skill')
      expect(result.metadata.version).to.equal('1.0.0')
      expect(result.content).to.include('# Test Content')
      expect(result.content).to.include('This is the body.')
    })

    it('should parse allowed-tools as array', () => {
      const content = `---
name: tool-test
allowed-tools:
  - Read
  - Write
  - Bash(git *)
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata['allowed-tools']).to.deep.equal([
        'Read',
        'Write',
        'Bash(git *)',
      ])
    })

    it('should normalize comma-separated applyTo to array', () => {
      const content = `---
name: apply-test
applyTo: "**/*.ts,**/*.tsx"
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.applyTo).to.deep.equal(['**/*.ts', '**/*.tsx'])
    })

    it('should parse Windsurf-specific fields', () => {
      const content = `---
description: Test workflow
trigger: model_decision
globs:
  - "**/*.py"
labels:
  - python
  - testing
alwaysApply: false
author: "Test Author"
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.trigger).to.equal('model_decision')
      expect(result.metadata.globs).to.deep.equal(['**/*.py'])
      expect(result.metadata.labels).to.deep.equal(['python', 'testing'])
      expect(result.metadata.alwaysApply).to.equal(false)
      expect(result.metadata.author).to.equal('Test Author')
    })

    it('should parse GitHub Copilot-specific fields', () => {
      const content = `---
description: Test prompt
applyTo:
  - "**/*.ts"
excludeAgent:
  - code-review
mode: agent
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.applyTo).to.deep.equal(['**/*.ts'])
      expect(result.metadata.excludeAgent).to.deep.equal(['code-review'])
      expect(result.metadata.mode).to.equal('agent')
    })

    it('should parse Claude Code permissions', () => {
      const content = `---
name: secure-skill
permissions:
  allow:
    - Read(**/*.ts)
    - Write(src/**)
  deny:
    - Read(.env)
    - Write(config/production.json)
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.permissions?.allow).to.deep.equal([
        'Read(**/*.ts)',
        'Write(src/**)',
      ])
      expect(result.metadata.permissions?.deny).to.deep.equal([
        'Read(.env)',
        'Write(config/production.json)',
      ])
    })

    it('should parse cross-platform fields', () => {
      const content = `---
name: cross-platform-skill
platforms:
  - claude-code
  - windsurf
compatibility:
  claude-code:
    status: full
    notes: "Full support"
  windsurf:
    status: partial
    notes: "Emulated"
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.platforms).to.deep.equal(['claude-code', 'windsurf'])
      expect(result.metadata.compatibility?.['claude-code']?.status).to.equal('full')
      expect(result.metadata.compatibility?.windsurf?.status).to.equal('partial')
    })

    it('should parse context field correctly', () => {
      const content = `---
name: forked-skill
context: fork
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.context).to.equal('fork')
    })

    it('should throw ParseError for missing frontmatter', () => {
      const content = `# No Frontmatter

This template has no frontmatter.`

      expect(() => parseTemplateString(content)).to.throw(ParseError)
      expect(() => parseTemplateString(content)).to.throw(/must start with YAML frontmatter/)
    })

    it('should throw ParseError for invalid YAML', () => {
      // YAML with explicit syntax error (duplicate key with inconsistent indent)
      const content = `---
name: broken
name:
  - invalid structure
---

Content`

      expect(() => parseTemplateString(content)).to.throw(ParseError, /Invalid YAML/)
    })

    it('should handle empty content after frontmatter', () => {
      const content = `---
name: empty-body
---
`

      const result = parseTemplateString(content)

      expect(result.metadata.name).to.equal('empty-body')
      expect(result.content).to.equal('')
    })

    it('should warn for missing description but not throw', () => {
      const content = `---
name: no-description
---

Content`

      // Should not throw - description is recommended but not required
      const result = parseTemplateString(content)
      expect(result.metadata.name).to.equal('no-description')
    })

    it('should filter invalid platform values', () => {
      const content = `---
name: invalid-platform
platforms:
  - claude-code
  - invalid-platform
  - windsurf
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.platforms).to.deep.equal(['claude-code', 'windsurf'])
    })

    it('should parse model and agent fields', () => {
      const content = `---
name: model-test
model: opus
agent: custom-reviewer
---

Content`

      const result = parseTemplateString(content)

      expect(result.metadata.model).to.equal('opus')
      expect(result.metadata.agent).to.equal('custom-reviewer')
    })
  })

  describe('isValidTemplate', () => {
    it('should return true for valid template', () => {
      const content = `---
name: valid
---
Content`

      expect(isValidTemplate(content)).to.be.true
    })

    it('should return false for content without frontmatter', () => {
      expect(isValidTemplate('# Just markdown')).to.be.false
      expect(isValidTemplate('No frontmatter here')).to.be.false
    })

    it('should return false for incomplete frontmatter', () => {
      expect(isValidTemplate('---\nname: incomplete')).to.be.false
      expect(isValidTemplate('---')).to.be.false
    })
  })

  describe('extractFrontmatter', () => {
    it('should extract frontmatter data', () => {
      const content = `---
name: extract-test
version: "2.0.0"
---

Content`

      const data = extractFrontmatter(content)

      expect(data).to.not.be.null
      expect(data?.name).to.equal('extract-test')
      expect(data?.version).to.equal('2.0.0')
    })

    it('should return empty object for content without frontmatter', () => {
      // gray-matter returns empty object for content without frontmatter delimiters
      const result = extractFrontmatter('not valid yaml frontmatter')
      expect(result).to.deep.equal({})
    })
  })
})
