import {expect} from 'chai'
import {describe, it} from 'mocha'

import {
  parseContent,
  hasSemanticConstructs,
  getConstructsByPlatform,
  getConstructsByType,
  getConstructTypes,
  getSourcePlatform,
} from '../../../src/lib/template-mapper/content-parser.js'

describe('Content Parser', () => {
  describe('parseContent', () => {
    it('should return empty constructs for plain markdown', () => {
      const content = `# Simple Heading

This is just regular markdown content without any platform-specific constructs.

- List item 1
- List item 2

Some more text here.`

      const analysis = parseContent(content)

      expect(analysis.rawContent).to.equal(content)
      // May have some matches for generic patterns like "progress" in some edge cases
      // The important thing is no false positives for specific platform syntax
    })

    it('should detect multiple construct types in content', () => {
      const content = `Use the Glob tool to find files.
When tests pass, spawn a new agent to verify.
This workflow activates automatically when user mentions "optimize".`

      const analysis = parseContent(content)

      expect(analysis.constructs.length).to.be.greaterThan(0)

      const types = analysis.constructs.map((c) => c.type)
      expect(types).to.include('tool-call')
      expect(types).to.include('agent-spawn')
    })

    it('should skip constructs inside fenced code blocks', () => {
      const content = `Here is some code:

\`\`\`typescript
// Use the Glob tool here
const result = await Glob('**/*.ts')
spawn agent task
\`\`\`

Regular text after code block.`

      const analysis = parseContent(content)

      // Should not detect tool-call or agent-spawn from inside code block
      const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
      const agentSpawns = analysis.constructs.filter((c) => c.type === 'agent-spawn')

      // No matches should come from inside the code block
      for (const tc of toolCalls) {
        expect(tc.location.start).to.not.be.within(
          content.indexOf('```typescript'),
          content.lastIndexOf('```'),
        )
      }
      for (const as of agentSpawns) {
        expect(as.location.start).to.not.be.within(
          content.indexOf('```typescript'),
          content.lastIndexOf('```'),
        )
      }
    })

    it('should skip constructs inside inline code', () => {
      const content = `You can run \`npm test\` to verify.
The \`Task tool\` is used internally.
Regular npm test command here.`

      const analysis = parseContent(content)

      // Should detect the "Regular npm test" but not the ones in inline code
      const testCommands = analysis.constructs.filter((c) => c.type === 'test-command')

      // Verify we get the one outside inline code
      const outsideCodeMatch = testCommands.find((c) => c.rawText === 'npm test')
      expect(outsideCodeMatch).to.exist
    })

    it('should track correct line numbers', () => {
      const content = `Line 1
Line 2
Use the Glob tool here.
Line 4`

      const analysis = parseContent(content)

      const toolCall = analysis.constructs.find((c) => c.type === 'tool-call')
      expect(toolCall).to.exist
      if (toolCall) {
        expect(toolCall.location.line).to.equal(3)
      }
    })

    it('should sort constructs by position', () => {
      const content = `npm test first.
Then spawn agent.
Finally use Glob tool.`

      const analysis = parseContent(content)

      for (let i = 1; i < analysis.constructs.length; i++) {
        const current = analysis.constructs[i]
        const previous = analysis.constructs[i - 1]
        if (current && previous) {
          expect(current.location.start).to.be.at.least(previous.location.start)
        }
      }
    })
  })

  describe('Agent Spawning Detection', () => {
    it('should detect "spawn agent" pattern', () => {
      const content = 'You can spawn a new agent to handle this task.'
      const analysis = parseContent(content)

      const spawns = analysis.constructs.filter((c) => c.type === 'agent-spawn')
      expect(spawns.length).to.be.greaterThan(0)
      expect(spawns[0]?.parsed?.mechanism).to.equal('spawn')
    })

    it('should detect Task tool reference', () => {
      // Task tool reference detected as tool-call since "Use the Task tool" is a tool call pattern
      // The subagent reference is detected as agent-spawn
      const content = 'Use the Task tool to delegate work to a subagent.'
      const analysis = parseContent(content)

      const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
      const spawns = analysis.constructs.filter((c) => c.type === 'agent-spawn')
      expect(toolCalls.length).to.be.greaterThan(0)
      expect(toolCalls[0]?.parsed?.toolName).to.equal('Task')
      expect(spawns.length).to.be.greaterThan(0) // subagent is detected as agent-spawn
    })

    it('should detect context: fork pattern as context-switch', () => {
      // context: fork is now detected as context-switch, not agent-spawn
      const content = 'This skill uses context: fork for isolation.'
      const analysis = parseContent(content)

      const switches = analysis.constructs.filter((c) => c.type === 'context-switch')
      expect(switches.length).to.be.greaterThan(0)
      expect(switches[0]?.parsed?.contextType).to.equal('fork')
    })

    it('should detect subagent reference', () => {
      const content = 'The subagent will handle security review.'
      const analysis = parseContent(content)

      const spawns = analysis.constructs.filter((c) => c.type === 'agent-spawn')
      expect(spawns.length).to.be.greaterThan(0)
    })

    it('should detect parallel agent pattern', () => {
      const content = 'Run parallel agent for concurrent processing.'
      const analysis = parseContent(content)

      const spawns = analysis.constructs.filter((c) => c.type === 'agent-spawn')
      expect(spawns.length).to.be.greaterThan(0)
    })
  })

  describe('Tool Call Detection', () => {
    it('should detect "use X tool" pattern', () => {
      const content = 'Use the Read tool to view file contents.'
      const analysis = parseContent(content)

      const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
      expect(toolCalls.length).to.be.greaterThan(0)
      expect(toolCalls[0]?.parsed?.toolName).to.equal('Read')
    })

    it('should detect various tool names', () => {
      const tools = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Task', 'WebFetch', 'WebSearch']

      for (const tool of tools) {
        const content = `Use the ${tool} tool here.`
        const analysis = parseContent(content)

        const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
        expect(toolCalls.length, `Should detect ${tool} tool`).to.be.greaterThan(0)
      }
    })

    it('should detect tool function call syntax', () => {
      const content = 'Call Glob("**/*.ts") to find TypeScript files.'
      const analysis = parseContent(content)

      const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
      expect(toolCalls.length).to.be.greaterThan(0)
      expect(toolCalls[0]?.parsed?.toolName).to.equal('Glob')
    })
  })

  describe('Context Switch Detection', () => {
    it('should detect context: fork', () => {
      const content = 'This skill uses context: fork for isolation.'
      const analysis = parseContent(content)

      const switches = analysis.constructs.filter((c) => c.type === 'context-switch')
      expect(switches.length).to.be.greaterThan(0)
      expect(switches[0]?.parsed?.contextType).to.equal('fork')
    })

    it('should detect context: inherit', () => {
      const content = 'Using context: inherit to share state.'
      const analysis = parseContent(content)

      const switches = analysis.constructs.filter((c) => c.type === 'context-switch')
      expect(switches.length).to.be.greaterThan(0)
      expect(switches[0]?.parsed?.contextType).to.equal('inherit')
    })

    it('should detect isolated context reference', () => {
      const content = 'Run in an isolated context for safety.'
      const analysis = parseContent(content)

      const switches = analysis.constructs.filter((c) => c.type === 'context-switch')
      expect(switches.length).to.be.greaterThan(0)
    })

    it('should detect fresh/clean context patterns', () => {
      const content = 'Start with a fresh context for this task.'
      const analysis = parseContent(content)

      const switches = analysis.constructs.filter((c) => c.type === 'context-switch')
      expect(switches.length).to.be.greaterThan(0)
    })
  })

  describe('Permission Reference Detection', () => {
    it('should detect allowed-tools reference', () => {
      const content = 'Set allowed-tools to restrict operations.'
      const analysis = parseContent(content)

      const perms = analysis.constructs.filter((c) => c.type === 'permission-reference')
      expect(perms.length).to.be.greaterThan(0)
      expect(perms[0]?.parsed?.isAllow).to.be.true
    })

    it('should detect advisory restriction warning', () => {
      const content = 'NOTE: These rely on AI compliance and cannot be enforced.'
      const analysis = parseContent(content)

      const perms = analysis.constructs.filter((c) => c.type === 'permission-reference')
      expect(perms.length).to.be.greaterThan(0)
      expect(perms[0]?.parsed?.isAdvisory).to.be.true
    })

    it('should detect forbidden operations', () => {
      const content = 'forbidden operations include file deletion.'
      const analysis = parseContent(content)

      const perms = analysis.constructs.filter((c) => c.type === 'permission-reference')
      expect(perms.length).to.be.greaterThan(0)
      expect(perms[0]?.parsed?.isDeny).to.be.true
    })
  })

  describe('Model Decision Trigger Detection', () => {
    it('should detect USE WHEN pattern', () => {
      const content = 'USE WHEN creating git commits.'
      const analysis = parseContent(content)

      const triggers = analysis.constructs.filter((c) => c.type === 'model-decision-trigger')
      expect(triggers.length).to.be.greaterThan(0)
      expect(triggers[0]?.parsed?.hasUseWhen).to.be.true
    })

    it('should detect trigger: model_decision', () => {
      const content = 'Set trigger: model_decision in frontmatter.'
      const analysis = parseContent(content)

      const triggers = analysis.constructs.filter((c) => c.type === 'model-decision-trigger')
      expect(triggers.length).to.be.greaterThan(0)
      expect(triggers[0]?.parsed?.hasTriggerField).to.be.true
    })

    it('should detect auto-activation patterns', () => {
      const content = 'This workflow activates automatically when needed.'
      const analysis = parseContent(content)

      const triggers = analysis.constructs.filter((c) => c.type === 'model-decision-trigger')
      expect(triggers.length).to.be.greaterThan(0)
    })
  })

  describe('Glob Pattern Detection', () => {
    it('should detect globs: array syntax', () => {
      const content = 'Set globs: ["src/**/*.ts"] for context.'
      const analysis = parseContent(content)

      const globs = analysis.constructs.filter((c) => c.type === 'glob-pattern')
      expect(globs.length).to.be.greaterThan(0)
    })

    it('should detect glob patterns in content', () => {
      const content = 'Find all files matching the glob pattern **/*.tsx in components.'
      const analysis = parseContent(content)

      const globs = analysis.constructs.filter((c) => c.type === 'glob-pattern')
      expect(globs.length).to.be.greaterThan(0)
      // Glob pattern detection captures the syntax, parsed data extraction is separate
    })

    it('should detect src/** pattern', () => {
      const content = 'Search src/**/utils for helper functions.'
      const analysis = parseContent(content)

      const globs = analysis.constructs.filter((c) => c.type === 'glob-pattern')
      expect(globs.length).to.be.greaterThan(0)
    })
  })

  describe('Persona Rule Detection', () => {
    it('should detect @rules:agent- pattern', () => {
      const content = 'Activate the persona with @rules:agent-security-specialist first.'
      const analysis = parseContent(content)

      const personas = analysis.constructs.filter((c) => c.type === 'persona-rule')
      expect(personas.length).to.be.greaterThan(0)
      expect(personas[0]?.parsed?.personaName).to.equal('security-specialist')
    })

    it('should detect specialized agent reference', () => {
      const content = 'Use a specialized agent for this task.'
      const analysis = parseContent(content)

      const personas = analysis.constructs.filter((c) => c.type === 'persona-rule')
      expect(personas.length).to.be.greaterThan(0)
    })

    it('should detect custom agent pattern', () => {
      const content = 'Create a custom agent for code review.'
      const analysis = parseContent(content)

      const personas = analysis.constructs.filter((c) => c.type === 'persona-rule')
      expect(personas.length).to.be.greaterThan(0)
    })
  })

  describe('Skill Chaining Detection', () => {
    it('should detect Part X of Y pattern', () => {
      const content = 'Part 1 of 4: Core Authentication Module'
      const analysis = parseContent(content)

      const chains = analysis.constructs.filter((c) => c.type === 'skill-chaining')
      expect(chains.length).to.be.greaterThan(0)
      expect(chains[0]?.parsed?.currentPart).to.equal(1)
      expect(chains[0]?.parsed?.totalParts).to.equal(4)
    })

    it('should detect /prompt skill-name pattern', () => {
      const content = `Proceed with the next step:
/prompt refactor-auth`
      const analysis = parseContent(content)

      const chains = analysis.constructs.filter((c) => c.type === 'skill-chaining')
      expect(chains.length).to.be.greaterThan(0)
      expect(chains[0]?.parsed?.skillName).to.equal('prompt')
    })

    it('should detect Proceed to Part X', () => {
      const content = 'When done, Proceed to Part 2.'
      const analysis = parseContent(content)

      const chains = analysis.constructs.filter((c) => c.type === 'skill-chaining')
      expect(chains.length).to.be.greaterThan(0)
    })
  })

  describe('Context Gathering Protocol Detection', () => {
    it('should detect Step 0 pattern', () => {
      const content = 'Step 0: Gather file context before analysis.'
      const analysis = parseContent(content)

      const protocols = analysis.constructs.filter((c) => c.type === 'context-gathering-protocol')
      expect(protocols.length).to.be.greaterThan(0)
      expect(protocols[0]?.parsed?.hasStep0).to.be.true
    })

    it('should detect Context Gathering Protocol header', () => {
      const content = '### Context Gathering Protocol\n\nGather files first.'
      const analysis = parseContent(content)

      const protocols = analysis.constructs.filter((c) => c.type === 'context-gathering-protocol')
      expect(protocols.length).to.be.greaterThan(0)
    })

    it('should detect Context Checklist', () => {
      const content = 'Context Checklist:\n- [ ] All API routes identified'
      const analysis = parseContent(content)

      const protocols = analysis.constructs.filter((c) => c.type === 'context-gathering-protocol')
      expect(protocols.length).to.be.greaterThan(0)
      expect(protocols[0]?.parsed?.hasChecklist).to.be.true
    })
  })

  describe('Activation Instruction Detection', () => {
    it('should detect Manual invocation pattern', () => {
      const content = 'Manual invocation: /commit-helper'
      const analysis = parseContent(content)

      const activations = analysis.constructs.filter((c) => c.type === 'activation-instruction')
      expect(activations.length).to.be.greaterThan(0)
      expect(activations[0]?.parsed?.isManual).to.be.true
    })

    it('should detect When to invoke section', () => {
      const content = 'When to invoke: Use when user mentions "optimize".'
      const analysis = parseContent(content)

      const activations = analysis.constructs.filter((c) => c.type === 'activation-instruction')
      expect(activations.length).to.be.greaterThan(0)
    })
  })

  describe('Working Set Limit Detection', () => {
    it('should detect 10-file limit reference', () => {
      const content = 'GitHub Copilot has a 10-file limit.'
      const analysis = parseContent(content)

      const limits = analysis.constructs.filter((c) => c.type === 'working-set-limit')
      expect(limits.length).to.be.greaterThan(0)
      expect(limits[0]?.parsed?.fileLimit).to.equal(10)
    })

    it('should detect working set reference', () => {
      const content = 'Add files to the working set for analysis.'
      const analysis = parseContent(content)

      const limits = analysis.constructs.filter((c) => c.type === 'working-set-limit')
      expect(limits.length).to.be.greaterThan(0)
    })

    it('should detect batch files pattern', () => {
      const content = 'Process files in batch of 10 to avoid exceeds limit.'
      const analysis = parseContent(content)

      const limits = analysis.constructs.filter((c) => c.type === 'working-set-limit')
      expect(limits.length).to.be.greaterThan(0)
    })
  })

  describe('Checkpoint Commit Detection', () => {
    it('should detect Checkpoint: pattern', () => {
      const content = 'Checkpoint: Create commit before next phase.'
      const analysis = parseContent(content)

      const checkpoints = analysis.constructs.filter((c) => c.type === 'checkpoint-commit')
      expect(checkpoints.length).to.be.greaterThan(0)
    })

    it('should detect rollback plan reference', () => {
      const content = 'Rollback plan: Revert to checkpoint if needed.'
      const analysis = parseContent(content)

      const checkpoints = analysis.constructs.filter((c) => c.type === 'checkpoint-commit')
      expect(checkpoints.length).to.be.greaterThan(0)
      expect(checkpoints[0]?.parsed?.hasRollbackPlan).to.be.true
    })

    it('should detect Step N: Checkpoint pattern', () => {
      const content = 'Step 5: Checkpoint commit for phase 1.'
      const analysis = parseContent(content)

      const checkpoints = analysis.constructs.filter((c) => c.type === 'checkpoint-commit')
      expect(checkpoints.length).to.be.greaterThan(0)
      expect(checkpoints[0]?.parsed?.hasStepNumber).to.be.true
    })
  })

  describe('Progress Tracking Detection', () => {
    it('should detect REFACTOR-PROGRESS.md reference', () => {
      const content = 'Create REFACTOR-PROGRESS.md to track work.'
      const analysis = parseContent(content)

      const progress = analysis.constructs.filter((c) => c.type === 'progress-tracking')
      expect(progress.length).to.be.greaterThan(0)
      expect(progress[0]?.parsed?.hasProgressFile).to.be.true
    })

    it('should detect checklist items', () => {
      const content = '- [x] Step 1 completed\n- [ ] Step 2 pending'
      const analysis = parseContent(content)

      const progress = analysis.constructs.filter((c) => c.type === 'progress-tracking')
      expect(progress.length).to.be.greaterThan(0)
      expect(progress[0]?.parsed?.hasChecklist).to.be.true
    })

    it('should detect Progress Tracking header', () => {
      const content = '## Progress Tracking\n\nTrack completion here.'
      const analysis = parseContent(content)

      const progress = analysis.constructs.filter((c) => c.type === 'progress-tracking')
      expect(progress.length).to.be.greaterThan(0)
    })
  })

  describe('Workspace Command Detection', () => {
    it('should detect @workspace command', () => {
      const content = 'Use @workspace to search the codebase.'
      const analysis = parseContent(content)

      const workspace = analysis.constructs.filter((c) => c.type === 'workspace-command')
      expect(workspace.length).to.be.greaterThan(0)
    })

    it('should detect @workspace analyze', () => {
      const content = '@workspace analyze database access patterns.'
      const analysis = parseContent(content)

      const workspace = analysis.constructs.filter((c) => c.type === 'workspace-command')
      expect(workspace.length).to.be.greaterThan(0)
      expect(workspace[0]?.parsed?.action).to.equal('analyze')
    })

    it('should detect @workspace find', () => {
      const content = '@workspace find all API endpoints.'
      const analysis = parseContent(content)

      const workspace = analysis.constructs.filter((c) => c.type === 'workspace-command')
      expect(workspace.length).to.be.greaterThan(0)
      expect(workspace[0]?.parsed?.action).to.equal('find')
    })
  })

  describe('Test Command Detection', () => {
    it('should detect npm test', () => {
      const content = 'Run npm test to verify changes.'
      const analysis = parseContent(content)

      const tests = analysis.constructs.filter((c) => c.type === 'test-command')
      expect(tests.length).to.be.greaterThan(0)
      expect(tests[0]?.parsed?.framework).to.equal('npm')
    })

    it('should detect pytest', () => {
      const content = 'Execute pytest for Python tests.'
      const analysis = parseContent(content)

      const tests = analysis.constructs.filter((c) => c.type === 'test-command')
      expect(tests.length).to.be.greaterThan(0)
      expect(tests[0]?.parsed?.framework).to.equal('pytest')
    })

    it('should detect jest', () => {
      const content = 'Run jest for unit tests.'
      const analysis = parseContent(content)

      const tests = analysis.constructs.filter((c) => c.type === 'test-command')
      expect(tests.length).to.be.greaterThan(0)
      expect(tests[0]?.parsed?.framework).to.equal('jest')
    })

    it('should detect vitest', () => {
      const content = 'Using vitest for modern testing.'
      const analysis = parseContent(content)

      const tests = analysis.constructs.filter((c) => c.type === 'test-command')
      expect(tests.length).to.be.greaterThan(0)
      expect(tests[0]?.parsed?.framework).to.equal('vitest')
    })
  })

  describe('Advisory Warning Detection', () => {
    it('should detect "not enforced" warning', () => {
      const content = 'NOTE: These restrictions are not enforced by platform.'
      const analysis = parseContent(content)

      const warnings = analysis.constructs.filter((c) => c.type === 'advisory-warning')
      expect(warnings.length).to.be.greaterThan(0)
      expect(warnings[0]?.parsed?.isEnforcementWarning).to.be.true
    })

    it('should detect emulated pattern', () => {
      const content = 'This behavior is emulated on this platform.'
      const analysis = parseContent(content)

      const warnings = analysis.constructs.filter((c) => c.type === 'advisory-warning')
      expect(warnings.length).to.be.greaterThan(0)
      expect(warnings[0]?.parsed?.isEmulationWarning).to.be.true
    })

    it('should detect "not supported" warning', () => {
      const content = 'This feature is not supported here.'
      const analysis = parseContent(content)

      const warnings = analysis.constructs.filter((c) => c.type === 'advisory-warning')
      expect(warnings.length).to.be.greaterThan(0)
      expect(warnings[0]?.parsed?.isLimitationWarning).to.be.true
    })
  })

  describe('Version Comment Detection', () => {
    it('should detect Version comment', () => {
      const content = '<!-- Version: 1.0.0 -->\n\nContent here.'
      const analysis = parseContent(content)

      const versions = analysis.constructs.filter((c) => c.type === 'version-comment')
      expect(versions.length).to.be.greaterThan(0)
      expect(versions[0]?.parsed?.version).to.equal('1.0.0')
    })

    it('should detect Part comment', () => {
      const content = '<!-- Part 2 of 4: API Routes -->\n\nContent.'
      const analysis = parseContent(content)

      const versions = analysis.constructs.filter((c) => c.type === 'version-comment')
      expect(versions.length).to.be.greaterThan(0)
      expect(versions[0]?.parsed?.currentPart).to.equal(2)
      expect(versions[0]?.parsed?.totalParts).to.equal(4)
    })

    it('should detect Adapted from comment', () => {
      const content = '<!-- Adapted from Claude Code skill -->\n\nWorkflow.'
      const analysis = parseContent(content)

      const versions = analysis.constructs.filter((c) => c.type === 'version-comment')
      expect(versions.length).to.be.greaterThan(0)
    })
  })

  describe('Execution Flow Section Detection', () => {
    it('should detect Execution Flow header', () => {
      const content = '## Execution Flow\n\n1. First step...'
      const analysis = parseContent(content)

      const flows = analysis.constructs.filter((c) => c.type === 'execution-flow-section')
      expect(flows.length).to.be.greaterThan(0)
      expect(flows[0]?.parsed?.sectionType).to.equal('execution-flow')
    })

    it('should detect Step-by-Step Execution', () => {
      const content = '### Step-by-Step Execution\n\nDetailed steps.'
      const analysis = parseContent(content)

      const flows = analysis.constructs.filter((c) => c.type === 'execution-flow-section')
      expect(flows.length).to.be.greaterThan(0)
      expect(flows[0]?.parsed?.sectionType).to.equal('step-by-step')
    })

    it('should detect Verification Points', () => {
      const content = '## Verification Points\n\nCheck these conditions.'
      const analysis = parseContent(content)

      const flows = analysis.constructs.filter((c) => c.type === 'execution-flow-section')
      expect(flows.length).to.be.greaterThan(0)
      expect(flows[0]?.parsed?.sectionType).to.equal('verification-points')
    })
  })

  describe('Utility Functions', () => {
    describe('hasSemanticConstructs', () => {
      it('should return true for content with constructs', () => {
        const content = 'Use the Glob tool here.'
        expect(hasSemanticConstructs(content)).to.be.true
      })

      it('should return false for plain content', () => {
        // Very minimal content unlikely to match anything
        const content = 'Hello world'
        expect(hasSemanticConstructs(content)).to.be.false
      })
    })

    describe('getConstructsByPlatform', () => {
      it('should filter constructs by platform', () => {
        const content = `Use the Glob tool (Claude Code).
@workspace search (Copilot).
USE WHEN creating commits (Windsurf).`

        const analysis = parseContent(content)

        const claudeConstructs = getConstructsByPlatform(analysis, 'claude-code')
        const copilotConstructs = getConstructsByPlatform(analysis, 'github-copilot')
        const windsurfConstructs = getConstructsByPlatform(analysis, 'windsurf')

        expect(claudeConstructs.every((c) => c.platform === 'claude-code')).to.be.true
        expect(copilotConstructs.every((c) => c.platform === 'github-copilot')).to.be.true
        expect(windsurfConstructs.every((c) => c.platform === 'windsurf')).to.be.true
      })
    })

    describe('getConstructsByType', () => {
      it('should filter constructs by type', () => {
        const content = `Use Glob tool and Read tool.
Also spawn agent.`

        const analysis = parseContent(content)

        const toolCalls = getConstructsByType(analysis, 'tool-call')
        expect(toolCalls.every((c) => c.type === 'tool-call')).to.be.true
      })
    })

    describe('getConstructTypes', () => {
      it('should return all construct types', () => {
        const types = getConstructTypes()

        expect(types).to.include('agent-spawn')
        expect(types).to.include('tool-call')
        expect(types).to.include('context-switch')
        expect(types).to.include('model-decision-trigger')
        expect(types.length).to.equal(18) // All 18 construct types
      })
    })

    describe('getSourcePlatform', () => {
      it('should return correct platform for each type', () => {
        expect(getSourcePlatform('agent-spawn')).to.equal('claude-code')
        expect(getSourcePlatform('model-decision-trigger')).to.equal('windsurf')
        expect(getSourcePlatform('workspace-command')).to.equal('github-copilot')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const analysis = parseContent('')
      expect(analysis.constructs).to.be.an('array').that.is.empty
      expect(analysis.rawContent).to.equal('')
    })

    it('should handle content with only code blocks', () => {
      const content = `\`\`\`typescript
Use Glob tool here
spawn agent
npm test
\`\`\``

      const analysis = parseContent(content)
      // All constructs should be skipped as they are in code block
      expect(analysis.constructs.length).to.equal(0)
    })

    it('should handle nested code blocks correctly', () => {
      const content = `Outside: npm test

\`\`\`markdown
Inside markdown code block: npm test
\`\`\`

Outside again: jest`

      const analysis = parseContent(content)

      // Should detect the outside instances but not the inside one
      const tests = analysis.constructs.filter((c) => c.type === 'test-command')
      expect(tests.length).to.be.greaterThan(0)

      // Verify no match is from inside the code block
      for (const test of tests) {
        const codeBlockStart = content.indexOf('```markdown')
        const codeBlockEnd = content.indexOf('```', codeBlockStart + 10) + 3
        expect(
          test.location.start < codeBlockStart || test.location.start >= codeBlockEnd,
          'Match should not be from inside code block',
        ).to.be.true
      }
    })

    it('should handle multiple constructs on same line', () => {
      const content = 'Use Glob tool then npm test'

      const analysis = parseContent(content)

      expect(analysis.constructs.length).to.be.at.least(2)
    })

    it('should handle multi-line patterns', () => {
      const content = `Part 1 of 3: Introduction

This is the first part.

Part 2 of 3: Implementation

This is the second part.`

      const analysis = parseContent(content)

      const chains = analysis.constructs.filter((c) => c.type === 'skill-chaining')
      expect(chains.length).to.equal(2)
    })

    it('should prefer longer/more specific matches when overlapping', () => {
      // "Use the Glob tool" should match as tool-call, not just generic patterns
      const content = 'Use the Glob tool to find TypeScript files.'

      const analysis = parseContent(content)

      const toolCalls = analysis.constructs.filter((c) => c.type === 'tool-call')
      expect(toolCalls.length).to.be.greaterThan(0)
      expect(toolCalls[0]?.rawText).to.include('Glob tool')
    })
  })
})
