/**
 * Tmux execution backend — runs CLI agents in visible tmux panes
 * with sentinel-file-based output capture.
 *
 * Delegates pane management to tmux-driver.ts primitives. Does NOT use
 * launchDriverInTmuxOrFallback() because fallback is the caller's concern,
 * not the backend's.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { execFileAsync } from "../../base/subprocess-utils.js";
import { getTmuxAvailability, quoteForSh, normalizeSplitFlag } from "../../base/tmux-driver.js";
import type { ExecutionBackend, ExecutionRequest, ExecutionResult } from "../execution-backend.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TmuxBackendOptions {
  splitFlag?: string;
  splitTarget?: string;
}

export class TmuxBackend implements ExecutionBackend {
  private options: TmuxBackendOptions;

  constructor(options?: TmuxBackendOptions) {
    this.options = options ?? {};
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const tmux = getTmuxAvailability();
    if (!tmux.available || !tmux.tmuxPath) {
      return {
        stdout: "",
        stderr: `tmux pane launch failed: ${tmux.reason ?? "tmux unavailable"}`,
        exitCode: 1,
        killed: false,
        signal: null,
      };
    }

    // Create temp directory for IPC files
    const agentName = path.basename(request.cliPath).replace(/\.[^.]+$/, "");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `aiwcli-agent-${agentName}-`));

    const promptPath = path.join(tmpDir, "prompt.txt");
    const stdoutPath = path.join(tmpDir, "stdout.txt");
    const stderrPath = path.join(tmpDir, "stderr.txt");
    const sentinelPath = path.join(tmpDir, "sentinel.txt");

    try {
      // Write prompt to file for stdin redirection
      fs.writeFileSync(promptPath, request.input, "utf-8");

      // Build env prefix
      const envEntries = Object.entries(request.env).filter(
        ([, v]) => v !== undefined,
      ) as Array<[string, string]>;
      const envPrefix = envEntries
        .map(([k, v]) => `${k}=${quoteForSh(v)}`)
        .join(" ");

      // Build command
      const quotedArgs = request.args.map((a) => quoteForSh(a)).join(" ");
      const script = [
        `${envPrefix} ${quoteForSh(request.cliPath)} ${quotedArgs}`,
        `< ${quoteForSh(promptPath)}`,
        `> ${quoteForSh(stdoutPath)}`,
        `2> ${quoteForSh(stderrPath)}`,
        `; echo $? > ${quoteForSh(sentinelPath)}`,
      ].join(" ");

      // Launch tmux pane
      const splitFlag = normalizeSplitFlag(this.options.splitFlag);
      const tmuxArgs = ["split-window", splitFlag, "-P", "-F", "#{pane_id}"];
      if (this.options.splitTarget) {
        tmuxArgs.push("-t", this.options.splitTarget);
      }
      tmuxArgs.push(`bash -lc ${quoteForSh(script)}`);

      const split = await execFileAsync(tmux.tmuxPath, tmuxArgs, { timeout: 5000 });
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

      // Poll for sentinel file
      const deadline = Date.now() + request.timeoutMs;
      while (Date.now() < deadline) {
        if (fs.existsSync(sentinelPath)) break;
        await sleep(250);
      }

      if (!fs.existsSync(sentinelPath)) {
        // Timeout: kill pane
        if (paneId) {
          await execFileAsync(tmux.tmuxPath, ["kill-pane", "-t", paneId], { timeout: 3000 });
        }
        return {
          stdout: "",
          stderr: "",
          exitCode: -1,
          killed: true,
          signal: "SIGTERM",
        };
      }

      // Read results
      const exitCode = parseInt(fs.readFileSync(sentinelPath, "utf-8").trim(), 10) || 1;
      const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, "utf-8") : "";
      const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf-8") : "";

      // If outputFilePath specified and exists, read from it instead
      if (request.outputFilePath && fs.existsSync(request.outputFilePath)) {
        return {
          stdout: fs.readFileSync(request.outputFilePath, "utf-8"),
          stderr,
          exitCode,
          killed: false,
          signal: null,
        };
      }

      return { stdout, stderr, exitCode, killed: false, signal: null };
    } finally {
      // Clean up temp dir
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
