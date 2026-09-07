// @ts-check
/**
 * The route table. First match wins, top to bottom; the row that matched is
 * the reported `rule`. Every row above `auto-mechanical` routes `human`, so
 * an input can only ever add `human` — nothing here removes it.
 *
 * | # | rule | route | when |
 * | - | ---- | ----- | ---- |
 * | 1 | `no-policy` | human | no policy file at the base rev |
 * | 2 | `policy-disabled` | human | `enabled: false`, or the policy did not parse |
 * | 3 | `policy-changed` | human | the policy file changed in this range |
 * | 4 | `unearned-resolution` | human | a `review` record closed by its own author |
 * | 5 | `open-obligation` | human | blocking, open question, assumption, open test-obligation |
 * | 6 | `unverified-important` | human | `important` after floors, no verify that counts |
 * | 7 | `reviewer-dissent` | human | reviewer wrote a risk, or a `lies`/`disputed` verdict |
 * | 8 | `record-deleted` | human | a record the base or the log knew is gone, unsettled |
 * | 9 | `uncovered-change` | human | a gate family A block on a path review still covers |
 * | 10 | `gate-block` | human | any other gate block |
 * | 11 | `unreadable-record` | human | a record in the bundle that would not read |
 * | 12 | `gate-unavailable` | human | the gate crashed, timed out or printed nothing |
 * | 13 | `policy-human` | human | a record whose type or tag the policy dispositions `human` |
 * | 14 | `decider-escalate` | human | the fresh-eye decider escalated on the head sha |
 * | 15 | `auto-mechanical` | auto | only classes and paths the policy allows, base quiet |
 * | 16 | `reviewer-clean` | agent-review-then-auto | every record on the diff verified |
 * | 17 | `default-human` | human | everything else |
 *
 * Rows 4, 8, 9 and the approval read in `enforce.mjs` are the hardening: an
 * actor string is forgeable, so none of them takes the author's word.
 *
 * Row 14 is a veto and not an authority: it sits below every row that already
 * says `human`, so a decider is only ever asked about a range the deterministic
 * rows were about to let through, and `concur` matches nothing.
 */
import { matchesAny } from "./policy.mjs";

/** @typedef {import("./inputs.mjs").Input} Input */

/** Types whose open state is an obligation, not a note. */
const ASSUMING = ["requirement", "constraint"];

/** @type {{ id: string, route: "auto" | "human" | "agent-review-then-auto",
 *   when: (input: Input) => string | null }[]} */
