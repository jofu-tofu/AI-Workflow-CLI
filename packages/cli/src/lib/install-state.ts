import {promises as fs} from 'node:fs'

import {IdePathResolver} from './ide-path-resolver.js'
import {readJsonFile, writeJsonFile} from './json-io.js'
import {pathExists} from './paths.js'

const CORE_RUNTIME_FOLDERS = new Set(['_core'])
const RESERVED_AIWCLI_FOLDERS = new Set(['_output', 'state', ...CORE_RUNTIME_FOLDERS])

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
  const parsed = await readJsonFile<InstallState>(statePath)
  if (!parsed || parsed.version !== VERSION || !parsed.core || !parsed.methods || !parsed.ides) return undefined
  return parsed
}

export async function writeInstallState(targetDir: string, state: InstallState): Promise<void> {
  const statePath = new IdePathResolver(targetDir).getInstallStatePath()
  await writeJsonFile(statePath, state)
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
      installed: await hasLegacyCoreRuntime(targetDir),
      assetVersion: 'v1',
      installedAt: now,
    },
    methods: await discoverLegacyMethods(targetDir, now),
    ides: {},
  }
  return initial
}

export async function markCoreInstalled(targetDir: string, ides: string[]): Promise<void> {
  const state = await ensureInstallState(targetDir)
  const now = new Date().toISOString()
  await backfillMissingMethodsFromDisk(targetDir, state, now)
  state.core = {installed: true, assetVersion: 'v1', installedAt: now}
  for (const ide of ides) {
    state.ides[ide] = {managed: true}
  }

  state.updatedAt = now
  await writeInstallState(targetDir, state)
}

export async function markCoreRemoved(targetDir: string): Promise<void> {
  const state = await readInstallState(targetDir)
  if (!state) return
  state.core.installed = false
  state.updatedAt = new Date().toISOString()
  await writeInstallState(targetDir, state)
}

export async function markMethodInstalled(targetDir: string, method: string, ides: string[]): Promise<void> {
  const state = await ensureInstallState(targetDir)
  const now = new Date().toISOString()
  await backfillMissingMethodsFromDisk(targetDir, state, now)

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
  const now = new Date().toISOString()
  await backfillMissingMethodsFromDisk(targetDir, state, now)
  if (method in state.methods) {
    delete state.methods[method]
    state.updatedAt = now
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

export async function getInstalledMethods(targetDir: string): Promise<string[]> {
  const installed = await getInstalledMethodsFromState(targetDir)
  if (installed.length > 0) return installed
  return discoverLegacyMethodNames(targetDir)
}

export async function deleteInstallStateIfPresent(targetDir: string): Promise<void> {
  const resolver = new IdePathResolver(targetDir)
  const stateDir = resolver.getAiwcliStateDir()
  const statePath = resolver.getInstallStatePath()
  if (!(await pathExists(statePath))) return
  await fs.rm(statePath, {force: true})

  try {
    if ((await fs.readdir(stateDir)).length === 0) await fs.rmdir(stateDir)
  } catch {
    // Ignore cleanup errors for missing/non-empty state directories.
  }
}

async function backfillMissingMethodsFromDisk(targetDir: string, state: InstallState, installedAt: string): Promise<void> {
  const discoveredMethods = await discoverLegacyMethods(targetDir, installedAt)
  for (const [method, methodState] of Object.entries(discoveredMethods)) {
    state.methods[method] ??= methodState
  }
}

async function discoverLegacyMethods(targetDir: string, installedAt: string): Promise<Record<string, MethodState>> {
  const methodNames = await discoverLegacyMethodNames(targetDir)
  return Object.fromEntries(
    methodNames.map((method) => [method, {
      installed: true,
      installedAt,
      ides: [],
      runtimePaths: [`.aiwcli/_${method}`],
      idePaths: [],
    }]),
  )
}

async function discoverLegacyMethodNames(targetDir: string): Promise<string[]> {
  const containerDir = new IdePathResolver(targetDir).getAiwcliContainer()
  try {
    const entries = await fs.readdir(containerDir, {withFileTypes: true})
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('_') && !RESERVED_AIWCLI_FOLDERS.has(entry.name))
      .map((entry) => entry.name.slice(1))
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

async function hasLegacyCoreRuntime(targetDir: string): Promise<boolean> {
  const resolver = new IdePathResolver(targetDir)
  return pathExists(resolver.getCoreFolder())
}

function ideRootPaths(ide: string, method: string): string[] {
  if (ide === 'claude') return [`.claude/commands/${method}`, `.claude/agents/${method}`]
  if (ide === 'codex') return []
  if (ide === 'windsurf') return [`.windsurf/workflows/${method}`]
  return [`.${ide}/${method}`]
}
