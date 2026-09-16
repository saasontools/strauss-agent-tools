import type { KbStore } from "../../kb-store.js";

/**
 * Status moves that settle a record. A move to `draft`, `proposed` or `open`
 * says the question is still live, so it does not protect a target from being
 * refreshed by a later promotion.
 */
const SETTLING = new Set(["accepted", "resolved", "rejected", "superseded"]);

/** `human`, or `human:<name>` — the actor kinds a promotion must not overwrite. */
function isHuman(actor: string): boolean {
  return actor === "human" || actor.startsWith("human:");
}

/**
 * Who settled each record in a base by hand, from its log.
 *
 * The record itself cannot answer: its frontmatter holds the status but not who
 * moved it there, and a promotion overwriting a human's judgment with the
 * scratchpad's is the one loss the review flow must not have.
 */
export async function humanSettled(
  store: KbStore,
  bundlePath: string,
): Promise<Map<string, string>> {
  const settled = new Map<string, string>();
  const { entries } = await store.readLog(bundlePath);
  for (const entry of entries) {
    if (!entry.operation.startsWith("status:")) continue;
    if (!SETTLING.has(entry.operation.slice("status:".length))) continue;
    if (!isHuman(entry.by)) continue;
    // Entries arrive oldest first, so the last settling move wins.
    settled.set(entry.conceptId, entry.by);
  }
  return settled;
}
