import * as crypto from "node:crypto";

import {
  extractPlanAnchors,
  generatePlanId,
  normalizePlanContent,
} from "../context/plan-manager.js";
import { nowIso } from "../runtime/utils.js";
import type { ContextState, GitState, LastSession } from "../types.js";

function formatArchiveTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}-` +
    `${String(date.getHours()).padStart(2, "0")}` +
    `${String(date.getMinutes()).padStart(2, "0")}`
  );
}

function resolveArtifactType(state: ContextState): "plan" | "handoff" | null {
  if (state.next_artifact_type) return state.next_artifact_type;

  const hasPlan = Boolean(state.plan_path && state.plan_hash);
  const hasHandoff = Boolean(state.handoff_path);

  if (hasPlan && hasHandoff) return "plan";
  if (hasPlan) return "plan";
  if (hasHandoff) return "handoff";
  return null;
}

export function computePlanFallback(
  state: ContextState,
  planContent: string,
): Partial<ContextState> {
  const normalized = normalizePlanContent(planContent);
  const planHash = crypto
    .createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 12);

  return {
    plan_hash: planHash,
    plan_signature: planContent.slice(0, 200),
    plan_id: generatePlanId(),
    plan_anchors: extractPlanAnchors(planContent),
    work_consumed: state.work_consumed ?? false,
  };
}

export function shouldStage(
  state: ContextState,
  permissionMode: string,
): boolean {
  const artifactType = resolveArtifactType(state);
  const canStage = state.mode === "active" || permissionMode === "plan";
  return Boolean(artifactType && canStage && !state.work_consumed);
}

export function buildSessionMetadata(
  sessionId: string,
  source: string,
  transcriptPath: string | undefined,
  gitState?: GitState,
): LastSession {
  return {
    session_id: sessionId,
    save_reason: source,
    saved_at: nowIso(),
    ...(transcriptPath ? { transcript_path: transcriptPath } : {}),
    git_state: gitState ?? {},
  };
}

export function generateArchiveFilename(
  sessionId: string,
  date: Date,
  existingNames: Iterable<string>,
): string {
  const existing = new Set(existingNames);
  const timestamp = formatArchiveTimestamp(date);

  let archiveName = `${timestamp}-${sessionId}.jsonl`;
  let counter = 2;
  while (existing.has(archiveName)) {
    archiveName = `${timestamp}-${sessionId}-${counter}.jsonl`;
    counter += 1;
  }

  return archiveName;
}
