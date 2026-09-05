// @ts-check
/** A — silence: the change went in and nothing says why. */
import { coveringRecords } from "./context.mjs";
import { signals } from "./family-f.mjs";
import { basenameOf, finding, wordCount } from "./util.mjs";

/** @param {import("./context.mjs").Ctx} ctx */
export function check(ctx) {
  return [...a1(ctx), ...a2(ctx), ...a3(ctx), ...a4(ctx)];
}

/** A1 — a changed symbol nothing current covers, and no `decision.none`. @param {import("./context.mjs").Ctx} ctx */
function* a1(ctx) {
  if (freshNoDecision(ctx)) return;
  for (const changed of ctx.changedSymbols) {
    if (coveringRecords(ctx, changed.file).length > 0) continue;
    const where = changed.symbol ?? basenameOf(changed.file);
    yield finding(
      "A1",
      "A",
      "block",
      "semantic",
      `${where} changed and no record written in this change covers ${changed.file}.`,
      { file: changed.file, symbol: changed.symbol ?? undefined },
    );
  }
}

/** A2 — the `decision.none` reason is too short, or names nothing. @param {import("./context.mjs").Ctx} ctx */
function* a2(ctx) {
  const none = freshNoDecision(ctx);
  if (!none) return;
  const reason = none.body.replace(/^##.*$/gm, "").trim();
  if (wordCount(reason) < ctx.thresholds.reasonWords) {
    yield finding(
      "A2",
      "A",
      "block",
      "semantic",
      `decision.none says ${wordCount(reason)} words; a reason that stands is at least ${ctx.thresholds.reasonWords}.`,
      { recordId: none.conceptId },
    );
    return;
  }
  const missing = uncoveredFiles(ctx).filter(
    (file) => !reason.includes(basenameOf(file)),
  );
  if (missing.length > 0) {
    yield finding(
      "A2",
      "A",
      "block",
      "semantic",
      `decision.none names none of: ${missing.map(basenameOf).join(", ")}.`,
      { recordId: none.conceptId },
    );
  }
}

/** A3 — nothing to decide, while the diff carries a signal that needs one. @param {import("./context.mjs").Ctx} ctx */
function* a3(ctx) {
  const none = freshNoDecision(ctx);
  if (!none) return;
  const fired = signals(ctx);
  if (fired.length === 0) return;
  yield finding(
    "A3",
    "A",
    "block",
    "semantic",
    `decision.none stands while ${fired.map((item) => item.id).join(", ")} fired on this diff.`,
    { recordId: none.conceptId },
  );
}

/** A4 — every record written in the last minute, every body a stub. @param {import("./context.mjs").Ctx} ctx */
function* a4(ctx) {
  const { hurriedSeconds, hurriedWords } = ctx.thresholds;
  const written = ctx.touched.filter((record) => record.writtenAt);
  if (written.length === 0) return;
  const now = Date.now();
  const hurried = written.filter(
    (record) =>
      now - Date.parse(String(record.writtenAt)) < hurriedSeconds * 1000 &&
      wordCount(record.body) < hurriedWords,
  );
  if (hurried.length === written.length) {
    yield finding(
      "A4",
      "A",
      "warn",
      "semantic",
      `all ${written.length} record(s) were written in the last ${hurriedSeconds}s with bodies under ${hurriedWords} words.`,
    );
  }
}

/** The `decision.none` that answers this diff, or null when it predates it.
 * @param {import("./context.mjs").Ctx} ctx */
export function freshNoDecision(ctx) {
  const none = ctx.noDecision;
  if (!none?.writtenAt) return null;
  const newest = ctx.newestCommitAt;
  return newest === null || Date.parse(none.writtenAt) >= Date.parse(newest)
    ? none
    : null;
}

/** @param {import("./context.mjs").Ctx} ctx */
export function uncoveredFiles(ctx) {
  return [
    ...new Set(
      ctx.changedSymbols
        .filter((changed) => coveringRecords(ctx, changed.file).length === 0)
        .map((changed) => changed.file),
    ),
  ];
}
