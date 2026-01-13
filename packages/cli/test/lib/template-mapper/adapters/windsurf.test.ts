import {expect} from 'chai'
import {describe, it} from 'mocha'

import {WindsurfAdapter} from '../../../../src/lib/template-mapper/adapters/windsurf.js'
import type {ParsedTemplate} from '../../../../src/lib/template-mapper/types.js'

describe('Windsurf Adapter', () => {
  const adapter = new WindsurfAdapter()

  describe('platform', () => {
    it('should report windsurf as platform', () => {
      expect(adapter.platform).to.equal('windsurf')
    })
  })

  describe('getOutputPath', () => {
    it('should generate correct workflow path', () => {
      const template: ParsedTemplate = {
        metadata: {name: 'test-workflow'},
        content: 'Test content',
      }

      const path = adapter.getOutputPath(template)

      expect(path).to.equal('.windsurf/workflows/test-workflow.md')
    })

    it('should handle missing name with fallback', () => {
      const template: ParsedTemplate = {
        metadata: {},
        content: 'Test content',
      }

      const path = adapter.getOutputPath(template)

      expect(path).to.equal('.windsurf/workflows/unnamed-workflow.md')
    })
  })

  describe('validate', () => {
    it('should warn when description is missing', () => {
      const template: ParsedTemplate = {
        metadata: {name: 'no-desc'},
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) => w.field === 'description')).to.be.true
    })

    it('should warn about emulated allowed-tools', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'test',
          'allowed-tools': ['Read', 'Write'],
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) =>
        w.field === 'allowed-tools' && w.category === 'EMULATED',
      )).to.be.true
    })

    it('should warn about emulated context: fork', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'test',
          context: 'fork',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) =>
        w.field === 'context' && w.category === 'EMULATED',
      )).to.be.true
    })

    it('should warn about emulated agent', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'test',
          agent: 'custom-agent',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) =>
        w.field === 'agent' && w.category === 'EMULATED',
      )).to.be.true
    })

    it('should warn about advisory permissions', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'test',
          permissions: {
            deny: ['Read(.env)'],
          },
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) =>
        w.field === 'permissions' && w.category === 'SECURITY',
      )).to.be.true
    })

    it('should warn about dropped model field', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'test',
          model: 'opus',
        },
        content: 'Content',
      }

      const warnings = adapter.validate(template)

      expect(warnings.some((w) =>
        w.field === 'model' && w.category === 'UNSUPPORTED',
      )).to.be.true
    })
  })

  describe('transform', () => {
    it('should generate workflow file with correct structure', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'my-workflow',
          description: 'A test workflow',
          version: '1.0.0',
        },
        content: '# My Workflow\n\nDo something useful.',
      }

      const result = adapter.transform(template)

      expect(result.success).to.be.true
      expect(result.files.has('.windsurf/workflows/my-workflow.md')).to.be.true

      const content = result.files.get('.windsurf/workflows/my-workflow.md')!
      expect(content).to.include('---')
      expect(content).to.include('description: A test workflow')
      expect(content).to.include('trigger: model_decision')
      expect(content).to.include('<!-- Version: 1.0.0 -->')
      expect(content).to.include('# My Workflow')
    })

    it('should include native Windsurf fields', () => {
      const template: ParsedTemplate = {
        metadata: {
          description: 'Test',
          trigger: 'glob',
          globs: ['**/*.ts', '**/*.tsx'],
          labels: ['typescript', 'refactoring'],
          author: 'Test Author',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/unnamed-workflow.md')!

      expect(content).to.include('trigger: glob')
      expect(content).to.include('globs:')
      expect(content).to.include('"**/*.ts"')
      expect(content).to.include('labels:')
      expect(content).to.include('- typescript')
      expect(content).to.include('author: "Test Author"')
    })

    it('should generate tool restrictions section for allowed-tools', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'restricted-workflow',
          description: 'Restricted workflow',
          'allowed-tools': ['Read', 'Grep', 'Bash(git *)'],
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/restricted-workflow.md')!

      expect(content).to.include('## Tool Restrictions (Advisory)')
      expect(content).to.include('NOT enforced by Windsurf')
      expect(content).to.include('Read files')
      expect(content).to.include('Shell commands: `git *`')
    })

    it('should generate context isolation markers for fork', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'isolated-workflow',
          description: 'Isolated workflow',
          context: 'fork',
        },
        content: '## Steps\n\n1. Do something',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/isolated-workflow.md')!

      expect(content).to.include('[CONTEXT: Isolated Execution')
      expect(content).to.include('[END CONTEXT: Return to normal session]')
    })

    it('should generate agent persona rule file', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'agent-workflow',
          description: 'Workflow with agent',
          agent: 'security-reviewer',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)

      // Should have main workflow
      expect(result.files.has('.windsurf/workflows/agent-workflow.md')).to.be.true

      // Should have agent rule file
      expect(result.files.has('.windsurf/rules/agent-security-reviewer.md')).to.be.true

      const agentRule = result.files.get('.windsurf/rules/agent-security-reviewer.md')!
      expect(agentRule).to.include('trigger: manual')
      expect(agentRule).to.include('Security Reviewer Persona')
      expect(agentRule).to.include('@rules:agent-security-reviewer')
    })

    it('should generate permissions warning rule file', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'secure-workflow',
          description: 'Secure workflow',
          permissions: {
            deny: ['Read(.env)', 'Write(secrets/**)'],
          },
        },
        content: 'Content',
      }

      const result = adapter.transform(template)

      // Should have main workflow
      expect(result.files.has('.windsurf/workflows/secure-workflow.md')).to.be.true

      // Should have permissions rule file
      expect(result.files.has('.windsurf/rules/permissions-secure-workflow.md')).to.be.true

      const permsRule = result.files.get('.windsurf/rules/permissions-secure-workflow.md')!
      expect(permsRule).to.include('trigger: glob')
      expect(permsRule).to.include('.env')
      expect(permsRule).to.include('SECURITY WARNING')
    })

    it('should include compatibility notes', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'compat-workflow',
          description: 'Test',
          compatibility: {
            windsurf: {
              status: 'partial',
              notes: 'Subagent spawning not supported',
            },
          },
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/compat-workflow.md')!

      expect(content).to.include('## Platform Compatibility Note')
      expect(content).to.include('partial support')
      expect(content).to.include('Subagent spawning not supported')
    })

    it('should generate agent reference in main workflow', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'ref-workflow',
          description: 'Test',
          agent: 'code-reviewer',
        },
        content: 'Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/ref-workflow.md')!

      expect(content).to.include('## Agent Persona')
      expect(content).to.include('**code-reviewer**')
      expect(content).to.include('@rules:agent-code-reviewer')
    })

    it('should warn about character limit when exceeded', () => {
      // Create a large template
      const largeContent = 'X'.repeat(15000)
      const template: ParsedTemplate = {
        metadata: {
          description: 'Large workflow',
        },
        content: largeContent,
      }

      const result = adapter.transform(template)

      expect(result.warnings.some((w) =>
        w.category === 'LIMIT' && w.message.includes('12000 character limit'),
      )).to.be.true
    })

    it('should convert hooks to manual workflow steps', () => {
      const template: ParsedTemplate = {
        metadata: {
          name: 'hooks-workflow',
          description: 'Test',
          hooks: {
            PreToolUse: [{
              matcher: 'Write|Edit',
              hooks: [{type: 'command', command: 'npm run lint'}],
            }],
            Stop: [{
              hooks: [{type: 'command', command: 'npm test'}],
            }],
          },
        },
        content: '## Main Content',
      }

      const result = adapter.transform(template)
      const content = result.files.get('.windsurf/workflows/hooks-workflow.md')!

      expect(content).to.include('## Pre-Execution Checks')
      expect(content).to.include('npm run lint')
      expect(content).to.include('## Post-Execution Validation')
      expect(content).to.include('npm test')
    })
  })
})
