import * as os from "node:os";
import * as path from "node:path";

/** Fixed tmux server socket. Multiple named sessions share one server. */
export const TMUX_SOCKET_PATH = path.join(os.tmpdir(), "aiwcli-tmux.sock");

/** Convert Windows path to MSYS2 POSIX path for tmux args. C:\foo\bar → /c/foo/bar */
export function toMsysPosixPath(winPath: string): string {
  if (process.platform !== "win32") return winPath;
  const normalized = winPath.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (!match) return normalized;
  return `/${match[1]!.toLowerCase()}/${match[2]!}`;
}

/** Shell-safe single-quote escaping for bash command strings. */
export function quoteForSh(input: string): string {
  return `'${input.replaceAll("'", "'\"'\"'")}'`;
}
