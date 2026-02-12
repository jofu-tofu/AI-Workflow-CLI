#!/usr/bin/env bun
/**
 * Resolve and print the active context ID.
 *
 * Usage:
 *   bun .aiwcli/_shared/scripts/resolve_context.ts
 *
 * Prints the context ID to stdout. Exits 1 if no active context found.
 * Used by command templates (/handoff, /handoff-resume) to programmatically
 * get the context ID instead of parsing system reminders.
 */
import { findActiveContextId } from "../lib-ts/context/context-store.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { eprint } from "../lib-ts/base/utils.js";

const projectRoot = getProjectRoot(process.cwd());
const contextId = findActiveContextId(projectRoot);

if (!contextId) {
  eprint("No active context found. Handoffs require an active context.");
  process.exit(1);
}

console.log(contextId);
