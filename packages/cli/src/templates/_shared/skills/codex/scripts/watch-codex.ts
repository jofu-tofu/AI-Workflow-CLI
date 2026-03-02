#!/usr/bin/env bun
/**
 * Thin CLI wrapper over lib/codex-watcher.ts for backward compatibility.
 *
 * Usage:
 *   bun watch-codex.ts <pane_id> <session_id> <session_file>
 *
 * Prefer using launch-codex.ts directly (watch is built-in by default).
 */
import {
  SUMMARY_UNAVAILABLE_MESSAGE,
  summarizeFromSessionFileFallback,
  summarizeViaResume,
  summarizeViaSessionFileSpark,
  waitForPaneClose,
} from "../lib/codex-watcher.js";

async function main(): Promise<void> {
  const [paneId, sessionId, sessionFile] = process.argv.slice(2);
  if (!paneId) {
    console.log(SUMMARY_UNAVAILABLE_MESSAGE);
    return;
  }

  await waitForPaneClose(paneId);

  const sf = sessionFile ?? "";
  const sid = sessionId ?? "";
  const summary =
    summarizeViaSessionFileSpark(sf) ??
    (sid ? await summarizeViaResume(sid) : null) ??
    summarizeFromSessionFileFallback(sf) ??
    SUMMARY_UNAVAILABLE_MESSAGE;

  console.log("\n--- Codex Session Summary ---");
  console.log(summary);
}

try {
  await main();
} catch (error) {
  console.error(`watch-codex error: ${String(error)}`);
  console.log(SUMMARY_UNAVAILABLE_MESSAGE);
}
