// @ts-check
/**
 * The dry run: the shape it reports, who may see it, and what a human's
 * disagreement looks like. Built from a hand-written policy output, so a change
 * to either the model or the block shows up here first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blindOf,
  disagreement,
  DISAGREE_LABEL,
  humanReviewed,
  modeOf,
} from "./lib/dry-run.mjs";
import { redact, result } from "./lib/render.mjs";
import { MARKER, placeholder, report } from "./lib/report.mjs";

const HEAD_SHA = "d1135cbf7b0cbbeecece9700f4bff6910590084b";

/** @param {Partial<any>} [over] */
function input(over = {}) {
  return /** @type {any} */ ({
    base: "main",
    head: "topic",
    headSha: HEAD_SHA,
    policy: {
      present: true,
      path: ".strauss/merge-policy.json",
      version: 1,
      hash: "sha256:abc",
      format: "json",
      data: { enabled: "dry-run", owners: ["dana"] },
      notChecked: [],
      errors: [],
    },
    policyChanged: false,
    files: [
      {
        path: "docs/README.md",
        class: "docs",
        excluded: false,
        crosses: false,
      },
    ],
    records: [],
    unreadable: [],
    deleted: [],
    unearned: [],
    gate: {
      supplied: false,
      pending: false,
      blocks: [],
      warns: [],
      answered: true,
    },
    reviewer: { present: false, sha: null, verdicts: {}, risksWritten: [] },
    // The SAA-742 sibling reads `input.decider`; the union of the two branches
    // must not throw on a fixture written for either.
    decider: { present: false, notes: [] },
    approvals: [],
    log: [],
    ...over,
  });
}

const AUTO = {
  route: "auto",
  rule: "auto-mechanical",
  reason: "only mechanical classes",
};
const CLEAN = { exit: /** @type {0} */ (0), why: "auto", approvedBy: [] };

/** The `--json` model, for either mode. @param {Partial<any>} [over]
 * @param {Partial<any>} [how] @param {any} [decision] @returns {any} */
function model(over = {}, how = {}, decision = AUTO) {
  return result(input(over), decision, CLEAN, {
    enforcing: true,
    subject: "7",
    pr: "7",
    prUrl: "https://github.com/acme/app/pull/7",
    bundleDir: ".strauss/kb",
    mode: "dry-run",
    blind: false,
    labels: null,
    reactions: null,
    ...how,
  });
}

test("the mode is the policy's, unless --dry-run asked for one", () => {
  assert.equal(modeOf("true", false), "enforce");
  assert.equal(modeOf("false", false), "enforce");
  assert.equal(modeOf("dry-run", false), "dry-run");
  assert.equal(modeOf("true", true), "dry-run");
});

test("blind is the dry run's default; --visible turns it off", () => {
  assert.equal(blindOf("dry-run", { blind: false, visible: false }), true);
  assert.equal(blindOf("dry-run", { blind: false, visible: true }), false);
  assert.equal(blindOf("enforce", { blind: false, visible: false }), false);
  // A run that asked for it is blind whatever the mode: the flag is the say.
  assert.equal(blindOf("enforce", { blind: true, visible: false }), true);
});

test("a submitted review on the head sha counts, whatever it said", () => {
  const on = (/** @type {string} */ state, /** @type {string} */ sha) => [
    { user: "dana", state, commit_id: sha },
  ];
  assert.equal(humanReviewed(on("COMMENTED", HEAD_SHA), HEAD_SHA), true);
  assert.equal(
    humanReviewed(on("CHANGES_REQUESTED", HEAD_SHA), HEAD_SHA),
    true,
  );
  assert.equal(humanReviewed(on("APPROVED", HEAD_SHA), HEAD_SHA), true);
  // A draft nobody posted, and a review of an older push, are not a read.
  assert.equal(humanReviewed(on("PENDING", HEAD_SHA), HEAD_SHA), false);
  assert.equal(humanReviewed(on("APPROVED", "0".repeat(40)), HEAD_SHA), false);
  assert.equal(humanReviewed([], HEAD_SHA), false);
});

test("a bot's review never lifts the blind", () => {
  const bot = [
    {
      user: { login: "kb-reviewer[bot]", type: "Bot" },
      state: "COMMENTED",
      commit_id: HEAD_SHA,
    },
  ];
  assert.equal(humanReviewed(bot, HEAD_SHA), false);
  // The account type alone is enough, and so is the login alone.
  assert.equal(
    humanReviewed(
      [
        {
          user: { login: "dana", type: "Bot" },
          state: "APPROVED",
          commit_id: HEAD_SHA,
        },
      ],
      HEAD_SHA,
    ),
    false,
  );
  assert.equal(
    humanReviewed(
      [{ user: "helper[bot]", state: "APPROVED", commit_id: HEAD_SHA }],
      HEAD_SHA,
    ),
    false,
  );
  // A `verifiers` entry of kind `agent:` names no login, so the caller does.
  const agent = [
    { user: "kb-reviewer", state: "COMMENTED", commit_id: HEAD_SHA },
  ];
  assert.equal(humanReviewed(agent, HEAD_SHA), true);
  assert.equal(humanReviewed(agent, HEAD_SHA, ["KB-Reviewer"]), false);
  // The gathered shape carries the type beside the login, not inside it.
  assert.equal(
    humanReviewed(
      [
        {
          user: "kb-reviewer",
          type: "Bot",
          state: "COMMENTED",
          commit_id: HEAD_SHA,
        },
      ],
      HEAD_SHA,
    ),
    false,
  );
});

