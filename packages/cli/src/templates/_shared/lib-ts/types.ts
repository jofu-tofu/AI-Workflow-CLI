/**
 * Shared type definitions for the lib-ts library.
 * All field names use snake_case for JSON backward compatibility with state.json.
 * See SPEC.md §1 for full behavioral specification.
 */

// §1.1
export type Mode = "active" | "has_handoff" | "has_plan" | "idle";

export interface ContextState {
  created_at: string;
  handoff_consumed: boolean;
  handoff_path: null | string;
  id: string;
  last_active: string;
  last_session: LastSession | null;
  method: string;
  mode: Mode;
  plan_anchors: string[];
  plan_consumed: boolean;
  plan_hash: null | string;
  plan_id: null | string;
  plan_path: null | string;
  plan_signature: null | string;
  session_ids: string[];
  status: "active" | "completed";
  summary: string;
  tags: string[];
  tasks: Task[];
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
  data?: any;
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
  tool_input?: Record<string, any>;
  tool_name?: string;
  tool_result?: string;
  transcript_path?: string;
}

// §1.7
export interface HookOutput {
  hookSpecificOutput?: {
    additionalContext?: string;
    hookEventName?: string;
    permissionDecision?: "allow" | "deny";
    permissionDecisionReason?: string;
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
