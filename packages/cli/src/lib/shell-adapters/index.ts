export {BashAdapter} from './bash-adapter.js'
export {PowerShellAdapter} from './powershell-adapter.js'
export type {SentinelWrapOptions, ShellAdapter, ToolCommandParams} from './shell-adapter.js'

import type {ShellAdapter} from './shell-adapter.js'
import {BashAdapter} from './bash-adapter.js'
import {PowerShellAdapter} from './powershell-adapter.js'

export function shellAdapterForBackend(backend: string): ShellAdapter {
  return backend === 'psmux' ? new PowerShellAdapter() : new BashAdapter()
}
