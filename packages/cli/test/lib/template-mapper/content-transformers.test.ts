import {expect} from 'chai'
import {describe, it} from 'mocha'

import {parseContent} from '../../../src/lib/template-mapper/content-parser.js'
import {
  ClaudeCodeContentTransformer,
  WindsurfContentTransformer,
  CopilotContentTransformer,
  createContentTransformer,
} from '../../../src/lib/template-mapper/content-transformers.js'

describe('Content Transformers', () => {
  describe('ClaudeCodeContentTransformer', () => {
    const transformer = new ClaudeCodeContentTransformer()

    it('should have correct platform identifier', () => {
      expect(transformer.platform).to.equal('claude-code')
    })

    it('should pass through Claude Code native constructs unchanged', () => {
      const content = `Use the Glob tool to find files.
Then spawn a new agent to handle analysis.
Set context: fork for isolation.`

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      // Native constructs should remain unchanged
      expect(result.content).to.include('Use the Glob tool')
      expect(result.content).to.include('spawn a new agent')
      expect(result.content).to.include('context: fork')
    })

    it('should convert @workspace commands to tool-based search', () => {
      const content = 'Use @workspace to search for authentication patterns.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.not.include('@workspace')
      expect(result.content).to.include('Search')
      expect(result.warnings).to.have.lengthOf.at.least(1)
      expect(result.warnings.some((w) => w.category === 'EMULATED')).to.be.true
    })

    it('should convert Copilot /prompt format to /skill-name', () => {
      const content = `After completion, run:
/prompt refactor-auth`

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('/refactor-auth')
      expect(result.content).to.not.include('/prompt refactor-auth')
    })

    it('should warn about Windsurf-specific globs field', () => {
      const content = 'Set globs: ["src/**/*.ts"] for context gathering.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.warnings.some((w) =>
        w.category === 'UNSUPPORTED' && w.message.includes('globs'),
      )).to.be.true
    })

    it('should warn about working set limits not applying', () => {
      const content = 'GitHub Copilot has a 10-file limit in working set.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.warnings.some((w) =>
        w.category === 'UNSUPPORTED' && w.message.includes('Working set'),
      )).to.be.true
    })

    it('should convert Windsurf @rules:agent- to agent reference', () => {
      const content = 'First, activate @rules:agent-security-specialist.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('security-specialist agent')
      expect(result.warnings.some((w) => w.category === 'EMULATED')).to.be.true
    })
  })

  describe('WindsurfContentTransformer', () => {
    const transformer = new WindsurfContentTransformer()

    it('should have correct platform identifier', () => {
      expect(transformer.platform).to.equal('windsurf')
    })

    it('should convert agent spawning to sequential execution', () => {
      const content = 'Then spawn agent to handle security review.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Execute the following')
      expect(result.content).to.include('sequentially')
      expect(result.content).to.include('NOTE')
      expect(result.content).to.include('Subagent spawning not available')
      expect(result.warnings.some((w) =>
        w.category === 'EMULATED' && w.message.includes('sequential'),
      )).to.be.true
    })

    it('should rephrase tool calls as action descriptions', () => {
      const content = 'Use the Glob tool to find TypeScript files.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Find files using pattern search')
      expect(result.content).to.not.include('Glob tool')
    })

    it('should transform Grep tool calls with parameters', () => {
      // Use a pattern that matches the tool-call detection
      const content = 'Use the Grep tool to search for patterns'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      // Should convert to natural language
      expect(result.content).to.include('Search file contents')
      expect(result.warnings.some((w) =>
        w.category === 'EMULATED' && w.message.includes('Tool call'),
      )).to.be.true
    })

    it('should replace context switch with Cascade session note', () => {
      const content = 'Run in isolated context for safety.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('current Cascade session')
      expect(result.content).to.include('no isolation available')
    })

    it('should add advisory note to permission references', () => {
      const content = 'Set allowed-tools to restrict operations.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('NOTE')
      expect(result.content).to.include('AI compliance')
      expect(result.warnings.some((w) => w.category === 'SECURITY')).to.be.true
    })

    it('should pass through Windsurf-native globs without transformation', () => {
      const content = 'Uses globs: ["**/*.ts"] for file matching.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      // Native constructs should remain
      expect(result.content).to.include('globs:')
    })

    it('should pass through model_decision trigger', () => {
      const content = 'Set trigger: model_decision for auto-activation.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('trigger: model_decision')
    })

    it('should convert @workspace to natural language', () => {
      const content = '@workspace find all API endpoints.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.not.include('@workspace')
      expect(result.content).to.include('find')
    })

    it('should remove Step 0 context gathering protocol', () => {
      const content = 'Step 0: Gather context before starting.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.not.include('Step 0')
      expect(result.warnings.some((w) =>
        w.message.includes('Step 0') && w.message.includes('removed'),
      )).to.be.true
    })

    it('should convert /prompt format to /workflow-name', () => {
      const content = `Next step:
/prompt refactor-utils`

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('/refactor-utils')
      expect(result.content).to.not.include('/prompt refactor-utils')
    })
  })

  describe('CopilotContentTransformer', () => {
    const transformer = new CopilotContentTransformer()

    it('should have correct platform identifier', () => {
      expect(transformer.platform).to.equal('github-copilot')
    })

    it('should convert agent spawning to manual handoff', () => {
      const content = 'Then spawn agent to handle security review.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Manual Handoff')
      expect(result.content).to.include('separate chat session')
      expect(result.content).to.include('NOTE')
      expect(result.content).to.include('GitHub Copilot does not support')
    })

    it('should generalize tool calls to recommendations', () => {
      const content = 'Use the Glob tool to find files.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Search for files matching patterns')
      expect(result.content).to.not.include('Glob tool')
    })

    it('should remove context switch references entirely', () => {
      const content = 'Run in isolated context for safety.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.not.include('isolated context')
      expect(result.warnings.some((w) =>
        w.category === 'UNSUPPORTED' && w.message.includes('isolation'),
      )).to.be.true
    })

    it('should add working set notes to glob patterns', () => {
      const content = 'Set globs: ["**/*.ts"] for context.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('10-file limit')
      expect(result.content).to.include('applyTo')
    })

    it('should convert /skill-name to /prompt name format', () => {
      const content = `Next step:
/refactor-auth`

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('/prompt refactor-auth')
    })

    it('should pass through @workspace commands natively', () => {
      const content = '@workspace find all API endpoints.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      // @workspace is native to Copilot
      expect(result.content).to.include('@workspace')
    })

    it('should pass through working set limit references', () => {
      const content = 'Respect the 10-file limit in working set.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('10-file limit')
    })

    it('should add batch instructions to context gathering', () => {
      const content = '### Context Gathering Protocol\n\nGather all files.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      // Context gathering should include limit/batch notes
      expect(result.content).to.include('Context Limit')
      expect(result.warnings.some((w) => w.category === 'LIMIT')).to.be.true
    })

    it('should convert @rules:agent- to natural language', () => {
      const content = 'Activate @rules:agent-security-specialist first.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Act as a security specialist')
      expect(result.content).to.not.include('@rules:agent-')
    })

    it('should convert trigger: model_decision to infer recommendation', () => {
      const content = 'Set trigger: model_decision for activation.'

      const analysis = parseContent(content)
      const result = transformer.transform(analysis, content)

      expect(result.warnings.some((w) =>
        w.message.includes('infer'),
      )).to.be.true
    })
  })

  describe('createContentTransformer factory', () => {
    it('should create ClaudeCodeContentTransformer for claude-code', () => {
      const transformer = createContentTransformer('claude-code')
      expect(transformer.platform).to.equal('claude-code')
      expect(transformer).to.be.instanceOf(ClaudeCodeContentTransformer)
    })

    it('should create WindsurfContentTransformer for windsurf', () => {
      const transformer = createContentTransformer('windsurf')
      expect(transformer.platform).to.equal('windsurf')
      expect(transformer).to.be.instanceOf(WindsurfContentTransformer)
    })

    it('should create CopilotContentTransformer for github-copilot', () => {
      const transformer = createContentTransformer('github-copilot')
      expect(transformer.platform).to.equal('github-copilot')
      expect(transformer).to.be.instanceOf(CopilotContentTransformer)
    })

    it('should throw for unknown platform', () => {
      expect(() => createContentTransformer('unknown' as any)).to.throw('Unknown platform')
    })
  })

  describe('Warning Generation', () => {
    it('should generate warnings for emulated constructs on Windsurf', () => {
      const content = `Use the Glob tool to find files.
Then spawn a new agent.
Run in isolated context.`

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      const emulatedWarnings = result.warnings.filter((w) => w.category === 'EMULATED')
      expect(emulatedWarnings.length).to.be.greaterThan(0)
    })

    it('should generate warnings for unsupported constructs on Copilot', () => {
      const content = 'Run in isolated context for safety.'

      const analysis = parseContent(content)
      const transformer = new CopilotContentTransformer()
      const result = transformer.transform(analysis, content)

      const unsupportedWarnings = result.warnings.filter((w) => w.category === 'UNSUPPORTED')
      expect(unsupportedWarnings.length).to.be.greaterThan(0)
    })

    it('should generate security warnings for permission references', () => {
      const content = 'Set allowed-tools to restrict access.'

      const analysis = parseContent(content)

      const windsurfTransformer = new WindsurfContentTransformer()
      const windsurfResult = windsurfTransformer.transform(analysis, content)
      expect(windsurfResult.warnings.some((w) => w.category === 'SECURITY')).to.be.true

      const copilotTransformer = new CopilotContentTransformer()
      const copilotResult = copilotTransformer.transform(analysis, content)
      expect(copilotResult.warnings.some((w) => w.category === 'SECURITY')).to.be.true
    })

    it('should generate limit warnings for glob patterns on Copilot', () => {
      const content = 'Use globs: ["**/*.ts"] for comprehensive search.'

      const analysis = parseContent(content)
      const transformer = new CopilotContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.warnings.some((w) => w.category === 'LIMIT')).to.be.true
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const content = ''
      const analysis = parseContent(content)

      const claudeTransformer = new ClaudeCodeContentTransformer()
      const claudeResult = claudeTransformer.transform(analysis, content)
      expect(claudeResult.content).to.equal('')
      expect(claudeResult.warnings).to.be.an('array')

      const windsurfTransformer = new WindsurfContentTransformer()
      const windsurfResult = windsurfTransformer.transform(analysis, content)
      expect(windsurfResult.content).to.equal('')

      const copilotTransformer = new CopilotContentTransformer()
      const copilotResult = copilotTransformer.transform(analysis, content)
      expect(copilotResult.content).to.equal('')
    })

    it('should handle content with no semantic constructs', () => {
      const content = 'This is plain markdown with no special constructs.'

      const analysis = parseContent(content)

      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.content).to.equal(content)
      expect(result.warnings).to.be.an('array')
    })

    it('should handle multiple constructs on same line', () => {
      const content = 'Use Glob tool then spawn agent for analysis.'

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      // Both constructs should be transformed
      expect(result.content).to.not.include('Glob tool')
      expect(result.content).to.not.include('spawn agent')
      expect(result.warnings.length).to.be.greaterThan(1)
    })

    it('should preserve non-construct content', () => {
      const content = `# Workflow Title

This is a description paragraph.

## Steps

1. Use the Glob tool to find files.
2. Process the results.
3. Generate output.

## Notes

Some additional information here.`

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      // Structure should be preserved
      expect(result.content).to.include('# Workflow Title')
      expect(result.content).to.include('## Steps')
      expect(result.content).to.include('## Notes')
      expect(result.content).to.include('Process the results')
      expect(result.content).to.include('Generate output')
    })

    it('should not double-replace overlapping constructs', () => {
      const content = 'Use the Task tool to spawn a subagent.'

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      // Should transform coherently without mangling
      expect(result.content).to.be.a('string')
      expect(result.content.length).to.be.greaterThan(0)
    })

    it('should handle constructs at beginning of content', () => {
      const content = 'spawn agent for review, then proceed.'

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('Execute')
      expect(result.content).to.include('then proceed')
    })

    it('should handle constructs at end of content', () => {
      const content = 'After analysis, spawn agent'

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('After analysis')
    })
  })

  describe('Advisory Section Generation for Windsurf', () => {
    it('should add proper advisory notes for tool restrictions', () => {
      const content = 'Set allowed-tools: Read, Glob only.'

      const analysis = parseContent(content)
      const transformer = new WindsurfContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('NOTE')
      expect(result.content).to.include('AI compliance')
      expect(result.content).to.include('NOT enforced')
    })
  })

  describe('Context Decomposition for Copilot', () => {
    it('should handle large context references with batch instructions', () => {
      const content = `### Context Gathering Protocol

Gather comprehensive context from:
- All API routes
- Database models
- Service layer
- Utility functions
- Test files`

      const analysis = parseContent(content)
      const transformer = new CopilotContentTransformer()
      const result = transformer.transform(analysis, content)

      // Context gathering should include limit/batch notes
      expect(result.content).to.include('Context Limit')
      expect(result.warnings.some((w) => w.category === 'LIMIT')).to.be.true
    })

    it('should handle multi-part workflows with batch notes', () => {
      const content = 'Part 1 of 5: Initial Analysis'

      const analysis = parseContent(content)
      const transformer = new CopilotContentTransformer()
      const result = transformer.transform(analysis, content)

      expect(result.content).to.include('smaller batches')
    })
  })

  describe('Integration with Platform Adapters', () => {
    it('should work with parsed content from content-parser', () => {
      const content = `# Security Review Workflow

Use the Glob tool to find authentication files.
Then spawn agent to review security patterns.
Set context: fork for isolated analysis.`

      // Parse content
      const analysis = parseContent(content)

      // Claude Code - mostly pass through
      const claudeTransformer = new ClaudeCodeContentTransformer()
      const claudeResult = claudeTransformer.transform(analysis, content)
      expect(claudeResult.content).to.include('Glob tool')
      expect(claudeResult.content).to.include('spawn agent')

      // Windsurf - transform constructs
      const windsurfTransformer = new WindsurfContentTransformer()
      const windsurfResult = windsurfTransformer.transform(analysis, content)
      expect(windsurfResult.content).to.include('Find files')
      expect(windsurfResult.content).to.include('sequentially')
      expect(windsurfResult.content).to.include('Cascade session')

      // Copilot - different transformations
      const copilotTransformer = new CopilotContentTransformer()
      const copilotResult = copilotTransformer.transform(analysis, content)
      expect(copilotResult.content).to.include('Manual Handoff')
      // Glob tool is transformed to recommendation
      expect(copilotResult.content).to.include('Search for files matching patterns')
    })
  })
})
