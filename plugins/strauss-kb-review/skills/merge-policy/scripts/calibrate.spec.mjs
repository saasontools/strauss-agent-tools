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
  policyAt,
  renderCalibration,
  stickyOf,
} from "./lib/calibrate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DUMP = join(HERE, "fixtures", "calibration-dump.json");

/** The grouped rates, widened: every field a test reads is checked by hand.
 * The rows' own hash is the current one unless a test says otherwise.
 * @param {any[]} rows @param {{ window: number, maxFalseAuto: number }} thresholds
 * @param {string | null} [currentHash] @returns {any[]} */
function calibrate(rows, thresholds, currentHash = "sha256:one") {
  return rates(rows, thresholds, currentHash);
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
  const { rows, noComment } = observations(dump);

  // Three sticky comments, and one PR nobody has posted a verdict on yet.
  assert.equal(rows.length, 3);
  assert.equal(noComment, 1);
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
      // 103's 👎 is a bare `reactionGroups` count, which names no reactor.
      [103, "auto", "sha256:stale", false],
    ],
  );
  assert.deepEqual(rows[1]?.signals, ["label:policy:would-not-auto"]);
});

test("a marker from any login but the bot's is not the sticky", () => {
  const dump = JSON.parse(readFileSync(DUMP, "utf8"));
  const forged = {
    author: { login: "mallory" },
    body: '<!-- strauss-kb merge-policy -->\n<!-- strauss-kb merge-policy:verdict -->\n```json\n{"would":"auto","rule":"forged","policyHash":"sha256:current","classes":{"docs":9}}\n```',
  };
  dump[0].comments.push(forged);

  const [first] = observations(dump).rows;
  assert.equal(first.rule, "auto-mechanical");
  assert.deepEqual(first.classes, { docs: 2 });

  // Naming the forger as the bot is the only way to read their comment back.
  assert.equal(observations(dump, ["mallory"]).rows[0]?.rule, "forged");
});

test("a stale config hash does not count toward the current policy", () => {
  const dump = JSON.parse(readFileSync(DUMP, "utf8"));
  const groups = calibrate(
    observations(dump).rows,
    { window: 1, maxFalseAuto: 1 },
    "sha256:current",
  );

  assert.deepEqual(
    groups.map((group) => [
      group.policyHash,
      group.current,
      group.routes[0].n,
      group.routes[0].rate,
      group.routes[0].byClass[0].ready,
    ]),
    [
      // Two PRs under the current policy, one of them disagreed with; the
      // stale-hash PR starts its own count and can never read `ready`.
      ["sha256:current", true, 2, 0.5, true],
      ["sha256:stale", false, 1, 0, false],
    ],
  );

  const text = renderCalibration({
    dump: DUMP,
    prs: 4,
    verdicts: 3,
    noComment: 1,
    withheld: 0,
    unreadable: 0,
    thresholds: { window: 1, maxFalseAuto: 1 },
    policyHash: "sha256:current",
    groups,
  });
  assert.match(text, /policy sha256:current — current — would: auto/);
  assert.match(text, /policy sha256:stale — stale \(policy changed\) — would/);
});

test("a comment with no fence, and one that is not ours, are no verdict", () => {
  assert.equal(parseVerdict("<!-- strauss-kb merge-policy -->\nno fence"), null);
  assert.equal(
    parseVerdict("<!-- strauss-kb merge-policy:verdict -->\n```json\n{ no\n```"),
    null,
  );
  const bot = { login: "github-actions[bot]" };
  assert.equal(stickyOf([{ author: bot, body: "looks unrelated" }]), null);
  // A rerun leaves the newest of this step's comments standing.
  assert.equal(
    stickyOf([
      { author: bot, body: "<!-- strauss-kb merge-policy -->\nold" },
      { author: bot, body: "<!-- strauss-kb merge-policy -->\nnew" },
    ])?.body.endsWith("new"),
    true,
  );
});

test("a withheld verdict is no observation, and never a silent agreement", () => {
  const { rows, withheld, unreadable } = observations([
    {
      number: 5,
      labels: [],
      comments: [
        {
          author: { login: "github-actions[bot]" },
          body: '<!-- strauss-kb merge-policy -->\n<!-- strauss-kb merge-policy:verdict -->\n```json\n{"mode":"dry-run","withheld":true,"policyHash":"sha256:one"}\n```',
        },
      ],
    },
  ]);
  assert.deepEqual(rows, []);
  assert.equal(withheld, 1);
  assert.equal(unreadable, 0);

  // A comment of ours carrying no fence at all is unreadable, not withheld.
  const torn = observations([
    {
      number: 6,
      labels: [],
      comments: [
        {
          author: { login: "github-actions[bot]" },
          body: "<!-- strauss-kb merge-policy -->\nthe fence was cut",
        },
      ],
    },
  ]);
  assert.equal(torn.unreadable, 1);
  assert.equal(torn.withheld, 0);
});

