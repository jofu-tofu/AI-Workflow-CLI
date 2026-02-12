/**
 * Shared type definitions for the lib-ts library.
 * All field names use snake_case for JSON backward compatibility with state.json.
 * See SPEC.md §1 for full behavioral specification.
 */

// §1.1
export type Mode = "idle" | "has_plan" | "has_handoff" | "active";

export interface ContextState {
  id: string;
  status: "active" | "completed";
  summary: string;
  method: string;
  tags: string[];
  created_at: string;
  last_active: string;
  mode: Mode;
  plan_path: string | null;
  plan_hash: string | null;
  plan_signature: string | null;
  plan_id: string | null;
  plan_anchors: string[];
  plan_consumed: boolean;
  handoff_path: string | null;
  handoff_consumed: boolean;
  session_ids: string[];
  last_session: LastSession | null;
  tasks: Task[];
}

// §1.2
export interface GitState {
  branch?: string;
  uncommitted_files?: string[];
  last_commit_short?: string;
}

export interface LastSession {
  session_id?: string;
  saved_at?: string;
  save_reason?: string;
  transcript_path?: string;
  context_remaining_pct?: number;
  git_state?: GitState;
}

// §1.3
export interface Task {
  id: string;
  subject: string;
  description: string;
  active_form: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  created_at: string;
  completed_at: string | null;
  evidence: string;
  work_summary: string;
  files_changed: string[];
  session_id?: string;
}

// §1.4
export interface IndexEntry {
  summary: string;
  mode: string;
  last_active: string;
}

export interface IndexFile {
  version: "3.0";
  updated_at: string;
  sessions: Record<string, string>;
  contexts: Record<string, IndexEntry>;
}

// §1.5
export interface LogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  hook: string;
  msg: string;
  component?: string;
  data?: any;
  tb?: string;
}

// §1.6
export interface HookInput {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_result?: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  context_window?: {
    current_usage?: {
      cache_read_input_tokens?: number;
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
    context_window_size?: number;
  };
  permission_mode?: string;
  source?: string;
}

// §1.7
export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
    permissionDecision?: "allow" | "deny";
    permissionDecisionReason?: string;
  };
}

// §1.8
export interface InferenceResult {
  success: boolean;
  output: string;
  error?: string;
  latency_ms: number;
}

// §1.9
export interface HandoffDocument {
  context_id: string;
  context_summary: string;
  session_id: string;
  reason: string;
  created_at: string;
  plan_path: string | null;
  context_folder: string;
  events_log_path: string;
  active_tasks: Task[];
  completed_tasks_this_session: Array<{ subject: string }>;
  work_summary: string;
  next_steps: string[];
  important_notes: string[];
  file_path: string | null;
}

// §1.10
export interface HandoffSections {
  index: string | null;
  deadEnds: string | null;
  pending: string | null;
  plan: string | null;
  decisions: string | null;
  completedWork: string | null;
  context: string | null;
}

// §1.11
export interface CaretCommand {
  ends: string[];
  select: string | null;
  new_context_desc: string | null;
  remaining_prompt: string;
}
