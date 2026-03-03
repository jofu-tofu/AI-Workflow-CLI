/**
 * Context selection — determines which context a prompt belongs to.
 * See SPEC.md §8
 *
 * Single entry point: determineContext(prompt, sessionId, projectRoot)
 * Returns [contextId, method, outputText].
 *
 * Selection priority:
 * 1. session_match       — sessionId found in index.json sessions map
 * 2. caret_command       — prompt starts with ^ → parse and execute
 * 3. plan_content_match  — FALLBACK: match against has_plan contexts
 * 3b. handoff_match      — FALLBACK: match against has_handoff contexts
 * 4. default             — create new context
 */

import * as crypto from "node:crypto";

import {
  formatActiveContextReminder,
  formatCommandFeedback,
  formatContextCreated,
  formatContextPickerStderr,
  formatHandoffContinuation,
  formatPlanContinuation,
} from "./context-formatter.js";
import {
  bindSession,
  completeContext,
  createContext,
  createContextFromPrompt,
  determineArtifactType,
  getAllContexts,
  getContext,
  getContextBySessionId,
  updateMode,
} from "./context-store.js";
import { normalizePlanContent } from "./plan-manager.js";
import { logDebug, logError, logInfo } from "../runtime/logger.js";
import { isInternalCall } from "../runtime/subprocess-utils.js";
import type { CaretCommand, ContextState } from "../types.js";

/** Minimum characters required for new context description. */
const MIN_NEW_CONTEXT_CHARS = 10;

/**
 * Raised when the request should be blocked with a message to user.
 * See SPEC.md §8.2
 */
export class BlockRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockRequest";
    // Maintains proper prototype chain when transpiled to ES5
    Object.setPrototypeOf(this, BlockRequest.prototype);
  }
}

// ---------------------------------------------------------------------------
// Context prefix resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a context ID query to an index (1-based) using tiered matching.
 * Match priority: exact > prefix > substring (all case-insensitive).
 * Returns [index, null] on unique match, [null, error] on 0 or 2+ matches.
 * See SPEC.md §8.3
 */
export function resolveContextByPrefix(
  query: string,
  contexts: ContextState[],
): [null | number, null | string] {
  const q = query.toLowerCase();
  const available = contexts.map(c => c.id).join(", ");

  // Tier 1: Exact match
  const exact = contexts
    .map((ctx, i) => [i + 1, ctx] as const)
    .filter(([, ctx]) => ctx.id.toLowerCase() === q);
  if (exact.length === 1) return [exact[0]![0], null];

  // Tier 2: Prefix match
  const prefix = contexts
    .map((ctx, i) => [i + 1, ctx] as const)
    .filter(([, ctx]) => ctx.id.toLowerCase().startsWith(q));
  if (prefix.length === 1) return [prefix[0]![0], null];
  if (prefix.length > 1) {
    return [null, `Ambiguous match '${query}' — ${prefix.length} prefix matches: ${prefix.map(([, c]) => c.id).join(", ")}. Be more specific.`];
  }

  // Tier 3: Substring match
  const substr = contexts
    .map((ctx, i) => [i + 1, ctx] as const)
    .filter(([, ctx]) => ctx.id.toLowerCase().includes(q));
  if (substr.length === 1) return [substr[0]![0], null];
  if (substr.length > 1) {
    return [null, `Ambiguous match '${query}' — ${substr.length} substring matches: ${substr.map(([, c]) => c.id).join(", ")}. Be more specific.`];
  }

  return [null, `No context matches '${query}'. Available: ${available}`];
}

// ---------------------------------------------------------------------------
// Caret command parsing
// ---------------------------------------------------------------------------

/**
 * Parse chained caret commands from user prompt.
 * See SPEC.md §8.4
 */