test("a 👎 counts only from a dump that names a human reactor", () => {
  /** @param {Record<string, unknown>} how the reaction shape under test */
  const sticky = (how) => ({
    number: 7,
    labels: [],
    comments: [
      {
        author: { login: "github-actions[bot]" },
        body: '<!-- strauss-kb merge-policy -->\n<!-- strauss-kb merge-policy:verdict -->\n```json\n{"would":"auto","rule":"r","policyHash":"h","classes":{"docs":1}}\n```',
        ...how,
      },
    ],
  });
  /** @param {Record<string, unknown>} how @param {string[]} [bots] */
  const said = (how, bots = []) =>
    observations([sticky(how)], bots).rows[0]?.disagreement;

  // `gh pr list` counts reactors without naming them, so it says nothing.
  assert.equal(
    said({
      reactionGroups: [{ content: "THUMBS_DOWN", users: { totalCount: 1 } }],
    }),
    false,
  );
  // The same groups, from a query that listed the users, do name one.
  assert.equal(
    said({
      reactionGroups: [
        { content: "THUMBS_DOWN", users: { nodes: [{ login: "dana" }] } },
      ],
    }),
    true,
  );
  // `--bot-logins` gates the sticky's author and the reactors alike, so the
  // poster is named beside the reacting app.
  assert.equal(
    said({ reactions: [{ content: "-1", user: { login: "policy-bot" } }] }, [
      "github-actions[bot]",
      "policy-bot",
    ]),
    false,
  );
  assert.equal(
    said({ reactions: [{ content: "-1", user: { login: "dana" } }] }),
    true,
  );
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

test("the thresholds and the current hash come from the policy at HEAD", () => {
  /** @param {Record<string, string>} tree */
  const show = (tree) => (/** @type {string[]} */ args) =>
    tree[args[0] ?? ""] ?? null;

  const absent = policyAt(show({}), "HEAD", null);
  assert.deepEqual(absent.thresholds, DEFAULTS);
  assert.equal(absent.hash, null);

  const named = policyAt(
    show({
      "HEAD:.strauss/merge-policy.json": JSON.stringify({
        version: 1,
        calibration: { window: 5, maxFalseAuto: 0.1 },
      }),
    }),
    "HEAD",
    null,
  );
  assert.deepEqual(named.thresholds, { window: 5, maxFalseAuto: 0.1 });
  assert.match(named.hash ?? "", /^sha256:[0-9a-f]{64}$/);

  // A policy that will not parse falls back rather than reporting its numbers,
  // and names no current hash, so no group can read `ready` off it.
  const broken = policyAt(
    show({ "HEAD:.strauss/merge-policy.json": "{ not json" }),
    "HEAD",
    null,
  );
  assert.deepEqual(broken.thresholds, DEFAULTS);
  assert.equal(broken.hash, null);
});

test("the table names the policy, the route, the rate and the verdict", () => {
  const groups = calibrate([row({ pr: 1 }), row({ pr: 2, disagreement: true })], {
    window: 2,
    maxFalseAuto: 0.5,
  });
  const text = renderCalibration({
    dump: "prs.json",
    prs: 5,
    verdicts: 2,
    noComment: 1,
    withheld: 2,
    unreadable: 0,
    thresholds: { window: 2, maxFalseAuto: 0.5 },
    policyHash: "sha256:one",
    groups,
  });
  assert.match(text, /calibration — prs\.json/);
  assert.match(
    text,
    /2 verdict\(s\) over 5 pull request\(s\), minimum 2 observation\(s\) per class/,
  );
  // Each skipped count on its own line, and only the ones that happened.
  assert.match(text, /\n {2}1 with no comment yet\n {2}2 still withheld\n/);
  assert.doesNotMatch(text, /unreadable/);
  assert.match(
    text,
    /policy sha256:one — current — would: auto \(50\.0% false-auto over 2\)/,
  );
  assert.match(text, /false-auto\s+n\s+verdict/);
  assert.match(text, /by class\n\s+docs\s+50\.0%\s+2\s+ready/);
  assert.match(text, /by rule\n\s+auto-mechanical\s+50\.0%\s+2\s+ready/);

  const empty = renderCalibration({
    dump: "prs.json",
    prs: 0,
    verdicts: 0,
    noComment: 0,
    withheld: 0,
    unreadable: 0,
    thresholds: DEFAULTS,
    policyHash: null,
    groups: [],
  });
  assert.match(empty, /nothing to calibrate/);
});
