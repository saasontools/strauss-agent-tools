// @ts-check
/** standing — status moved without the work that earns it. */
import { asString, finding } from "../util.mjs";

export const GROUP = "standing";

const TERMINAL = new Set(["resolved", "rejected", "superseded", "answered"]);
// The log writes a status move as `status:<new status>`, so this is a prefix.
const CLOSING =
  /^(status:(resolved|rejected|superseded|answered)|supersede|answer)$/;

/** @param {import("../context.mjs").Ctx} ctx */
export function check(ctx) {
  return [
    ...closedSameTurn(ctx),
    ...resolvedUnmoved(ctx),
    ...selfOwnedQuestion(ctx),
    ...supersedeChain(ctx),
  ];
}

/** standing.closed-same-turn — written and closed in one session, with no code moving between.
 * @param {import("../context.mjs").Ctx} ctx */
function* closedSameTurn(ctx) {
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
        "standing.closed-same-turn",
        GROUP,
        "block",
        "mechanical",
        `${record.conceptId} was written and set ${record.status} in one session; no commit touched its anchor in between.`,
        { recordId: record.conceptId },
      );
    }
  }
}

/**
 * standing.resolved-unmoved — a risk closed while the code it feared never
 * moved. The evidence is the anchor hash `anchor-resolve` reports: `match` is
 * the code the record was written against, byte for byte. An anchor nobody
 * could resolve says nothing.
 * @param {import("../context.mjs").Ctx} ctx
 */
function* resolvedUnmoved(ctx) {
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
      "standing.resolved-unmoved",
      GROUP,
      "block",
      "mechanical",
      `${record.conceptId} is resolved and every anchor still hashes to the code it was written against.`,
      { recordId: record.conceptId },
    );
  }
}

/** standing.self-owned-question — a question the author owns is a question nobody answers.
 * @param {import("../context.mjs").Ctx} ctx */
function* selfOwnedQuestion(ctx) {
  for (const record of ctx.touched) {
    if (record.type !== "open-question" || !record.owner) continue;
    if (record.owner !== record.writtenBy) continue;
    yield finding(
      "standing.self-owned-question",
      GROUP,
      "block",
      "mechanical",
      `${record.conceptId} is owned by ${record.owner}, who wrote it.`,
      { recordId: record.conceptId },
    );
  }
}

/** standing.supersede-chain — a chain of supersessions inside one session.
 * @param {import("../context.mjs").Ctx} ctx */
function* supersedeChain(ctx) {
  const chain = ctx.logAdded.filter(
    (entry) => asString(entry?.operation) === "supersede",
  );
  if (chain.length > 2) {
    yield finding(
      "standing.supersede-chain",
      GROUP,
      "warn",
      "mechanical",
      `${chain.length} supersessions this session; the base is being rewritten, not corrected.`,
    );
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
