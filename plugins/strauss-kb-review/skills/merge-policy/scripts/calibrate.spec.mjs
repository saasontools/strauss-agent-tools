// @ts-check
/**
 * The calibration loop's read side, over a GitHub dump written by hand. What it
 * counts is what decides whether a class may be flipped to `auto`, so the
 * arithmetic is pinned here rather than read off a live repository.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  calibrate as rates,
  observations,
  parseVerdict,
  renderCalibration,
  stickyOf,
  thresholdsAt,
} from "./lib/calibrate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DUMP = join(HERE, "fixtures", "calibration-dump.json");

/** The grouped rates, widened: every field a test reads is checked by hand.
 * @param {any[]} rows @param {{ window: number, maxFalseAuto: number }} thresholds
 * @returns {any[]} */
function calibrate(rows, thresholds) {
  return rates(rows, thresholds);
}

const DEFAULTS = { window: 20, maxFalseAuto: 0 };

/** One observation, as `observations` builds it. @param {Partial<any>} over */
function row(over) {
  return {
    pr: 1,
    would: "auto",
    rule: "auto-mechanical",
    policyHash: "sha256:one",
    classes: { docs: 1 },
    disagreement: false,
    signals: [],
    ...over,
  };
}

test("the dump's sticky comment is what carries the verdict", () => {
  const dump = JSON.parse(readFileSync(DUMP, "utf8"));
  const { rows, noVerdict } = observations(dump);

  // Three sticky comments, and one PR nobody has posted a verdict on yet.
  assert.equal(rows.length, 3);
  assert.equal(noVerdict, 1);
  assert.deepEqual(
    rows.map((/** @type {any} */ entry) => [
      entry.pr,
      entry.would,
      entry.policyHash,
      entry.disagreement,
    ]),
    [
      [101, "auto", "sha256:current", false],
      [102, "auto", "sha256:current", true],
      [103, "auto", "sha256:stale", true],
    ],
  );
  // The label on 102 and the 👎 on 103's comment are each named as the signal.
  assert.deepEqual(rows[1]?.signals, ["label:policy:would-not-auto"]);
  assert.deepEqual(rows[2]?.signals, ["reaction:-1 by someone"]);
});

test("a stale config hash does not count toward the current policy", () => {
  const dump = JSON.parse(readFileSync(DUMP, "utf8"));
  const groups = calibrate(observations(dump).rows, DEFAULTS);

  assert.deepEqual(
    groups.map((group) => [
      group.policyHash,
      group.routes[0].n,
      group.routes[0].rate,
    ]),
    [
      // Two PRs under the current policy, one of them disagreed with; the
      // stale-hash PR starts its own count rather than joining theirs.
      ["sha256:current", 2, 0.5],
      ["sha256:stale", 1, 1],
    ],
  );
});

test("a comment with no fence, and one that is not ours, are no verdict", () => {
  assert.equal(parseVerdict("<!-- strauss-kb merge-policy -->\nno fence"), null);
  assert.equal(
    parseVerdict("<!-- strauss-kb merge-policy:verdict -->\n```json\n{ no\n```"),
    null,
  );
  assert.equal(stickyOf([{ body: "looks unrelated" }]), null);
  // A rerun leaves the newest of this step's comments standing.
  assert.equal(
    stickyOf([
      { body: "<!-- strauss-kb merge-policy -->\nold" },
      { body: "<!-- strauss-kb merge-policy -->\nnew" },
    ])?.body.endsWith("new"),
    true,
  );
});

test("a withheld verdict is no observation, and never a silent agreement", () => {
  const { rows, noVerdict } = observations([
    {
      number: 5,
      labels: [],
      comments: [
        {
          body: '<!-- strauss-kb merge-policy -->\n<!-- strauss-kb merge-policy:verdict -->\n```json\n{"mode":"dry-run","withheld":true,"policyHash":"sha256:one"}\n```',
        },
      ],
    },
  ]);
  assert.deepEqual(rows, []);
  assert.equal(noVerdict, 1);
});

test("a bot's 👎 is not a disagreement, and a REST dump reads the same", () => {
  const sticky = (/** @type {unknown} */ reactions) => ({
    number: 7,
    labels: [],
    comments: [
      {
        body: '<!-- strauss-kb merge-policy -->\n<!-- strauss-kb merge-policy:verdict -->\n```json\n{"would":"auto","rule":"r","policyHash":"h","classes":{"docs":1}}\n```',
        reactions,
      },
    ],
  });

  const bot = observations(
    [sticky([{ content: "-1", user: { login: "policy-bot", type: "Bot" } }])],
    ["policy-bot"],
  );
  assert.equal(bot.rows[0]?.disagreement, false);

  const person = observations([
    sticky([{ content: "-1", user: { login: "dana", type: "User" } }]),
  ]);
  assert.equal(person.rows[0]?.disagreement, true);
});

