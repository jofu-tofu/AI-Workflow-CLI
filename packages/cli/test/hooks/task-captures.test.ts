import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, it} from 'vitest'

import {createContextFixture, type ContextFixture} from './fixtures/context-fixture.js'
import {runHookSubprocess} from './harness/hook-subprocess.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const TASK_CREATE_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/task_create_capture.ts',
)
const TASK_UPDATE_HOOK = resolve(
  TEST_DIR,
  '../../../../.aiwcli/_core/hooks-ts/task_update_capture.ts',
)

function hookEnv(fixture: ContextFixture, sessionId: string): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: fixture.projectRoot,
    CLAUDE_SESSION_ID: sessionId,
  }
}

function readTasks(fixture: ContextFixture): Array<Record<string, unknown>> {
  const state = fixture.getState()
  const tasks = state.tasks
  return Array.isArray(tasks) ? (tasks as Array<Record<string, unknown>>) : []
}

describe('task capture hooks integration', () => {
  const fixtures: ContextFixture[] = []

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()
      if (!fixture) continue
      await fixture.cleanup()
    }
  })

  it('persists a valid TaskCreate payload to context state', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-create-valid',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_CREATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        cwd: fixture.projectRoot,
        session_id: 'task-create-valid',
        tool_input: {
          activeForm: 'writing tests',
          description: 'Create hook integration tests',
          subject: 'Implement phase 7 test coverage',
        },
      },
      hookEnv(fixture, 'task-create-valid'),
    )

    expect(result.exitCode).toBe(0)
    const tasks = readTasks(fixture)
    expect(tasks.length).toBe(1)
    expect(tasks[0]?.subject).toBe('Implement phase 7 test coverage')
    expect(tasks[0]?.id).toBe('aiw-1')
  })

  it('no-ops when TaskCreate subject is missing', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-create-missing-subject',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_CREATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        cwd: fixture.projectRoot,
        session_id: 'task-create-missing-subject',
        tool_input: {
          description: 'No subject should skip persistence',
        },
      },
      hookEnv(fixture, 'task-create-missing-subject'),
    )

    expect(result.exitCode).toBe(0)
    expect(readTasks(fixture)).toHaveLength(0)
  })

  it('no-ops when TaskCreate session is not bound to a context', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-create-bound-session',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_CREATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        cwd: fixture.projectRoot,
        session_id: 'task-create-missing-session',
        tool_input: {
          subject: 'Should not persist',
        },
      },
      hookEnv(fixture, 'task-create-missing-session'),
    )

    expect(result.exitCode).toBe(0)
    expect(readTasks(fixture)).toHaveLength(0)
  })

  it('respects metadata.skip_persistence for TaskCreate', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-create-skip',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_CREATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        cwd: fixture.projectRoot,
        session_id: 'task-create-skip',
        tool_input: {
          metadata: {skip_persistence: true},
          subject: 'Skipped task',
        },
      },
      hookEnv(fixture, 'task-create-skip'),
    )

    expect(result.exitCode).toBe(0)
    expect(readTasks(fixture)).toHaveLength(0)
  })

  it('ignores TaskCreate payload when event type does not match PostToolUse', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-create-wrong-event',
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_CREATE_HOOK,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskCreate',
        cwd: fixture.projectRoot,
        session_id: 'task-create-wrong-event',
        tool_input: {
          subject: 'Should be ignored',
        },
      },
      hookEnv(fixture, 'task-create-wrong-event'),
    )

    expect(result.exitCode).toBe(0)
    expect(readTasks(fixture)).toHaveLength(0)
  })

  it('persists valid TaskUpdate changes to an existing task', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-update-valid',
      tasks: [{id: 'aiw-1', status: 'pending', subject: 'Review hook coverage'}],
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_UPDATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        cwd: fixture.projectRoot,
        session_id: 'task-update-valid',
        tool_input: {
          metadata: {
            evidence: 'Added integration test assertions',
            files_changed: ['packages/cli/test/hooks/task-captures.test.ts'],
            persistent_id: 'aiw-1',
            work_summary: 'Updated update-path assertions',
          },
          status: 'in_progress',
          taskId: 'ephemeral-1',
        },
      },
      hookEnv(fixture, 'task-update-valid'),
    )

    expect(result.exitCode).toBe(0)

    const tasks = readTasks(fixture)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.status).toBe('in_progress')
    expect(tasks[0]?.work_summary).toBe('Updated update-path assertions')
    expect(tasks[0]?.session_id).toBe('task-update-valid')
  })

  it('no-ops on TaskUpdate when persistent task id is invalid', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-update-invalid-id',
      tasks: [{id: 'aiw-1', status: 'pending', subject: 'Existing task'}],
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_UPDATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        cwd: fixture.projectRoot,
        session_id: 'task-update-invalid-id',
        tool_input: {
          metadata: {
            persistent_id: 'aiw-999',
          },
          status: 'in_progress',
          taskId: 'ephemeral-2',
        },
      },
      hookEnv(fixture, 'task-update-invalid-id'),
    )

    expect(result.exitCode).toBe(0)
    const tasks = readTasks(fixture)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.status).toBe('pending')
  })

  it('sets completed_at when TaskUpdate transitions a task to completed', async () => {
    const fixture = await createContextFixture({
      mode: 'active',
      sessionId: 'task-update-complete',
      tasks: [{id: 'aiw-1', status: 'in_progress', subject: 'Finish hook integration tests'}],
    })
    fixtures.push(fixture)

    const result = await runHookSubprocess(
      TASK_UPDATE_HOOK,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        cwd: fixture.projectRoot,
        session_id: 'task-update-complete',
        tool_input: {
          metadata: {
            persistent_id: 'aiw-1',
          },
          status: 'completed',
          taskId: 'ephemeral-3',
        },
      },
      hookEnv(fixture, 'task-update-complete'),
    )

    expect(result.exitCode).toBe(0)
    const task = readTasks(fixture)[0]
    expect(task?.status).toBe('completed')
    expect(typeof task?.completed_at).toBe('string')
    expect(String(task?.completed_at ?? '').length).toBeGreaterThan(0)
  })
})

