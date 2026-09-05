// @ts-check
/** D — status games: standing moved without the work that earns it. */
import { asString, finding } from "./util.mjs";

const TERMINAL = new Set(["resolved", "rejected", "superseded", "answered"]);
// The log writes a status move as `status:<new status>`, so this is a prefix.
const CLOSING =
  /^(status:(resolved|rejected|superseded|answered)|supersede|answer)$/;

/** @param {import("./context.mjs").Ctx} ctx */
export function check(ctx) {
  return [...d1(ctx), ...d2(ctx), ...d3(ctx), ...d4(ctx), ...d5(ctx)];
}

/** D1 — written and closed in one session, with no code moving between. @param {import("./context.mjs").Ctx} ctx */
function* d1(ctx) {
  for (const record of ctx.touched) {
    if (!TERMINAL.has(record.status)) continue;
    if (!ctx.logAdded.some((entry) => wrote(entry, record.conceptId))) continue;
    if (!ctx.logAdded.some((entry) => closed(entry, record.conceptId)))
      continue;
    const anchors = new Set(record.anchors.map((anchor) => anchor.file));
    const touching = ctx.commits.filter((commit) =>
      [...anchors].some((file) => commit.paths.has(file)),
    );
    const closingAt = ctx.commits.findIndex((commit) =>
      commit.paths.has(record.path),
    );
    const later = touching.filter(
      (commit) => ctx.commits.indexOf(commit) > closingAt,
    );
    if (later.length === 0) {
      yield finding(
        "D1",
        "D",
        "block",
        "mechanical",
        `${record.conceptId} was written and set ${record.status} in one session; no commit touched its anchor in between.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/**
 * D2 — a risk closed while the code it feared never moved. The evidence is the
 * anchor hash `anchor-resolve` reports: `match` is the code the record was
 * written against, byte for byte. An anchor nobody could resolve says nothing.
 * @param {import("./context.mjs").Ctx} ctx
 */
function* d2(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "risk" || record.status !== "resolved") continue;
    if (!ctx.logAdded.some((entry) => closed(entry, record.conceptId)))
      continue;
    const results = ctx.anchorState.get(record.conceptId)?.results ?? [];
    if (results.length === 0) continue;
    if (
      !results.every((/** @type {any} */ a) => asString(a?.state) === "match")
    )
      continue;
    yield finding(
      "D2",
      "D",
      "block",
      "mechanical",
      `${record.conceptId} is resolved and every anchor still hashes to the code it was written against.`,
      { recordId: record.conceptId },
    );
  }
}

/** D3 — a question the author owns is a question nobody answers. @param {import("./context.mjs").Ctx} ctx */
function* d3(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "open-question" || !record.owner) continue;
    if (record.owner !== record.writtenBy) continue;
    yield finding(
      "D3",
      "D",
      "block",
      "mechanical",
      `${record.conceptId} is owned by ${record.owner}, who wrote it.`,
      { recordId: record.conceptId },
    );
  }
}

/** D4 — a chain of supersessions inside one session. @param {import("./context.mjs").Ctx} ctx */
function* d4(ctx) {
  const chain = ctx.logAdded.filter(
    (entry) => asString(entry?.operation) === "supersede",
  );
  if (chain.length > 2) {
    yield finding(
      "D4",
      "D",
      "warn",
      "mechanical",
      `${chain.length} supersessions this session; the base is being rewritten, not corrected.`,
    );
  }
}

/** D5 — the code moved under an anchor and the record still claims it. @param {import("./context.mjs").Ctx} ctx */
function* d5(ctx) {
  for (const [conceptId, result] of ctx.anchorState) {
    for (const anchor of result?.results ?? []) {
      if (asString(anchor?.state) !== "drifted") continue;
      yield finding(
        "D5",
        "D",
        "block",
        "mechanical",
        `${conceptId} drifted on ${anchor.file}:${anchor.symbol} — reassess it, then rebaseline.`,
        {
          recordId: conceptId,
          file: asString(anchor.file),
          symbol: asString(anchor.symbol),
        },
      );
    }
  }
}

/** @param {any} entry @param {string} conceptId */
function wrote(entry, conceptId) {
  return (
    asString(entry?.conceptId) === conceptId &&
    ["write", "overwrite"].includes(asString(entry?.operation))
  );
}

/** @param {any} entry @param {string} conceptId */
function closed(entry, conceptId) {
  return (
    asString(entry?.conceptId) === conceptId &&
    CLOSING.test(asString(entry?.operation))
  );
}
