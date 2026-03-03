import {existsSync, readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

function quoteForShell(value: string): string {
  return `"${value.replaceAll('"', String.raw`\\"`)}"`
}

export function getCliRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))

  for (let i = 0; i < 10; i += 1) {
    const pkgPath = join(current, 'package.json')
    const binPath = join(current, 'bin', 'dev.js')
    if (existsSync(pkgPath) && existsSync(binPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {name?: string}
        if (pkg.name === 'aiwcli') return current
      } catch {
        // Keep scanning upwards.
      }
    }

    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }

  throw new Error('Unable to locate packages/cli root from test helper')
}

export function getCliBinJsPath(): string {
  return join(getCliRoot(), 'bin', 'dev.js')
}

export function getCliInvokePrefix(): string {
  return [
    quoteForShell(process.execPath),
    '--no-deprecation',
    '--loader',
    'ts-node/esm',
    '--disable-warning=ExperimentalWarning',
    quoteForShell(getCliBinJsPath()),
  ].join(' ')
}

export function cliCommand(args = ''): string {
  const prefix = getCliInvokePrefix()
  return args ? `${prefix} ${args}` : prefix
}
