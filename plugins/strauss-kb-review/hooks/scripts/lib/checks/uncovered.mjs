// @ts-check
/** uncovered — a change no record covers. */
import { coveringRecords } from "../context.mjs";
import { signals } from "./owed.mjs";
import { basenameOf, finding } from "../util.mjs";

export const GROUP = "uncovered";

/** @param {import("../context.mjs").Ctx} ctx */
export function check(ctx) {
  return [...symbol(ctx), ...signal(ctx)];
}

/** uncovered.symbol — a changed symbol nothing current covers, and no `decision.none`.
 * @param {import("../context.mjs").Ctx} ctx */
function* symbol(ctx) {
  if (freshNoDecision(ctx)) return;
  for (const changed of ctx.changedSymbols) {
    if (coveringRecords(ctx, changed.file).length > 0) continue;
    const where = changed.symbol ?? basenameOf(changed.file);
    yield finding(
      "uncovered.symbol",
      GROUP,
      "block",
      "semantic",
      `${where} changed and no record written in this change covers ${changed.file}.`,
      { file: changed.file, symbol: changed.symbol ?? undefined },
    );
  }
}

/** uncovered.signal — `decision.none` stands while the diff carries a signal that owes a record.
 * A warn-only signal owes none.
 * @param {import("../context.mjs").Ctx} ctx */
function* signal(ctx) {
  const none = freshNoDecision(ctx);
  if (!none) return;
  const fired = signals(ctx).filter((item) => item.severity === "block");
  if (fired.length === 0) return;
  yield finding(
    "uncovered.signal",
    GROUP,
    "block",
    "semantic",
    `decision.none stands while ${fired.map((item) => item.id).join(", ")} fired on this diff.`,
    { recordId: none.conceptId },
  );
}

/** The `decision.none` that answers this diff, or null when it predates it.
 * @param {import("../context.mjs").Ctx} ctx */
export function freshNoDecision(ctx) {
  const none = ctx.noDecision;
  if (!none?.writtenAt) return null;
  const newest = ctx.newestCommitAt;
  return newest === null || Date.parse(none.writtenAt) >= Date.parse(newest)
    ? none
    : null;
}
