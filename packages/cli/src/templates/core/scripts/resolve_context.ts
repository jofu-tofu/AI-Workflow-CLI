#!/usr/bin/env bun
/**
 * Resolve and print the active context ID.
 *
 * Usage:
 *   bun .aiwcli/_core/scripts/resolve_context.ts
 *
 * Prints the context ID to stdout. Exits 1 if no active context found.
 * Used by command templates (/handoff, /handoff-resume) to programmatically
 * get the context ID instead of parsing system reminders.
 *
 * Requires CLAUDE_SESSION_ID environment variable (set by Claude Code).
 */
import { getContextBySessionId } from "../lib-ts/context/context-store.js";
import { getProjectRoot } from "../lib-ts/runtime/constants.js";
import { eprint } from "../lib-ts/runtime/utils.js";

const projectRoot = getProjectRoot(process.cwd());
const sessionId = process.env.CLAUDE_SESSION_ID;

if (!sessionId) {
  eprint("CLAUDE_SESSION_ID not set. This script must be run from within a Claude Code session.");
  process.exit(1);
}

const context = getContextBySessionId(sessionId, projectRoot);

if (!context) {
  eprint(`No context found for session: ${sessionId}`);
  process.exit(1);
}

console.log(context.id);