export function parseChainedCaret(
  prompt: string,
  contexts: ContextState[],
): [CaretCommand | null, null | string] {
  if (!prompt.startsWith("^")) return [null, null];

  const match = prompt.match(/^\^(\S+)(?:\s+(.*))?$/s);
  if (!match) {
    return [null, "Invalid prefix. Use ^E<N> to end, ^S<N> to select, or ^0 <desc> for new context."];
  }

  const commandStr = match[1]!;
  const remaining = (match[2] ?? "").trim();

  // ^N shorthand
  if (/^\d+$/.test(commandStr)) {
    const num = Number.parseInt(commandStr, 10);
    if (num === 0) {
      if (remaining.length < MIN_NEW_CONTEXT_CHARS) {
        return [null,
          `Please provide a longer description for your new context.\n` +
          `Your description '${remaining}' is only ${remaining.length} characters.\n` +
          `Minimum required: ${MIN_NEW_CONTEXT_CHARS} characters.\n` +
          `Example: ^0 implement user authentication with JWT tokens`,
        ];
      }

      return [{ ends: [], select: null, newContextDesc: remaining, remainingPrompt: "" }, null];
    }

    if (num < 1 || num > contexts.length) {
      if (contexts.length === 0) {
        return [null, "No existing contexts. Use ^0 <description> to create a new one."];
      }

      return [null, `Invalid selection. Choose 1-${contexts.length} for existing contexts, or ^0 for new.`];
    }

    const ctx = contexts[num - 1]!;
    return [{ ends: [], select: ctx.id, newContextDesc: null, remainingPrompt: remaining }, null];
  }

  // Parse chained commands
  const ends: string[] = [];
  let select: null | string = null;
  let pos = 0;

  while (pos < commandStr.length) {
    const ch = commandStr[pos]!.toUpperCase();

    if (ch === "E") {
      pos++;
      if (pos < commandStr.length && commandStr[pos] === "*") {
        pos++;
        if (contexts.length === 0) return [null, "No contexts to end."];
        for (const ctx of contexts) {
          if (!ends.includes(ctx.id)) ends.push(ctx.id);
        }
      } else if (pos < commandStr.length && commandStr[pos] === ":") {
        pos++;
        const prefixStart = pos;
        while (pos < commandStr.length && !/[EeSs]/.test(commandStr[pos]!)) pos++;
        const pfx = commandStr.slice(prefixStart, pos);
        if (!pfx) return [null, "Expected ID query after 'E:'"];
        const [idx, err] = resolveContextByPrefix(pfx, contexts);
        if (err) return [null, err];
        const ctx = contexts[idx! - 1]!;
        if (!ends.includes(ctx.id)) ends.push(ctx.id);
      } else {
        const numStart = pos;
        while (pos < commandStr.length && /\d/.test(commandStr[pos]!)) pos++;
        if (numStart === pos) {
          return [null, `Expected number, '*', or ':prefix' after 'E' at position ${numStart + 1}`];
        }

        const num = Number.parseInt(commandStr.slice(numStart, pos), 10);
        if (num < 1 || num > contexts.length) {
          if (contexts.length === 0) return [null, "No contexts to end."];
          return [null, `Context ^E${num} invalid. Choose 1-${contexts.length}.`];
        }

        if (pos < commandStr.length && commandStr[pos] === "+") {
          pos++;
          for (let i = num; i <= contexts.length; i++) {
            const ctx = contexts[i - 1]!;
            if (!ends.includes(ctx.id)) ends.push(ctx.id);
          }
        } else {
          const ctx = contexts[num - 1]!;
          if (!ends.includes(ctx.id)) ends.push(ctx.id);
        }
      }
    } else if (ch === "S") {
      pos++;
      let ctx: ContextState;
      if (pos < commandStr.length && commandStr[pos] === ":") {
        pos++;
        const prefixStart = pos;
        while (pos < commandStr.length && !/[EeSs]/.test(commandStr[pos]!)) pos++;
        const pfx = commandStr.slice(prefixStart, pos);
        if (!pfx) return [null, "Expected ID query after 'S:'"];
        const [idx, err] = resolveContextByPrefix(pfx, contexts);
        if (err) return [null, err];
        ctx = contexts[idx! - 1]!;
      } else {
        const numStart = pos;
        while (pos < commandStr.length && /\d/.test(commandStr[pos]!)) pos++;
        if (numStart === pos) {
          return [null, `Expected number or ':prefix' after 'S' at position ${numStart + 1}`];
        }

        const num = Number.parseInt(commandStr.slice(numStart, pos), 10);
        if (num < 1 || num > contexts.length) {
          if (contexts.length === 0) return [null, "No contexts to select."];
          return [null, `Context ^S${num} invalid. Choose 1-${contexts.length}.`];
        }

        ctx = contexts[num - 1]!;
      }

      if (select === null) select = ctx.id;
    } else {
      return [null,
        `Invalid command '${commandStr[pos]}' at position ${pos + 1}.\n` +
        `Use E<N> to end, E<N>+ to end N and after, E* to end all, S<N> to select.\n` +
        `Example: ^E1S2 (end 1, select 2), ^E2+ (end 2 and older), ^E* (end all)`,
      ];
    }
  }

  if (select !== null && ends.includes(select)) {
    return [null, `Cannot select context '${select}' because it's being ended.`];
  }

  return [{ ends, select, newContextDesc: null, remainingPrompt: remaining }, null];
}

