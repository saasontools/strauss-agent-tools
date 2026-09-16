// @ts-check
/** Which records each hop takes, by rule — never by judgment. */

/** Types whose current head outlives the review. */
const HEAD_TYPES = new Set([
  "decision",
  "fact",
  "flow",
  "requirement",
  "contract",
]);

/** Types the repo base keeps at merge, once an anchor still resolves. */
const REPO_TYPES = new Set(["decision", "fact", "flow"]);

/** A record nothing carries forward: it was withdrawn where it was written. */
const WITHDRAWN = new Set(["superseded", "rejected"]);

/** The claim that there was nothing to decide. It describes one turn, not the code. */
const NO_DECISION = "decision.none";

/**
 * @typedef {import("../base.mjs").BaseRecord} BaseRecord
 * @typedef {{ record: BaseRecord, why: string }} Taken
 * @typedef {{ record: BaseRecord, why: string, finding: boolean }} Left
 * @typedef {{ taken: Taken[], left: Left[] }} Selection
 */

/** `agent:<name>` for every reviewer on the roster. @param {string[]} roster */
export function reviewerActors(roster) {
  return new Set(roster.map((name) => `agent:${name}`));
}

/** @param {BaseRecord} record @param {Set<string>} reviewers */
function byReviewer(record, reviewers) {
  return record.writtenBy !== undefined && reviewers.has(record.writtenBy);
}

/**
 * A finding the review hop must not lose: a reviewer's risk, or a question
 * still unanswered. Selected whatever its state, and refused if it would be
 * dropped.
 * @param {BaseRecord} record @param {Set<string>} reviewers
 */
export function isFinding(record, reviewers) {
  if (record.type === "risk") return byReviewer(record, reviewers);
  return record.type === "open-question" && record.status !== "resolved";
}

/** A risk nobody has to carry past the merge. */
const TERMINAL = new Set(["resolved", "rejected", "accepted", "superseded"]);

/**
 * A finding still owed an answer. The merge hop refuses over one rather than
 * leave it behind: level 2 is deleted at merge, so dropping it here loses it.
 * @param {BaseRecord} record @param {Set<string>} reviewers
 */
export function isOpenFinding(record, reviewers) {
  if (!isFinding(record, reviewers)) return false;
  return record.type !== "risk" || !TERMINAL.has(record.status);
}

/**
 * Level 1 → 2: what a human should read, out of a scratchpad written freely.
 * @param {BaseRecord[]} records @param {Set<string>} reviewers
 * @param {(path: string) => boolean} [isTest] whether a path is a test file
 * @returns {Selection}
 */
export function selectForReview(records, reviewers, isTest = () => false) {
  /** @type {Taken[]} */
  const taken = [];
  /** @type {Left[]} */
  const left = [];
  for (const record of records) {
    const finding = isFinding(record, reviewers);
    const why = reviewWhy(record, reviewers, isTest);
    if (why.take) taken.push({ record, why: why.reason });
    else left.push({ record, why: why.reason, finding });
  }
  return { taken, left };
}

/**
 * @param {BaseRecord} record @param {Set<string>} reviewers
 * @param {(path: string) => boolean} isTest
 * @returns {{ take: boolean, reason: string }}
 */
function reviewWhy(record, reviewers, isTest) {
  const withdrawn =
    WITHDRAWN.has(record.status) || record.standing === "superseded";

  if (record.type === "risk") {
    if (!byReviewer(record, reviewers)) {
      return { take: false, reason: "risk not written by a reviewer" };
    }
    return { take: true, reason: "reviewer's risk" };
  }
  if (record.type === "open-question") {
    return record.status === "resolved"
      ? { take: false, reason: "question answered" }
      : { take: true, reason: "question still unanswered" };
  }
  if (record.type === "test-obligation") {
    // The anchor is where the author put the check. An obligation anchored on a
    // test file names a test that exists; one anchored on source is still owed.
    if (record.status !== "open") return { take: false, reason: "test landed" };
    return record.anchors.some((anchor) => isTest(anchor.file))
      ? { take: false, reason: "test landed" }
      : { take: true, reason: "test still deferred" };
  }
  if (!HEAD_TYPES.has(record.type)) {
    return { take: false, reason: `${record.type} stays in the scratchpad` };
  }
  if (record.conceptId === NO_DECISION) {
    return {
      take: false,
      reason: "decision.none describes a turn, not the code",
    };
  }
  if (withdrawn) {
    return { take: false, reason: `${record.status} where it was written` };
  }
  return { take: true, reason: `current ${record.type}` };
}

/**
 * Level 2 → 3: what outlives the pull request. An anchor that no longer points
 * at a tracked file describes code the merge does not keep.
 * @param {BaseRecord[]} records @param {(anchor: import("../util.mjs").Anchor) => boolean} live
 * @returns {Selection}
 */
export function selectForRepo(records, live) {
  /** @type {Taken[]} */
  const taken = [];
  /** @type {Left[]} */
  const left = [];
  for (const record of records) {
    const withdrawn =
      WITHDRAWN.has(record.status) || record.standing === "superseded";
    // An accepted risk is kept on a decision's terms: the review decided the
    // exposure is one the repository carries.
    const eligible =
      REPO_TYPES.has(record.type) ||
      (record.type === "risk" && record.status === "accepted");

    if (!eligible) {
      left.push({
        record,
        why: `${record.type} does not outlive the review`,
        finding: false,
      });
    } else if (record.conceptId === NO_DECISION) {
      left.push({
        record,
        why: "decision.none describes a turn, not the code",
        finding: false,
      });
    } else if (withdrawn) {
      left.push({
        record,
        why: `${record.status} where it was written`,
        finding: false,
      });
    } else if (!record.anchors.some(live)) {
      left.push({ record, why: "no live anchor", finding: false });
    } else {
      taken.push({ record, why: `anchored ${record.type}` });
    }
  }
  return { taken, left };
}
