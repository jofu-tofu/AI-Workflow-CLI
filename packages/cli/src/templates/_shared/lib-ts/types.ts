/**
 * Shared type definitions for the lib-ts library.
 * All field names use snake_case for JSON backward compatibility with state.json.
 * See SPEC.md §1 for full behavioral specification.
 */

// §1.1
export type Mode = "active" | "has_staged_work" | "idle";

export interface ContextState {
  created_at: string;
  /** @deprecated Use work_consumed instead */
  handoff_consumed?: boolean;
  handoff_path: null | string;
  id: string;
  last_active: string;
  last_session: LastSession | null;
  method: string;
  mode: Mode;
  next_artifact_type: "handoff" | "plan" | null;  // Explicit artifact type for has_staged_work mode
  plan_anchors: string[];
  // Deprecated fields (kept for migration)
  /** @deprecated Use work_consumed instead */
  plan_consumed?: boolean;
  plan_hash: null | string;
  plan_hash_consumed: null | string;
  plan_id: null | string;
  plan_path: null | string;
  plan_signature: null | string;
  session_ids: string[];
  status: "active" | "completed";
  summary: string;
  tags: string[];
  tasks: Task[];
  // Unified lifecycle fields (v0.13.0+)
  work_consumed: boolean;  // Replaces plan_consumed + handoff_consumed
}

// §1.2
export interface GitState {
  branch?: string;
  last_commit_short?: string;
  uncommitted_files?: string[];
}

export interface LastSession {
  context_remaining_pct?: number;
  context_warnings_fired?: number[];
  git_state?: GitState;
  save_reason?: string;
  saved_at?: string;
  session_id?: string;
  transcript_path?: string;
}

// §1.3
export interface Task {
  active_form: string;
  completed_at: null | string;
  created_at: string;
  description: string;
  evidence: string;
  files_changed: string[];
  id: string;
  session_id?: string;
  status: "blocked" | "completed" | "in_progress" | "pending";
  subject: string;
  work_summary: string;
}

// §1.4
export interface IndexEntry {
  last_active: string;
  mode: string;
  summary: string;
}

export interface IndexFile {
  contexts: Record<string, IndexEntry>;
  sessions: Record<string, string>;
  updated_at: string;
  version: "3.0";
}

// §1.5
export interface LogEntry {
  component?: string;
  data?: unknown;
  hook: string;
  level: "debug" | "error" | "info" | "warn";
  msg: string;
  tb?: string;
  ts: string;
}

// §1.6
export interface HookInput {
  context_window?: {
    context_window_size?: number;
    current_usage?: {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  cwd?: string;
  hook_event_name: string;
  permission_mode?: string;
  session_id?: string;
  source?: string;
  tool_input?: Record<string, unknown>;
  tool_name?: string;
  tool_result?: string;
  transcript_path?: string;
}

// §1.7 — Three hook output patterns (see hook-utils.ts for emit functions)
export interface HookOutput {
  // Pattern 2: Top-level decision (UserPromptSubmit, Stop, SubagentStop)
  decision?: "block";
  // Pattern 1: hookSpecificOutput (PreToolUse, PostToolUse, UserPromptSubmit, etc.)
  hookSpecificOutput?: {
    additionalContext?: string;
    hookEventName?: string;
    permissionDecision?: "allow" | "ask" | "deny";
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
  };
  reason?: string;
}

// §1.7b — PermissionRequest output (structurally different from HookOutput)
export interface PermissionRequestOutput {
  decision: {
    behavior: "allow" | "deny";
    message?: string;
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: Record<string, unknown>;
  };
}

// §1.8
export interface InferenceResult {
  error?: string;
  latency_ms: number;
  output: string;
  success: boolean;
}

// §1.9
export interface HandoffDocument {
  active_tasks: Task[];
  completed_tasks_this_session: Array<{ subject: string }>;
  context_folder: string;
  context_id: string;
  context_summary: string;
  created_at: string;
  events_log_path: string;
  file_path: null | string;
  important_notes: string[];
  next_steps: string[];
  plan_path: null | string;
  reason: string;
  session_id: string;
  work_summary: string;
}

// §1.10
export interface HandoffSections {
  completedWork: null | string;
  context: null | string;
  deadEnds: null | string;
  decisions: null | string;
  index: null | string;
  pending: null | string;
  plan: null | string;
}

// §1.11
export interface CaretCommand {
  ends: string[];
  new_context_desc: null | string;
  remaining_prompt: string;
  select: null | string;
}

// §1.12 — Preflight types (shared across hooks)
// Re-exported from runtime/preflight.ts for convenience
export type { PreflightCheckResult, PreflightCommandConfig } from "./runtime/preflight.js";

// §1.13 — Agent configuration (shared across templates)

/** Configuration for a CLI review agent */
export interface AgentConfig {
  categories: string[];
  description: string;
  focus: string;
  model: string;
  name: string;
  provider: string; // e.g. "claude" | "codex" — assigned at runtime by assignModelsToAgents()
  system_prompt: string; // Markdown body content for --system-prompt
}