// ---------------------------------------------------------------------------
// Plan content matching (fallback)
// ---------------------------------------------------------------------------

function matchPlanContent(prompt: string, hasPlanContexts: ContextState[]): ContextState | null {
  if (hasPlanContexts.length === 0) return null;

  // Tier 1: Plan ID match
  const idMatch = prompt.match(/<!-- plan-id: ([a-f0-9]+) -->/);
  if (idMatch) {
    const foundId = idMatch[1]!;
    for (const ctx of hasPlanContexts) {
      if (ctx.planId === foundId) {
        logDebug("context_selector", `Tier 1 plan-id match: ${ctx.id} (id: ${foundId})`);
        return ctx;
      }
    }
  }

  // Tier 2: Normalized hash match
  const normalized = normalizePlanContent(prompt);
  const normHash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
  for (const ctx of hasPlanContexts) {
    if (ctx.planHash && ctx.planHash === normHash) {
      logDebug("context_selector", `Tier 2 normalized hash match: ${ctx.id} (hash: ${normHash})`);
      return ctx;
    }
  }

  // Tier 3: Multi-anchor signature match
  for (const ctx of hasPlanContexts) {
    const anchors = ctx.planAnchors ?? [];
    if (anchors.length > 0) {
      const hits = anchors.filter(a => prompt.includes(a)).length;
      if (hits >= 2 && hits >= Math.floor(anchors.length / 2)) {
        logDebug("context_selector", `Tier 3 anchor match: ${ctx.id} (${hits}/${anchors.length} anchors)`);
        return ctx;
      }
    }
  }

  // Tier 4 (legacy): Signature match
  const promptHead = new Set(prompt.slice(0, 500));
  for (const ctx of hasPlanContexts) {
    if (ctx.planSignature && promptHead.has(ctx.planSignature)) {
      logDebug("context_selector", `Tier 4 legacy signature match: ${ctx.id}`);
      return ctx;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Context creation helper
// ---------------------------------------------------------------------------

function createNewContext(
  prompt: string,
  projectRoot?: string,
): [null | string, string, null | string] {
  try {
    const newCtx = createContextFromPrompt(prompt, projectRoot);
    updateMode(newCtx.id, "active", projectRoot);
    newCtx.mode = "active";
    logInfo("context_selector", `Auto-created context: ${newCtx.id}`);
    return [newCtx.id, "auto_created", formatContextCreated(newCtx)];
  } catch (error: unknown) {
    logError("context_selector", `Primary context creation failed: ${error}`);
    try {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const fallbackId = `${yy}${mm}${dd}-${hh}${min}-context`;
      const newCtx = createContext(
        fallbackId,
        prompt.trim().slice(0, 200) || "New context",
        {
          method: "auto-created-fallback",
          projectRoot,
          tags: ["auto-created", "fallback"],
        },
      );
      updateMode(newCtx.id, "active", projectRoot);
      newCtx.mode = "active";
      logInfo("context_selector", `Fallback context created: ${newCtx.id}`);
      return [newCtx.id, "auto_created_fallback", formatContextCreated(newCtx)];
    } catch (error: unknown) {
      logError("context_selector", `ALL context creation failed: ${error}`);
      return [null, "creation_failed", null];
    }
  }
}

// ---------------------------------------------------------------------------
// Caret command handler
// ---------------------------------------------------------------------------

function handleCaretCommand(
  prompt: string,
  contexts: ContextState[],
  projectRoot?: string,
): [null | string, string, null | string] {
  if (contexts.length === 0) {
    const match = prompt.match(/^\^(\S+)(?:\s+(.*))?$/s);
    if (!match) {
      throw new BlockRequest(
        "Invalid prefix. Use ^0 <description> to create a new context.\n" +
        "Example: ^0 implement user authentication system",
      );
    }

    const prefixValue = match[1]!;
    const remaining = match[2] ?? "";
    if (!/^\d+$/.test(prefixValue) || Number.parseInt(prefixValue, 10) !== 0) {
      throw new BlockRequest(
        "No existing contexts to select. Use ^0 <description> to create a new context.\n" +
        "Example: ^0 implement user authentication system",
      );
    }

    const description = remaining.trim();
    if (description.length < MIN_NEW_CONTEXT_CHARS) {
      throw new BlockRequest(
        `Please provide a longer description for your new context.\n` +
        `Your description '${description}' is only ${description.length} characters.\n` +
        `Minimum required: ${MIN_NEW_CONTEXT_CHARS} characters.\n` +
        `Example: ^0 implement user authentication with JWT tokens`,
      );
    }

    return createNewContext(description, projectRoot);
  }

  const [cmd, error] = parseChainedCaret(prompt, contexts);
  if (error) throw new BlockRequest(error + "\n" + formatContextPickerStderr(contexts));
  if (!cmd) throw new BlockRequest(formatContextPickerStderr(contexts));

  const endedContexts: ContextState[] = [];
  for (const ctxId of cmd.ends) {
    const ctxToEnd = contexts.find(c => c.id === ctxId);
    if (!ctxToEnd) {
      throw new BlockRequest(`Context '${ctxId}' no longer exists.\n` + formatContextPickerStderr(contexts));
    }

    completeContext(ctxToEnd.id, projectRoot);
    endedContexts.push(ctxToEnd);
    logInfo("context_selector", `Ended context: ${ctxToEnd.id}`);
  }

  if (cmd.newContextDesc) {
    const [ctxId, method, output] = createNewContext(cmd.newContextDesc, projectRoot);
    if (ctxId && endedContexts.length > 0) {
      const newCtx = getContext(ctxId, projectRoot);
      const feedback = formatCommandFeedback(endedContexts, newCtx);
      return [ctxId, method === "creation_failed" ? method : "caret_new", feedback];
    }

    return [ctxId, method === "creation_failed" ? method : "caret_new", output];
  }

  if (cmd.select) {
    const selectedCtx = contexts.find(c => c.id === cmd.select);
    if (!selectedCtx) {
      throw new BlockRequest(`Context '${cmd.select}' no longer exists.\n` + formatContextPickerStderr(contexts));
    }

    logInfo("context_selector", `Caret-selected context: ${selectedCtx.id}`);
    return [selectedCtx.id, "caret_select", formatCommandFeedback(endedContexts, selectedCtx)];
  }

  if (endedContexts.length > 0) {
    const remainingContexts = getAllContexts("active", projectRoot);
    const feedback = formatCommandFeedback(endedContexts, null);
    if (remainingContexts.length === 0) {
      throw new BlockRequest(
        feedback + "\nAll contexts have been ended. No context selected.\n\n" +
        "Just type your task to start a new context.\n" +
        "Example: implement user authentication system",
      );
    }

    throw new BlockRequest(
      feedback + "\nNo context selected.\n\nSelect a context to continue:\n" +
      formatContextPickerStderr(remainingContexts),
    );
  }

  throw new BlockRequest(formatContextPickerStderr(contexts));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Determine which context this prompt belongs to.
 * See SPEC.md §8.5
 *
 * Returns [contextId, method, outputText].
 * Throws BlockRequest when request should be blocked to show picker.
 */
export function determineContext(
  prompt: string,
  sessionId?: string,
  projectRoot?: string,
): [null | string, string, null | string] {
  if (isInternalCall()) {
    logDebug("context_selector", "Skipping: internal subprocess call");
    return [null, "skip_internal", null];
  }

  // --- Case 1: session_match ---
  if (sessionId) {
    const sessionContext = getContextBySessionId(sessionId, projectRoot);
    if (sessionContext) {
      logInfo("context_selector", `Session match: ${sessionContext.id}`);
      return [
        sessionContext.id,
        "session_match",
        formatActiveContextReminder(sessionContext, projectRoot),
      ];
    }
  }

  // --- Case 2: caret_command ---
  if (prompt.trim() === "^") {
    const contexts = getAllContexts("active", projectRoot);
    if (contexts.length === 0) {
      throw new BlockRequest(
        "No contexts exist.\n\nJust type your task to start a new context.\n" +
        "Example: implement user authentication system",
      );
    }

    throw new BlockRequest(formatContextPickerStderr(contexts));
  }

  if (prompt.startsWith("^")) {
    const contexts = getAllContexts("active", projectRoot);
    return handleCaretCommand(prompt, contexts, projectRoot);
  }

  // --- Case 3: Staged work match (CHANGED: unified mode) ---
  const stagedContexts = getAllContexts("active", projectRoot).filter(
    (c) => c.mode === "hasStagedWork",
  );

  if (stagedContexts.length > 0) {
    // Separate by artifact type
    const planContexts = stagedContexts.filter(
      (c) => determineArtifactType(c) === "plan",
    );
    const handoffContexts = stagedContexts.filter(
      (c) => determineArtifactType(c) === "handoff",
    );

    // Try plan matching first (content-based matching)
    if (planContexts.length > 0) {
      const matched = matchPlanContent(prompt, planContexts);
      if (matched) {
        if (sessionId) bindSession(matched.id, sessionId, projectRoot);
        updateMode(matched.id, "active", projectRoot, {
          workConsumed: true, // CHANGED: unified flag
          ...(matched.planHash ? {planHashConsumed: matched.planHash} : {}),
        });
        matched.mode = "active";
        logInfo("context_selector", `Plan match (fallback): ${matched.id}`);
        return [
          matched.id,
          "plan_content_match",
          formatPlanContinuation(matched, projectRoot),
        ];
      }
    }

    // Fallback to handoff (pick first - no content matching)
    if (handoffContexts.length > 0) {
      const target = handoffContexts[0]!;
      if (sessionId) bindSession(target.id, sessionId, projectRoot);
      updateMode(target.id, "active", projectRoot, { workConsumed: true }); // CHANGED
      target.mode = "active";
      logInfo("context_selector", `Handoff match (fallback): ${target.id}`);
      return [
        target.id,
        "handoff_match",
        formatHandoffContinuation(target, projectRoot),
      ];
    }
  }

  // --- Case 4: default ---
  return createNewContext(prompt, projectRoot);
}




