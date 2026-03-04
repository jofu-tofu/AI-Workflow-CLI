import {promises as fs} from 'node:fs'

import {IdePathResolver} from './ide-path-resolver.js'
import {pathExists} from './paths.js'

interface CoreState {
  assetVersion: string
  installed: boolean
  installedAt: string
}

interface IdeState {
  managed: boolean
}

interface MethodState {
  idePaths: string[]
  ides: string[]
  installed: boolean
  installedAt: string
  runtimePaths: string[]
}

export interface InstallState {
  core: CoreState
  ides: Record<string, IdeState>
  initializedAt: string
  methods: Record<string, MethodState>
  updatedAt: string
  version: 1
}

const VERSION = 1 as const

export async function readInstallState(targetDir: string): Promise<InstallState | undefined> {
  const statePath = new IdePathResolver(targetDir).getInstallStatePath()
  try {
    const content = await fs.readFile(statePath, 'utf8')
    const parsed = JSON.parse(content) as InstallState
    if (parsed.version !== VERSION || !parsed.core || !parsed.methods || !parsed.ides) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export async function writeInstallState(targetDir: string, state: InstallState): Promise<void> {
  const resolver = new IdePathResolver(targetDir)
  const statePath = resolver.getInstallStatePath()
  await fs.mkdir(resolver.getAiwcliStateDir(), {recursive: true})
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
}

export async function ensureInstallState(targetDir: string): Promise<InstallState> {
  const existing = await readInstallState(targetDir)
  if (existing) return existing

  const now = new Date().toISOString()
  const initial: InstallState = {
    version: VERSION,
    initializedAt: now,
    updatedAt: now,
    core: {
      installed: false,
      assetVersion: 'v1',
      installedAt: now,
    },
    methods: {},
    ides: {},
  }
  return initial
}

export async function markCoreInstalled(targetDir: string, ides: string[]): Promise<void> {
  const state = await ensureInstallState(targetDir)
  const now = new Date().toISOString()
  state.core = {installed: true, assetVersion: 'v1', installedAt: now}
  for (const ide of ides) {
    state.ides[ide] = {managed: true}
  }

  state.updatedAt = now
  await writeInstallState(targetDir, state)
}

export async function markCoreRemoved(targetDir: string): Promise<void> {
  const state = await ensureInstallState(targetDir)
  state.core.installed = false
  state.updatedAt = new Date().toISOString()
  await writeInstallState(targetDir, state)
}

export async function markMethodInstalled(targetDir: string, method: string, ides: string[]): Promise<void> {
  const state = await ensureInstallState(targetDir)
  const now = new Date().toISOString()

  state.methods[method] = {
    installed: true,
    installedAt: now,
    ides: [...ides],
    runtimePaths: [`.aiwcli/_${method}`],
    idePaths: ides.flatMap((ide) => ideRootPaths(ide, method)),
  }
  for (const ide of ides) {
    state.ides[ide] = {managed: true}
  }

  state.updatedAt = now
  await writeInstallState(targetDir, state)
}

export async function markMethodRemoved(targetDir: string, method: string): Promise<void> {
  const state = await ensureInstallState(targetDir)
  if (method in state.methods) {
    delete state.methods[method]
    state.updatedAt = new Date().toISOString()
    await writeInstallState(targetDir, state)
  }
}

export async function getInstalledMethodsFromState(targetDir: string): Promise<string[]> {
  const state = await readInstallState(targetDir)
  if (!state) return []
  return Object.entries(state.methods)
    .filter(([, methodState]) => methodState.installed)
    .map(([name]) => name)
}

export async function deleteInstallStateIfPresent(targetDir: string): Promise<void> {
  const resolver = new IdePathResolver(targetDir)
  const statePath = resolver.getInstallStatePath()
  if (!(await pathExists(statePath))) return
  await fs.rm(statePath, {force: true})
}

function ideRootPaths(ide: string, method: string): string[] {
  if (ide === 'claude') return [`.claude/commands/${method}`, `.claude/agents/${method}`]
  if (ide === 'codex') return [`.codex/workflows/${method}`]
  if (ide === 'windsurf') return [`.windsurf/workflows/${method}`]
  return [`.${ide}/${method}`]
}
