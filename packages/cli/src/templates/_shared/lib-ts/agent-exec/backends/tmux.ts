/**
 * Tmux execution backend — runs CLI agents in visible tmux panes
 * with sentinel-file-based output capture.
 *
 * Self-contained tmux interaction — does not depend on tmux-driver.ts
 * or the pane launcher stack (those are consolidated into the `aiw` CLI).
 */

import * as fs from "node:fs";
import path from "node:path";

import {
  buildShellCaptureScript,
  cleanupSentinelIpc,
  createSentinelIpcPaths,
  readSentinelExitCode,
  readTextIfExists,
  waitForSentinelFile,
} from "../../runtime/sentinel-ipc.js";
import { execFileAsync, findExecutable } from "../../runtime/subprocess-utils.js";
import type { ExecutionBackend, ExecutionRequest, ExecutionResult } from "../execution-backend.js";

export interface TmuxBackendOptions {
  splitFlag?: string;
  splitTarget?: string;
}

function quoteForSh(input: string): string {
  return `'${input.replaceAll("'", "'\"'\"'")}'`;
}

function normalizeSplitFlag(value: string | undefined): "-h" | "-v" {
  return value?.trim() === "-v" ? "-v" : "-h";
}

export class TmuxBackend implements ExecutionBackend {
  private options: TmuxBackendOptions;

  constructor(options?: TmuxBackendOptions) {
    this.options = options ?? {};
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!process.env.TMUX) {
      return {
        stdout: "",
        stderr: "tmux pane launch failed: TMUX is not set",
        exitCode: 1,
        killed: false,
        signal: null,
      };
    }

    const tmuxPath = findExecutable("tmux");
    if (!tmuxPath) {
      return {
        stdout: "",
        stderr: "tmux pane launch failed: tmux not found on PATH",
        exitCode: 1,
        killed: false,
        signal: null,
      };
    }

    const agentName = path.basename(request.cliPath).replace(/\.[^.]+$/, "");
    const ipc = createSentinelIpcPaths(`aiwcli-agent-${agentName}`);

    try {
      fs.writeFileSync(ipc.inputPath, request.input, "utf8");

      const envEntries = Object.entries(request.env).filter(
        ([, value]) => value !== undefined,
      ) as Array<[string, string]>;
      const envPrefix = envEntries
        .map(([key, value]) => `${key}=${quoteForSh(value)}`)
        .join(" ");

      const quotedArgs = request.args.map((arg) => quoteForSh(arg)).join(" ");
      const command = `${envPrefix} ${quoteForSh(request.cliPath)} ${quotedArgs}`.trim();
      const script = buildShellCaptureScript(command, ipc, quoteForSh);

      const splitFlag = normalizeSplitFlag(this.options.splitFlag);
      const tmuxArgs = ["split-window", splitFlag, "-P", "-F", "#{pane_id}"];
      if (this.options.splitTarget) {
        tmuxArgs.push("-t", this.options.splitTarget);
      }
      tmuxArgs.push(`bash -lc ${quoteForSh(script)}`);

      const split = await execFileAsync(tmuxPath, tmuxArgs, { timeout: 5000 });
      if (split.exitCode !== 0) {
        return {
          stdout: "",
          stderr: `tmux pane launch failed: ${split.stderr.trim()}`,
          exitCode: 1,
          killed: false,
          signal: null,
        };
      }

      const paneId = split.stdout.trim().split(/\r?\n/).pop() ?? "";
      const finished = await waitForSentinelFile(ipc.sentinelPath, request.timeoutMs);

      if (!finished) {
        if (paneId) {
          await execFileAsync(tmuxPath, ["kill-pane", "-t", paneId], { timeout: 3000 });
        }
        return {
          stdout: "",
          stderr: "",
          exitCode: -1,
          killed: true,
          signal: "SIGTERM",
        };
      }

      const exitCode = readSentinelExitCode(ipc.sentinelPath, 1);
      const stdout = readTextIfExists(ipc.stdoutPath);
      const stderr = readTextIfExists(ipc.stderrPath);

      if (request.outputFilePath && fs.existsSync(request.outputFilePath)) {
        return {
          stdout: fs.readFileSync(request.outputFilePath, "utf8"),
          stderr,
          exitCode,
          killed: false,
          signal: null,
        };
      }

      return { stdout, stderr, exitCode, killed: false, signal: null };
    } finally {
      cleanupSentinelIpc(ipc);
    }
  }
}