test("a label or a 👎 is a disagreement, and nothing else is", () => {
  assert.deepEqual(disagreement([], []), { disagreement: false, signals: [] });

  const labelled = disagreement([{ name: DISAGREE_LABEL }], []);
  assert.equal(labelled.disagreement, true);
  assert.deepEqual(labelled.signals, [`label:${DISAGREE_LABEL}`]);

  const reacted = disagreement([], [{ content: "-1", user: "dana" }]);
  assert.equal(reacted.disagreement, true);
  assert.deepEqual(reacted.signals, ["reaction:-1 by dana"]);

  // The reactions API's login lives under `user`, and the emoji is taken too.
  assert.equal(
    disagreement([], [{ content: "👎", user: { login: "eve" } }]).signals[0],
    "reaction:👎 by eve",
  );

  // The step reacts to its own comment through an app, and names its poster.
  assert.equal(
    disagreement([], [{ content: "-1", user: "github-actions[bot]" }])
      .disagreement,
    false,
  );
  assert.equal(
    disagreement([], [{ content: "👎", user: { login: "dana", type: "Bot" } }])
      .disagreement,
    false,
  );
  assert.equal(
    disagreement([], [{ content: "-1", user: "sticky" }], ["Sticky"])
      .disagreement,
    false,
  );

  // A thumbs up, a rocket and another label say nothing about this route.
  assert.equal(
    disagreement(
      [{ name: "needs-docs" }, "chore"],
      [
        { content: "+1", user: "dana" },
        { content: "rocket", user: "dana" },
      ],
    ).disagreement,
    false,
  );
});

test("a dry run reports `would`, never `route`, and never fails a build", () => {
  const dry = model();
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.would, "auto");
  assert.equal("route" in dry, false);
  assert.equal(dry.enforce.exit, 0);

  // The `--dry-run` flag over a policy that is enabled reaches the same place.
  const forced = model({
    policy: { ...input().policy, data: { enabled: "true", owners: ["dana"] } },
  });
  assert.equal(forced.mode, "dry-run");
  assert.equal(forced.would, "auto");

  const enforced = model({}, { mode: "enforce" });
  assert.equal(enforced.route, "auto");
  assert.equal("would" in enforced, false);
});

test("--enforce exits 0 under a dry run for every route", () => {
  for (const route of ["auto", "agent-review-then-auto", "human"]) {
    const dry = model(
      {},
      {},
      { route, rule: "default-human", reason: "nothing cleared this range" },
    );
    assert.equal(dry.enforce.exit, 0, route);
    assert.match(dry.enforce.why, /dry run/, route);
  }
});

test("the block header says what it would have done", () => {
  const block = report(model());
  assert.ok(block.startsWith(`${MARKER}\n`), block);
  assert.match(block, /### Merge policy \(dry run\): would auto/);
  assert.match(block, /\| would \| `auto` via `auto-mechanical` \|/);
  assert.ok(!block.includes("| route |"), block);

  const enforced = report(model({}, { mode: "enforce" }));
  assert.match(enforced, /### Merge policy: auto/);
  assert.match(enforced, /\| route \| `auto` via `auto-mechanical` \|/);
});

test("blind withholds the verdict until a human has reviewed the head", () => {
  const held = model({}, { blind: true });
  assert.deepEqual(held.signals, {
    blind: true,
    humanReviewed: false,
    withheld: true,
    disagreement: false,
    signals: [],
  });

  // The verdict is off the JSON and the table too, not just the block.
  const hidden = redact(held);
  assert.equal(hidden.would, "<withheld>");
  assert.equal(hidden.withheld, true);
  assert.equal(held.would, "auto");

  const block = placeholder(held);
  assert.ok(block.startsWith(`${MARKER}\n`), block);
  assert.match(
    block,
    new RegExp(
      `verdict is withheld until the first human review on \`${HEAD_SHA}\``,
    ),
  );
  // Nothing in the placeholder says which way it would have gone.
  assert.ok(!block.includes("auto"), block);
  assert.ok(!block.includes("auto-mechanical"), block);

  // One review of the head commit — a comment is enough — and it is released.
  const seen = model(
    { approvals: [{ user: "dana", state: "COMMENTED", commit_id: HEAD_SHA }] },
    { blind: true },
  );
  assert.equal(seen.signals.humanReviewed, true);
  assert.equal(seen.signals.withheld, false);
});

test("visible writes the verdict straight away", () => {
  const open = model({}, { blind: false });
  assert.equal(open.signals.blind, false);
  assert.equal(open.signals.withheld, false);
  assert.equal(redact(open), open);
  assert.match(report(open), /would auto/);
});

test("a disagreement rides in the model and in the block", () => {
  const crossed = model(
    {},
    { labels: [{ name: DISAGREE_LABEL }], reactions: [] },
  );
  assert.equal(crossed.signals.disagreement, true);
  assert.match(
    report(crossed),
    /\| disagreement \| label:policy:would-not-auto \|/,
  );

  const quiet = model();
  assert.equal(quiet.signals.disagreement, false);
  assert.ok(!report(quiet).includes("| disagreement |"));
});
