import {promises as fs} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {type ContextFixture, createContextFixture} from './fixtures/context-fixture.js'
import {runHookSubprocess} from './harness/hook-subprocess.js'
import {hookEnv} from './harness/hook-env.js'
import {bunOnlyPathEnv} from './harness/path-env.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ARCHIVE_PLAN_HOOK = resolve(TEST_DIR, '../../../../.aiwcli/_core/hooks-ts/archive_plan.ts')

function archiveInput(
  sessionId: string,
  cwd: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hook_event_name: 'PermissionRequest',
    tool_name: 'ExitPlanMode',
    cwd,
    session_id: sessionId,
    ...overrides,
  }
}

describe('archive_plan hook integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('archives an existing plan file into the context plans folder', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'archive-plan-existing',
    })
    fixtures.push(fixture)

    const sourcePlanPath = join(fixture.projectRoot, 'source-plan.md')
    const sourcePlanContent = '# Plan\n\n- Add subprocess tests\n'
    await fs.writeFile(sourcePlanPath, sourcePlanContent, 'utf8')

    const result = await runHookSubprocess(
      ARCHIVE_PLAN_HOOK,
      archiveInput('archive-plan-existing', fixture.projectRoot, {
        tool_result: `Your plan has been saved to: ${sourcePlanPath}`,
      }),
      hookEnv(fixture, 'archive-plan-existing', bunOnlyPathEnv()),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()

    const plansDir = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'plans',
    )
    const archivedFiles = (await fs.readdir(plansDir)).filter((name) => name.endsWith('.md'))
    expect(archivedFiles.length).toBeGreaterThan(0)

    const archivedContent = await fs.readFile(join(plansDir, archivedFiles[0] ?? ''), 'utf8')
    expect(archivedContent).toBe(sourcePlanContent)
  })

  it('no-ops when no plan file can be found', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'archive-plan-missing',
    })
    fixtures.push(fixture)

    const missingPath = join(fixture.projectRoot, 'missing-plan.md')
    const result = await runHookSubprocess(
      ARCHIVE_PLAN_HOOK,
      archiveInput('archive-plan-missing', fixture.projectRoot, {
        tool_result: `Your plan has been saved to: ${missingPath}`,
      }),
      hookEnv(fixture, 'archive-plan-missing', bunOnlyPathEnv()),
    )

    expect(result.exitCode).toBe(0)
    expect(result.parsedOutput).toBeNull()

    const plansDir = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'plans',
    )
    const archivedFiles = (await fs.readdir(plansDir)).filter((name) => name.endsWith('.md'))
    expect(archivedFiles).toEqual([])
  })

  it('runs only for PermissionRequest ExitPlanMode events', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'archive-plan-event-match',
    })
    fixtures.push(fixture)

    const sourcePlanPath = join(fixture.projectRoot, 'event-mismatch-plan.md')
    await fs.writeFile(sourcePlanPath, '# Plan\n\n- should not archive on mismatch\n', 'utf8')

    const wrongToolResult = await runHookSubprocess(
      ARCHIVE_PLAN_HOOK,
      {
        hook_event_name: 'PermissionRequest',
        tool_name: 'Write',
        cwd: fixture.projectRoot,
        session_id: 'archive-plan-event-match',
        tool_result: `Your plan has been saved to: ${sourcePlanPath}`,
      },
      hookEnv(fixture, 'archive-plan-event-match', bunOnlyPathEnv()),
    )

    expect(wrongToolResult.exitCode).toBe(0)
    expect(wrongToolResult.parsedOutput).toBeNull()

    const plansDir = join(
      fixture.projectRoot,
      '_output',
      'contexts',
      fixture.contextId,
      'plans',
    )
    const archivedFiles = (await fs.readdir(plansDir)).filter((name) => name.endsWith('.md'))
    expect(archivedFiles).toEqual([])
  })
})
