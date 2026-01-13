import {expect} from 'chai'
import {describe, it} from 'mocha'

import {ClaudeCodeAdapter} from '../../../../src/lib/template-mapper/adapters/claude-code.js'
import type {ParsedTemplate} from '../../../../src/lib/template-mapper/types.js'

describe('Claude Code Adapter', () => {
  const adapter = new ClaudeCodeAdapter()

  describe('platform', () => {
    it('should report claude-code as platform', () => {
      expect(adapter.platform).to.equal('claude-code')
    })
  })

  describe('getOutputPath', () => {
    it('should generate correct skill path', () => {
      const template: ParsedTemplate = {
        metadata: {name: 'test-skill'},
        content: 'Test content',
      }

      const path = adapter.getOutputPath(template)

      expect(path).to.equal('.claude/skills/test-skill/SKILL.md')
    })

    it('should handle missing name with fallback', () => {
      const template: ParsedTemplate = {
        metadata: {},
        content: 'Test content',
      }

      const path = adapter.getOutputPath(template)

      expect(path).to.equal('.claude/skills/unnamed-skill/SKILL.md')
    })
  })

  describe('validate', () => {
    it('should warn when name is missing', () => {
      const template: ParsedTemplate = {
        metadata: {description: 'No name'},
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'name')).to.be.true
    })

    it('should warn about dropped Windsurf fields', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'test',
          trigger: 'model_decision',
          globs: ['*.ts'],
          labels: ['test'],
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'trigger')).to.be.true
      expect(warnings.some((w) => w.field === 'globs')).to.be.true
      expect(warnings.some((w) => w.field === 'labels')).to.be.true
    })

    it('should warn about dropped Copilot fields', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'test',
          applyTo: ['**/*.ts'],
          excludeAgent: ['code-review'],
          mode: 'agent',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'applyTo')).to.be.true
      expect(warnings.some((w) => w.field === 'excludeAgent')).to.be.true
      expect(warnings.some((w) => w.field === 'mode')).to.be.true
    })

    it('should warn about unknown model', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'test',
          model: 'unknown-model',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'model' && w.category === 'DEGRADED')).to.be.true
    })

    it('should accept valid models', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'test',
          model: 'opus',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'model' && w.category === 'DEGRADED')).to.be.false
    })

    it('should warn about project-scoped permissions', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'test',
          permissions: {
            allow: ['Read(**)'],
          },
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'permissions' && w.category === 'SECURITY')).to.be.true
    })
  })

  describe('transform', () => {
    it('should generate SKILL.md with correct structure', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'my-skill',
          description: 'A test skill',
          version: '1.0.0',
        },
        content: '# My Skill\n\nDo something useful.',
      }

      const result = adapter.transform(template)

      expect(result.success).to.be.true
      expect(result.files.has('.claude/skills/my-skill/SKILL.md')).to.be.true

      const content = result.files.get('.claude/skills/my-skill/SKILL.md')!
      expect(content).to.include('---')
      expect(content).to.include('name: my-skill')
      expect(content).to.include('description: A test skill')
      expect(content).to.include('version: "1.0.0"')
      expect(content).to.include('# My Skill')
      expect(content).to.include('Do something useful.')
    })

    it('should include allowed-tools in frontmatter', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'tool-skill',
          'allowed-tools': ['Read', 'Write', 'Bash(git *)'],
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.claude/skills/tool-skill/SKILL.md')!

      expect(content).to.include('allowed-tools:')
      expect(content).to.include('- Read')
      expect(content).to.include('- Write')
      expect(content).to.include('- Bash(git *)')
    })

    it('should include model and context fields', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'config-skill',
          model: 'opus',
          context: 'fork',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.claude/skills/config-skill/SKILL.md')!

      expect(content).to.include('model: opus')
      expect(content).to.include('context: fork')
    })

    it('should include agent reference', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'agent-skill',
          agent: 'custom-reviewer',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.claude/skills/agent-skill/SKILL.md')!

      expect(content).to.include('agent: custom-reviewer')
      expect(result.warnings.some((w) => w.message.includes('agent: custom-reviewer'))).to.be.true
    })

    it('should generate settings.json when permissions specified', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'secure-skill',
          permissions: {
            allow: ['Read(**/*.ts)', 'Write(src/**)'],
            deny: ['Read(.env)'],
          },
        },
        content: 'Content',
      }

      const result = adapter.transform(template)

      expect(result.files.has('.claude/settings.json')).to.be.true

      const settings = JSON.parse(result.files.get('.claude/settings.json')!)
      expect(settings.permissions.allow).to.deep.equal(['Read(**/*.ts)', 'Write(src/**)'])
      expect(settings.permissions.deny).to.deep.equal(['Read(.env)'])
    })

    it('should not generate settings.json when no permissions', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'simple-skill',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)

      expect(result.files.has('.claude/settings.json')).to.be.false
    })

    it('should fail when name is missing', () => {
      const template: ParsedTemplate = {
        metadata: {description: 'No name'},
        content: 'Content',
      }

      const result = adapter.transform(template)

      expect(result.success).to.be.false
      expect(result.error).to.include('missing required fields')
    })

    it('should drop Windsurf/Copilot fields from output', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'cross-platform',
          description: 'Test',
          trigger: 'model_decision',
          globs: ['*.ts'],
          applyTo: ['**/*.ts'],
          mode: 'agent',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.claude/skills/cross-platform/SKILL.md')!

      // Should not include dropped fields
      expect(content).to.not.include('trigger:')
      expect(content).to.not.include('globs:')
      expect(content).to.not.include('applyTo:')
      expect(content).to.not.include('mode:')

      // Should include native fields
      expect(content).to.include('name: cross-platform')
      expect(content).to.include('description: Test')
    })

    it('should include optional Claude Code fields', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'full-skill',
          'disable-model-invocation': true,
          'argument-hint': '<file-path> [options]',
          language: 'japanese',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.claude/skills/full-skill/SKILL.md')!

      expect(content).to.include('disable-model-invocation: true')
      expect(content).to.include('argument-hint: "<file-path> [options]"')
      expect(content).to.include('language: japanese')
    })
  })
})
