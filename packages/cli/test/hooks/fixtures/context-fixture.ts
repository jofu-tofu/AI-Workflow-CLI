import {createHash, randomUUID} from 'node:crypto'
import {promises as fs, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export interface ContextFixtureOptions {
  contextId?: string
  mode?: 'idle' | 'active' | 'has_staged_work'
  sessionId?: string
  planContent?: string
  handoffPath?: string
  tasks?: Array<{id: string; subject: string; status: string}>
  workConsumed?: boolean
  nextArtifactType?: 'plan' | 'handoff'
}

export interface ContextFixture {
  projectRoot: string
  contextId: string
  getState(): Record<string, unknown>
  getIndex(): Record<string, unknown>
  cleanup(): Promise<void>
}

function nowIso(): string {
  return new Date().toISOString()
}

function createTask(task: {id: string; status: string; subject: string}): Record<string, unknown> {
  return {
    active_form: task.subject,
    completed_at: null,
    created_at: nowIso(),
    description: '',
    evidence: '',
    files_changed: [],
    id: task.id,
    status: task.status,
    subject: task.subject,
    work_summary: '',
  }
}

export async function createContextFixture(
  opts: ContextFixtureOptions = {},
): Promise<ContextFixture> {
  const fixtureRoot = join(tmpdir(), `aiwcli-hook-fixture-${randomUUID()}`)
  const contextId = opts.contextId ?? `ctx-${randomUUID()}`
  const sessionId = opts.sessionId ?? `session-${randomUUID()}`
  const timestamp = nowIso()

  const outputRoot = join(fixtureRoot, '_output')
  const contextRoot = join(outputRoot, 'contexts', contextId)
  const statePath = join(contextRoot, 'state.json')
  const indexPath = join(outputRoot, 'index.json')
  const planPath = join(contextRoot, 'plans', 'plan.md')

  await fs.mkdir(join(fixtureRoot, '.aiwcli'), {recursive: true})
  await fs.mkdir(join(contextRoot, 'notes'), {recursive: true})
  await fs.mkdir(join(contextRoot, 'plans'), {recursive: true})

  if (opts.planContent) {
    await fs.writeFile(planPath, opts.planContent, 'utf8')
  }

  const planHash = opts.planContent
    ? createHash('sha256').update(opts.planContent).digest('hex')
    : null

  const defaultNextArtifactType = opts.planContent
    ? 'plan'
    : (opts.handoffPath ? 'handoff' : null)

  const state: Record<string, unknown> = {
    created_at: timestamp,
    handoff_path: opts.handoffPath ?? null,
    id: contextId,
    last_active: timestamp,
    last_session: null,
    method: 'test',
    mode: opts.mode ?? 'idle',
    next_artifact_type: opts.nextArtifactType ?? defaultNextArtifactType,
    plan_anchors: [],
    plan_hash: planHash,
    plan_hash_consumed: null,
    plan_id: null,
    plan_path: opts.planContent ? planPath : null,
    plan_signature: null,
    session_ids: [sessionId],
    status: 'active',
    summary: 'Test context fixture',
    tags: ['test'],
    tasks: (opts.tasks ?? []).map(createTask),
    work_consumed: opts.workConsumed ?? false,
  }

  const index: Record<string, unknown> = {
    contexts: {
      [contextId]: {
        last_active: timestamp,
        mode: state.mode,
        summary: state.summary,
      },
    },
    sessions: {
      [sessionId]: contextId,
    },
    updated_at: timestamp,
    version: '3.0',
  }

  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8')

  return {
    projectRoot: fixtureRoot,
    contextId,
    getState(): Record<string, unknown> {
      return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
    },
    getIndex(): Record<string, unknown> {
      return JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, unknown>
    },
    async cleanup(): Promise<void> {
      await fs.rm(fixtureRoot, {force: true, recursive: true})
    },
  }
}
