/**
 * Headless execution backend — wraps execFileAsync() for subprocess execution.
 * Default backend for all CLI agents. If outputFilePath is specified and exists
 * after execution, reads output from file instead of stdout (Codex pattern).
 */

import * as fs from "node:fs";

import { execFileAsync } from "../../runtime/subprocess-utils.js";
import type { ExecutionBackend, ExecutionRequest, ExecutionResult } from "../execution-backend.js";

export class HeadlessBackend implements ExecutionBackend {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const result = await execFileAsync(request.cliPath, request.args, {
      input: request.input,
      timeout: request.timeoutMs,
      env: request.env,
      maxBuffer: request.maxBuffer ?? 10 * 1024 * 1024,
      shell: request.shell ?? (process.platform === "win32"),
    });

    // If outputFilePath specified and exists, read from file instead of stdout
    if (request.outputFilePath && fs.existsSync(request.outputFilePath)) {
      const fileContent = fs.readFileSync(request.outputFilePath, "utf8");
      return {
        ...result,
        stdout: fileContent,
      };
    }

    return result;
  }
}

