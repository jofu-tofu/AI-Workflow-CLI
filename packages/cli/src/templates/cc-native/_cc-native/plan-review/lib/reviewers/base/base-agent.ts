/**
 * Re-export shim — BaseCliAgent now lives in _shared/lib-ts/agent-exec/base-agent.ts.
 * This file preserves all existing import paths for provider implementations.
 */

export { BaseCliAgent, type AgentExecutionConfig, type AgentDebugLogger } from "../../../../../_shared/lib-ts/agent-exec/base-agent.js";
export type { ExecutionResult as ExecResult } from "../../../../../_shared/lib-ts/agent-exec/execution-backend.js";
