/**
 * Re-export shim — BaseCliAgent now lives in _shared/lib-ts/base/base-agent.ts.
 * This file preserves all existing import paths for provider implementations.
 */

export { BaseCliAgent, type AgentExecutionConfig, type AgentDebugLogger } from "../../../../../_shared/lib-ts/base/base-agent.js";
export type { ExecutionResult as ExecResult } from "../../../../../_shared/lib-ts/base/execution-backend.js";
