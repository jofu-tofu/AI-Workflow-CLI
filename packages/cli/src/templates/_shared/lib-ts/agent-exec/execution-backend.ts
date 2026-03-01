/**
 * Execution backend interfaces for CLI agent subprocess invocations.
 * Decouples agent logic (prompt building, output parsing) from execution
 * strategy (headless subprocess vs tmux pane).
 */

// ---------------------------------------------------------------------------
// Execution Request / Result
// ---------------------------------------------------------------------------

/** Request to execute a CLI subprocess. */
export interface ExecutionRequest {
  cliPath: string;
  args: string[];
  input: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
  /** If set, read output from this file instead of stdout (Codex pattern). */
  outputFilePath?: string;
  maxBuffer?: number;
  shell?: boolean;
}

/** Result from a CLI subprocess execution. */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  killed: boolean;
  signal: string | null;
}

// ---------------------------------------------------------------------------
// Execution Backend
// ---------------------------------------------------------------------------

/** Strategy interface for running CLI agent subprocesses. */
export interface ExecutionBackend {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

// ---------------------------------------------------------------------------
// Debug Logger
// ---------------------------------------------------------------------------

/** Injectable debug logger for agents running in _shared context. */
export interface AgentDebugLogger {
  log(contextPath: string, sessionName: string, component: string, message: string, data?: unknown): void;
  raw(contextPath: string, sessionName: string, component: string, label: string, raw: string): void;
}
