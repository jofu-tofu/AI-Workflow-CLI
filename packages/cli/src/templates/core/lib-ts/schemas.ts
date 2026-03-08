/**
 * Zod schemas mirroring types.ts for runtime validation at JSON.parse boundaries.
 * All object schemas use .passthrough() to preserve method-specific extension fields.
 * See types.ts for corresponding TypeScript interfaces.
 */

import { z } from "zod";

// §1.1
export const ModeSchema = z.enum(["active", "has_staged_work", "idle"]);

// §1.2
export const GitStateSchema = z
  .object({
    branch: z.string().optional(),
    last_commit_short: z.string().optional(),
    uncommitted_files: z.array(z.string()).optional(),
  })
  .passthrough();

export const LastSessionSchema = z
  .object({
    context_remaining_pct: z.number().optional(),
    context_warnings_fired: z.array(z.number()).optional(),
    git_state: GitStateSchema.optional(),
    save_reason: z.string().optional(),
    saved_at: z.string().optional(),
    session_id: z.string().optional(),
    transcript_path: z.string().optional(),
  })
  .passthrough();

// §1.3
export const TaskSchema = z
  .object({
    active_form: z.string(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
    description: z.string(),
    evidence: z.string(),
    files_changed: z.array(z.string()),
    id: z.string(),
    session_id: z.string().optional(),
    status: z.enum(["blocked", "completed", "in_progress", "pending"]),
    subject: z.string(),
    work_summary: z.string(),
  })
  .passthrough();

// §1.1 (continued)
export const ContextStateSchema = z
  .object({
    created_at: z.string(),
    handoff_consumed: z.boolean().optional(), // deprecated
    handoff_path: z.string().nullable().optional(),
    id: z.string(),
    last_active: z.string(),
    last_session: LastSessionSchema.nullable().optional(),
    method: z.string(),
    mode: ModeSchema,
    next_artifact_type: z.enum(["handoff", "plan"]).nullable().optional(),
    plan_anchors: z.array(z.string()).optional(),
    plan_consumed: z.boolean().optional(), // deprecated
    plan_hash: z.string().nullable().optional(),
    plan_hash_consumed: z.string().nullable().optional(),
    plan_id: z.string().nullable().optional(),
    plan_path: z.string().nullable().optional(),
    plan_signature: z.string().nullable().optional(),
    session_ids: z.array(z.string()).optional(),
    status: z.enum(["active", "completed"]),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
    tasks: z.array(TaskSchema).optional(),
    work_consumed: z.boolean().optional(),
  })
  .passthrough();

// §1.4
export const IndexEntrySchema = z
  .object({
    last_active: z.string(),
    mode: z.string(),
    summary: z.string(),
  })
  .passthrough();

export const IndexFileSchema = z
  .object({
    contexts: z.record(z.string(), IndexEntrySchema),
    sessions: z.record(z.string(), z.string()),
    updated_at: z.string(),
    version: z.literal("3.0"),
  })
  .passthrough();

// §1.5
export const LogEntrySchema = z
  .object({
    component: z.string().optional(),
    data: z.unknown().optional(),
    hook: z.string(),
    level: z.enum(["debug", "error", "info", "warn"]),
    msg: z.string(),
    tb: z.string().optional(),
    ts: z.string(),
  })
  .passthrough();

// §1.6
export const HookInputSchema = z
  .object({
    context_window: z
      .object({
        context_window_size: z.number().optional(),
        current_usage: z
          .object({
            cache_creation_input_tokens: z.number().optional(),
            cache_read_input_tokens: z.number().optional(),
            input_tokens: z.number().optional(),
            output_tokens: z.number().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    cwd: z.string().optional(),
    hook_event_name: z.string(),
    permission_mode: z.string().optional(),
    session_id: z.string().optional(),
    source: z.string().optional(),
    tool_input: z.record(z.string(), z.unknown()).optional(),
    tool_name: z.string().optional(),
    tool_result: z.string().optional(),
    transcript_path: z.string().optional(),
  })
  .passthrough();

// §1.7
export const HookOutputSchema = z
  .object({
    decision: z.literal("block").optional(),
    hookSpecificOutput: z
      .object({
        additionalContext: z.string().optional(),
        hookEventName: z.string().optional(),
        permissionDecision: z.enum(["allow", "ask", "deny"]).optional(),
        permissionDecisionReason: z.string().optional(),
        updatedInput: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    reason: z.string().optional(),
  })
  .passthrough();

// §1.7b
export const PermissionRequestOutputSchema = z
  .object({
    decision: z.object({
      behavior: z.enum(["allow", "deny"]),
      message: z.string().optional(),
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      updatedPermissions: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .passthrough();

// §1.8
export const InferenceResultSchema = z
  .object({
    error: z.string().optional(),
    latency_ms: z.number(),
    output: z.string(),
    success: z.boolean(),
  })
  .passthrough();

// §1.9
export const HandoffDocumentSchema = z
  .object({
    active_tasks: z.array(TaskSchema),
    completed_tasks_this_session: z.array(z.object({ subject: z.string() }).passthrough()),
    context_folder: z.string(),
    context_id: z.string(),
    context_summary: z.string(),
    created_at: z.string(),
    events_log_path: z.string(),
    file_path: z.string().nullable(),
    important_notes: z.array(z.string()),
    next_steps: z.array(z.string()),
    plan_path: z.string().nullable(),
    reason: z.string(),
    session_id: z.string(),
    work_summary: z.string(),
  })
  .passthrough();

// §1.10
export const HandoffSectionsSchema = z
  .object({
    completedWork: z.string().nullable(),
    context: z.string().nullable(),
    deadEnds: z.string().nullable(),
    decisions: z.string().nullable(),
    index: z.string().nullable(),
    pending: z.string().nullable(),
    plan: z.string().nullable(),
  })
  .passthrough();

// §1.11
export const CaretCommandSchema = z
  .object({
    ends: z.array(z.string()),
    new_context_desc: z.string().nullable(),
    remaining_prompt: z.string(),
    select: z.string().nullable(),
  })
  .passthrough();

// §1.13
export const AgentConfigSchema = z
  .object({
    categories: z.array(z.string()),
    description: z.string(),
    focus: z.string(),
    model: z.string(),
    name: z.string(),
    provider: z.string(),
    system_prompt: z.string(),
  })
  .passthrough();