test("the false-auto rate is per class and per rule, over would-auto PRs", () => {
  const groups = calibrate(
    [
      // Four docs PRs; one of them a human said should not have merged.
      row({ pr: 1, classes: { docs: 2 } }),
      row({ pr: 2 }),
      row({ pr: 3 }),
      row({ pr: 4, classes: { docs: 1, test: 3 }, disagreement: true }),
      // A human route is not a candidate for auto, so it is not counted.
      row({
        pr: 5,
        would: "human",
        rule: "default-human",
        disagreement: true,
      }),
    ],
    DEFAULTS,
  );

  assert.equal(groups.length, 1);
  const [auto] = groups[0].routes;
  assert.equal(auto.would, "auto");
  assert.equal(auto.n, 4);
  assert.equal(auto.disagreed, 1);
  assert.equal(auto.rate, 0.25);

  assert.deepEqual(
    auto.byClass.map((/** @type {any} */ entry) => [
      entry.name,
      entry.n,
      entry.rate,
    ]),
    [
      ["docs", 4, 0.25],
      // The one PR that also touched tests is the one that was disagreed with.
      ["test", 1, 1],
    ],
  );
  assert.deepEqual(
    auto.byRule.map((/** @type {any} */ entry) => [
      entry.name,
      entry.n,
      entry.rate,
    ]),
    [["auto-mechanical", 4, 0.25]],
  );
  // Four PRs is short of the window, so nothing is ready however clean it is.
  assert.equal(auto.byClass[0].ready, false);
});

test("agent-review-then-auto is counted the same way, beside auto", () => {
  const [group] = calibrate(
    [
      row({ pr: 1 }),
      row({
        pr: 2,
        would: "agent-review-then-auto",
        rule: "reviewer-clean",
        classes: { source: 1 },
        disagreement: true,
      }),
    ],
    DEFAULTS,
  );
  assert.deepEqual(
    group.routes.map((/** @type {any} */ route) => [
      route.would,
      route.n,
      route.rate,
    ]),
    [
      ["agent-review-then-auto", 1, 1],
      ["auto", 1, 0],
    ],
  );
});

test("a class is ready only once the window is full and the cap is met", () => {
  const clean = Array.from({ length: 3 }, (_, at) => row({ pr: at + 1 }));
  const tight = { window: 3, maxFalseAuto: 0 };
  assert.equal(calibrate(clean, tight)[0].routes[0].byClass[0].ready, true);

  const one = [...clean, row({ pr: 4, disagreement: true })];
  assert.equal(calibrate(one, tight)[0].routes[0].byClass[0].ready, false);
  // The same evidence against a cap that tolerates a quarter of it passes.
  assert.equal(
    calibrate(one, { window: 3, maxFalseAuto: 0.25 })[0].routes[0].byClass[0]
      .ready,
    true,
  );
});

test("the thresholds come from the policy, or from the built-in defaults", () => {
  /** @param {Record<string, string>} tree */
  const show = (tree) => (/** @type {string[]} */ args) =>
    tree[args[0] ?? ""] ?? null;

  assert.deepEqual(thresholdsAt(show({}), "HEAD", null), DEFAULTS);
  assert.deepEqual(
    thresholdsAt(
      show({
        "HEAD:.strauss/merge-policy.json": JSON.stringify({
          version: 1,
          calibration: { window: 5, maxFalseAuto: 0.1 },
        }),
      }),
      "HEAD",
      null,
    ),
    { window: 5, maxFalseAuto: 0.1 },
  );
  // A policy that will not parse falls back rather than reporting its numbers.
  assert.deepEqual(
    thresholdsAt(
      show({ "HEAD:.strauss/merge-policy.json": "{ not json" }),
      "HEAD",
      null,
    ),
    DEFAULTS,
  );
});

test("the table names the policy, the route, the rate and the verdict", () => {
  const groups = calibrate([row({ pr: 1 }), row({ pr: 2, disagreement: true })], {
    window: 2,
    maxFalseAuto: 0.5,
  });
  const text = renderCalibration({
    dump: "prs.json",
    prs: 3,
    verdicts: 2,
    noVerdict: 1,
    thresholds: { window: 2, maxFalseAuto: 0.5 },
    groups,
  });
  assert.match(text, /calibration — prs\.json/);
  assert.match(
    text,
    /2 verdict\(s\) over 3 pull request\(s\).+1 with no verdict/,
  );
  assert.match(
    text,
    /policy sha256:one — would: auto \(50\.0% false-auto over 2\)/,
  );
  assert.match(text, /false-auto\s+n\s+verdict/);
  assert.match(text, /by class\n\s+docs\s+50\.0%\s+2\s+ready/);
  assert.match(text, /by rule\n\s+auto-mechanical\s+50\.0%\s+2\s+ready/);

  const empty = renderCalibration({
    dump: "prs.json",
    prs: 0,
    verdicts: 0,
    noVerdict: 0,
    thresholds: DEFAULTS,
    groups: [],
  });
  assert.match(empty, /nothing to calibrate/);
});
