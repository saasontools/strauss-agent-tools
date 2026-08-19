#!/usr/bin/env node
/**
 * PreInvocation hook: injects the pinned-base index as an ephemeral message.
 *
 * Antigravity's hook protocol wants strict JSON on stdout and has no
 * additionalContext field — context arrives through `injectSteps`, and
 * `ephemeralMessage` is the transient-system-message channel. This script is
 * the thin protocol wrapper the runtime needs around the one canonical block
 * writer, `strauss-kb context`.
 *
 * PreInvocation fires per turn, so the budget is deliberately tight
 * (index-only) and the block's stable heading makes each injection read as a
 * refresh. Everything unexpected — CLI missing, no pins, any error — emits {}
 * and exits 0: a broken hook must never break a turn.
 */
import { spawnSync } from "node:child_process";

function main() {
  const result = spawnSync("strauss-kb", ["context", "--budget", "2500"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const block = result.status === 0 ? (result.stdout ?? "").trim() : "";
  process.stdout.write(
    block
      ? JSON.stringify({ injectSteps: [{ ephemeralMessage: block }] })
      : "{}",
  );
  return 0;
}

process.exit(main());
