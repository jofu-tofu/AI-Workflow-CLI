import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

// last-verified: 2026-03-08
const KNOWN_TOOL_NAMES = new Set([
  'Write',
  'Read',
  'Bash',
  'Edit',
  'TaskCreate',
  'TaskUpdate',
  'ExitPlanMode',
  'Compact',
  'Glob',
  'Grep',
  'Agent',
  'NotebookEdit',
  'MultiTool',
  'WebSearch',
  'TodoRead',
  'TodoWrite',
  'WebFetch',
  'AskFollowupQuestion',
  'BrowserAction',
  'CodeReview',
  'ListFiles',
  'SearchFiles',
  'Task',
])

const KNOWN_HOOK_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'PermissionRequest',
  'Notification',
  'SubagentStart',
  'PostToolUseFailure',
])

function repoRoot(): string {
  const fromFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  if (existsSync(join(fromFile, 'packages', 'cli', 'src', 'lib', 'runtime', 'subprocess-utils.ts'))) return fromFile

  const cwd = resolve(process.cwd())
  if (existsSync(join(cwd, 'packages', 'cli', 'src', 'lib', 'runtime', 'subprocess-utils.ts'))) return cwd

  throw new Error('Unable to resolve repo root for tool-name contract tests')
}

/** Recursively collect all .ts files under a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath))
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Extract quoted string literals that appear near tool_name comparisons,
 * tool-name set definitions, or requirePersistenceContext calls.
 */
function extractToolNameReferences(content: string): string[] {
  const names: string[] = []

  // tool_name === "X" or tool_name !== "X"
  const toolNameComparisons = /tool_name\s*[!=]==?\s*["'](\w+)["']/g
  for (const match of content.matchAll(toolNameComparisons)) {
    names.push(match[1])
  }

  // "X" === tool_name or "X" !== tool_name
  const reverseToolNameComparisons = /["'](\w+)["']\s*[!=]==?\s*tool_name/g
  for (const match of content.matchAll(reverseToolNameComparisons)) {
    names.push(match[1])
  }

  // expectedTool comparisons: expectedTool === "X" or expectedTool !== "X"
  const expectedToolComparisons = /expectedTool\s*[!=]==?\s*["'](\w+)["']/g
  for (const match of content.matchAll(expectedToolComparisons)) {
    names.push(match[1])
  }

  // requirePersistenceContext("X", ...)
  const persistenceContext = /requirePersistenceContext\(\s*["'](\w+)["']/g
  for (const match of content.matchAll(persistenceContext)) {
    names.push(match[1])
  }

  // new Set(["X", "Y", ...]) where context indicates tool names (e.g., WRITE_TOOLS, TOOL)
  const toolSets = /(?:TOOL|_TOOLS)\s*=\s*new\s+Set\(\[([^\]]+)\]/g
  for (const match of content.matchAll(toolSets)) {
    const inner = match[1]
    const stringLiterals = /["'](\w+)["']/g
    for (const lit of inner.matchAll(stringLiterals)) {
      names.push(lit[1])
    }
  }

  // block.name comparisons in transcript parsing context
  const blockNameComparisons = /block\.name\s*[!=]==?\s*["'](\w+)["']/g
  for (const match of content.matchAll(blockNameComparisons)) {
    names.push(match[1])
  }

  return names
}

/** Extract quoted string literals near hook_event_name comparisons. */
function extractHookEventReferences(content: string): string[] {
  const events: string[] = []

  // hook_event_name === "X" or hook_event_name !== "X"
  const hookEventComparisons = /hook_event_name\s*[!=]==?\s*["'](\w+)["']/g
  for (const match of content.matchAll(hookEventComparisons)) {
    events.push(match[1])
  }

  // "X" === hook_event_name or "X" !== hook_event_name
  const reverseHookEventComparisons = /["'](\w+)["']\s*[!=]==?\s*hook_event_name/g
  for (const match of content.matchAll(reverseHookEventComparisons)) {
    events.push(match[1])
  }

  // validateHookEvent("X") or validateHookEvent('X')
  const validateHookEvent = /validateHookEvent\(\s*["'](\w+)["']/g
  for (const match of content.matchAll(validateHookEvent)) {
    events.push(match[1])
  }

  return events
}

describe('tool-name and hook-event contract tests', () => {
  const root = repoRoot()
  const scanDirs = [
    join(root, 'packages', 'cli', 'src', 'templates', 'core'),
    join(root, 'packages', 'cli', 'src', 'templates', 'cc-native'),
  ]

  const allFiles = scanDirs.flatMap((dir) => collectTsFiles(dir))

  it('scans at least one TypeScript file', () => {
    expect(allFiles.length).toBeGreaterThan(0)
  })

  it('every hardcoded tool name reference is in KNOWN_TOOL_NAMES', () => {
    const unknownToolNames: {file: string; name: string}[] = []

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, 'utf8')
      const refs = extractToolNameReferences(content)
      for (const name of refs) {
        if (!KNOWN_TOOL_NAMES.has(name)) {
          const relPath = filePath.replace(root + '/', '')
          unknownToolNames.push({file: relPath, name})
        }
      }
    }

    expect(unknownToolNames, `Unknown tool names found: ${JSON.stringify(unknownToolNames, null, 2)}`).toEqual([])
  })

  it('every hardcoded hook event reference is in KNOWN_HOOK_EVENTS', () => {
    const unknownHookEvents: {file: string; event: string}[] = []

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, 'utf8')
      const refs = extractHookEventReferences(content)
      for (const event of refs) {
        if (!KNOWN_HOOK_EVENTS.has(event)) {
          const relPath = filePath.replace(root + '/', '')
          unknownHookEvents.push({file: relPath, event})
        }
      }
    }

    expect(
      unknownHookEvents,
      `Unknown hook events found: ${JSON.stringify(unknownHookEvents, null, 2)}`,
    ).toEqual([])
  })
})