export const RULES = [
  {
    id: "no-policy",
    route: "human",
    when: (input) =>
      input.policy.present ? null : "no merge policy at the base rev",
  },
  {
    id: "policy-disabled",
    route: "human",
    when: (input) =>
      input.policy.errors.length > 0
        ? `policy did not parse: ${input.policy.errors[0]}`
        : input.policy.data.enabled === "false"
          ? "policy is disabled"
          : null,
  },
  {
    id: "policy-changed",
    route: "human",
    when: (input) =>
      input.policyChanged ? "the merge policy changed in this range" : null,
  },
  {
    id: "unearned-resolution",
    route: "human",
    when: (input) =>
      input.unearned.length > 0
        ? `${input.unearned.join(", ")} closed by its own author, no verify behind it`
        : null,
  },
  {
    id: "open-obligation",
    route: "human",
    when: (input) => {
      const open = onDiff(input).filter(
        (record) =>
          record.effective === "blocking" ||
          (["open-question", "test-obligation"].includes(record.type) &&
            !terminal(record.status)) ||
          (record.assumption && ASSUMING.includes(record.type)),
      );
      return open.length > 0
        ? `open: ${open.map((record) => record.id).join(", ")}`
        : null;
    },
  },
  {
    id: "unverified-important",
    route: "human",
    when: (input) => {
      const bare = onDiff(input).filter(
        (record) =>
          record.effective === "important" && record.verifiedBy.length === 0,
      );
      return bare.length > 0
        ? `important and unverified: ${bare.map((record) => record.id).join(", ")}`
        : null;
    },
  },
  {
    id: "reviewer-dissent",
    route: "human",
    when: (input) => {
      if (!input.reviewer.present) return null;
      if (input.reviewer.risksWritten.length > 0) {
        return `the reviewer wrote ${input.reviewer.risksWritten.length} risk(s) the author did not`;
      }
      const against = Object.entries(input.reviewer.verdicts).filter(
        ([, verdict]) => ["lies", "disputed"].includes(verdict),
      );
      return against.length > 0
        ? `reviewer verdicts: ${against.map(([id, verdict]) => `${id}=${verdict}`).join(", ")}`
        : null;
    },
  },
  {
    id: "record-deleted",
    route: "human",
    when: (input) =>
      input.deleted.length > 0
        ? `gone from the tree, unsuperseded: ${input.deleted.join(", ")}`
        : null,
  },
  {
    id: "uncovered-change",
    route: "human",
    when: (input) => {
      const covered = new Set(reviewed(input).map((file) => file.path));
      const silent = input.gate.blocks.filter(
        (block) =>
          block.family === "A" && (!block.file || covered.has(block.file)),
      );
      return silent.length > 0
        ? `changed with nothing to say why: ${silent.map((block) => block.file ?? block.id).join(", ")}`
        : null;
    },
  },
  {
    id: "gate-block",
    route: "human",
    when: (input) =>
      input.gate.blocks.length > 0
        ? `gate blocks: ${input.gate.blocks.map((block) => block.id).join(", ")}`
        : null,
  },
  {
    id: "unreadable-record",
    route: "human",
    when: (input) =>
      input.unreadable.length > 0
        ? `unreadable in the bundle: ${input.unreadable.join(", ")}`
        : null,
  },
  {
    id: "gate-unavailable",
    route: "human",
    when: (input) =>
      input.gate.answered === false
        ? "the gate did not answer, so nothing it checks was checked"
        : null,
  },
  {
    id: "policy-human",
    route: "human",
    when: (input) => {
      const named = onDiff(input).filter(
        (record) => disposition(input, record) === "human",
      );
      return named.length > 0
        ? `the policy sends to a human: ${named.map((record) => record.id).join(", ")}`
        : null;
    },
  },
  {
    id: "decider-escalate",
    route: "human",
    when: (input) =>
      input.decider.present && input.decider.verdict === "escalate"
        ? `the decider escalated: ${input.decider.reason}`
        : null,
  },
  {
    id: "auto-mechanical",
    route: "auto",
    when: (input) => {
      const { autoClasses, autoPaths } = input.policy.data;
      const classes = new Set(autoClasses);
      // An allowlist, default deny: a class or a path no layer named is loud.
      const loud = reviewed(input).filter(
        (file) => !classes.has(file.class) && !matchesAny(file.path, autoPaths),
      );
      if (loud.length > 0) return null;
      return quiet(input)
        ? "only mechanical classes, and the base is quiet"
        : null;
    },
  },
  {
    id: "reviewer-clean",
    route: "agent-review-then-auto",
    when: (input) => {
      if (!input.reviewer.present) return null;
      const records = onDiff(input);
      if (records.length === 0) return null;
      const unverified = records.filter(
        (record) => input.reviewer.verdicts[record.id] !== "verified",
      );
      if (unverified.length > 0) return null;
      const above = records.filter(
        (record) => record.effective !== "non-blocking",
      );
      return above.length > 0
        ? null
        : "the reviewer verified every record on the diff";
    },
  },
  {
    id: "default-human",
    route: "human",
    when: () => "no row above cleared this range",
  },
];

/** @param {Input} input */
export function decide(input) {
  for (const rule of RULES) {
    const reason = rule.when(input);
    if (reason) return { route: rule.route, rule: rule.id, reason };
  }
  // Unreachable: `default-human` always answers.
  return {
    route: /** @type {const} */ ("human"),
    rule: "default-human",
    reason: "",
  };
}

/** Changed files review still covers: everything but an exclusion that holds.
 * @param {Input} input */
export function reviewed(input) {
  return input.files.filter((file) => !file.excluded || file.crosses);
}

/** @param {Input} input */
function onDiff(input) {
  return input.records.filter((record) => record.onDiff);
}

/** @param {string} status */
function terminal(status) {
  return ["resolved", "rejected", "superseded"].includes(status);
}

/**
 * The most human-ward thing the policy says about a record: `human` from
 * either map routes, `auto` from either makes it eligible, and anything the
 * policy did not name is `off`.
 * @param {Input} input @param {Input["records"][number]} record
 * @returns {import("./policy.mjs").Disposition}
 */
function disposition(input, record) {
  const { types, tags } = input.policy.data;
  const said = [types[record.type], ...record.tags.map((tag) => tags[tag])];
  if (said.includes("human")) return "human";
  return said.includes("auto") ? "auto" : "off";
}

/**
 * Is the base quiet on this range? Silent, or saying only `decision.none`, or
 * saying something a machine can re-run, or a type or tag the policy marked
 * `auto` — and in every case nothing a floor raised. The third arm is what
 * lets a generated file's `review:generated` fact route auto instead of
 * blocking on its own existence.
 * @param {Input} input
 */
function quiet(input) {
  return onDiff(input).every(
    (record) =>
      record.id === "decision.none" ||
      (record.effective === "non-blocking" &&
        (record.verify.length > 0 || disposition(input, record) === "auto")),
  );
}
