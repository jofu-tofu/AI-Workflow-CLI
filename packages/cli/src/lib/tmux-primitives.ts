import * as os from 'node:os'
import path from 'node:path'

export {quoteForSh} from './shell-quoting.js'

/** Fixed tmux server socket. Multiple named sessions share one server. */
export const TMUX_SOCKET_PATH = path.join(os.tmpdir(), 'aiwcli-tmux.sock')

/** Convert Windows path to MSYS2 POSIX path for tmux args. C:\foo\bar → /c/foo/bar */
export function toMsysPosixPath(winPath: string): string {
  if (process.platform !== 'win32') return winPath
  const normalized = winPath.replaceAll('\\', '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)/u)
  if (!match) return normalized
  return `/${match[1]!.toLowerCase()}/${match[2]!}`
}

