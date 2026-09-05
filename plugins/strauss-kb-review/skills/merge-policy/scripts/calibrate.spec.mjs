// @ts-check
/**
 * The calibration loop's read side, over an events file written by hand. What
 * it counts is what decides whether a class may be flipped to `auto`, so the
 * arithmetic is pinned here rather than read off a live stream.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  calibrate as rates,
  latestPerPr,
  readDryRuns,
  renderCalibration,
  thresholdsAt,
} from "./lib/calibrate.mjs";

/** The grouped rates, widened: every field a test reads is checked by hand.
 * @param {any[]} events @param {{ window: number, maxFalseAuto: number }} thresholds
 * @returns {any[]} */
function calibrate(events, thresholds) {
  return rates(events, thresholds);
}

/** @type {string[]} */
const built = [];
after(() => {
  for (const dir of built) rmSync(dir, { recursive: true, force: true });
});

const DEFAULTS = { window: 20, maxFalseAuto: 0 };

/** One dry-run event. @param {Partial<any>} over */
function event(over) {
  const { ts, pr, sha, ...data } = over;
  return {
    ts: ts ?? "2026-03-01T00:00:00.000Z",
    component: "merge-policy",
    event: "dry-run",
    ...(pr === undefined ? {} : { pr }),
    ...(sha === undefined ? {} : { sha }),
    data: {
      would: "auto",
      rule: "auto-mechanical",
      policyHash: "sha256:one",
      classes: { docs: 1 },
      disagreement: false,
      blind: true,
      ...data,
    },
  };
}

/** A fresh slug directory. */
function stream() {
  const dir = mkdtempSync(join(tmpdir(), "calibrate-"));
  built.push(dir);
  return dir;
}

/** One file of the stream, as `emit` would have appended it.
 * @param {string} dir @param {string} name @param {unknown[]} lines */
function write(dir, name, lines) {
  writeFileSync(
    join(dir, name),
    `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`,
  );
}

test("only this step's dry runs are read, and a bad line is counted", () => {
  const dir = stream();
  write(dir, "events.jsonl", [
    event({ pr: 1 }),
    { component: "strauss-kb", event: "write" },
    { component: "merge-policy", event: "route" },
    "{ not json",
  ]);

  const read = readDryRuns(dir);
  assert.equal(read.events.length, 1);
  assert.equal(read.unreadable, 1);
  assert.equal(readDryRuns(join(dir, "nope")).events.length, 0);
});

test("--since cuts the stream, and rotated files are read oldest first", () => {
  const dir = stream();
  write(dir, "events.1.jsonl", [
    event({ pr: 1, ts: "2026-01-01T00:00:00.000Z" }),
  ]);
  write(dir, "events.jsonl", [
    event({ pr: 2, ts: "2026-06-01T00:00:00.000Z" }),
  ]);

  assert.equal(readDryRuns(dir).events.length, 2);
  const cut = readDryRuns(dir, "2026-03-01T00:00:00.000Z");
  assert.equal(cut.events.length, 1);
  assert.equal(cut.events[0].pr, 2);
});

test("only the newest ten files are read, a line at a time", () => {
  const dir = stream();
  // Twelve rotations plus the live file: the two oldest fall off the read.
  for (let n = 1; n <= 12; n += 1) {
    write(dir, `events.${n}.jsonl`, [
      event({
        pr: n,
        ts: `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`,
      }),
    ]);
  }
  write(dir, "events.jsonl", [
    event({ pr: 99, ts: "2026-02-01T00:00:00.000Z" }),
  ]);

  const read = readDryRuns(dir);
  assert.equal(read.events.length, 10);
  assert.deepEqual(
    read.events.map((/** @type {any} */ line) => line.pr),
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 99],
  );
});

test("a PR is one observation however many times it was pushed", () => {
  const held = latestPerPr([
    event({ pr: 7, ts: "2026-03-01T00:00:00.000Z" }),
    event({ pr: 7, ts: "2026-03-02T00:00:00.000Z", disagreement: true }),
    // A local run judged no PR, so it is never a denominator.
    event({ sha: "abc", ts: "2026-03-03T00:00:00.000Z" }),
  ]);
  assert.equal(held.length, 1);
  // The last word on PR 7 is the one that counts, by `ts` and not by order.
  assert.equal(held[0]?.data.disagreement, true);
  const reversed = latestPerPr([
    event({ pr: 7, ts: "2026-03-02T00:00:00.000Z", disagreement: true }),
    event({ pr: 7, ts: "2026-03-01T00:00:00.000Z" }),
  ]);
  assert.equal(reversed[0]?.data.disagreement, true);
});

test("the false-auto rate is per class and per rule, over would-auto PRs", () => {
  const groups = calibrate(
    [
      // Four docs PRs; one of them a human said should not have merged.
      event({ pr: 1, classes: { docs: 2 } }),
      event({ pr: 2, classes: { docs: 1 } }),
      event({ pr: 3, classes: { docs: 1 } }),
      event({ pr: 4, classes: { docs: 1, test: 3 }, disagreement: true }),
      // A human route is not a candidate for auto, so it is not counted.
      event({
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
    auto.byClass.map((/** @type {any} */ row) => [row.name, row.n, row.rate]),
    [
      ["docs", 4, 0.25],
      // The one PR that also touched tests is the one that was disagreed with.
      ["test", 1, 1],
    ],
  );
  assert.deepEqual(
    auto.byRule.map((/** @type {any} */ row) => [row.name, row.n, row.rate]),
    [["auto-mechanical", 4, 0.25]],
  );
  // Four PRs is short of the window, so nothing is ready however clean it is.
  assert.equal(auto.byClass[0].ready, false);
});

test("agent-review-then-auto is counted the same way, beside auto", () => {
  const [group] = calibrate(
    [
      event({ pr: 1 }),
      event({
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

test("a policy change starts the count over", () => {
  const groups = calibrate(
    [
      event({ pr: 1, policyHash: "sha256:one", disagreement: true }),
      event({ pr: 2, policyHash: "sha256:two" }),
      event({ pr: 3, policyHash: "sha256:two" }),
    ],
    DEFAULTS,
  );
  assert.deepEqual(
    groups.map((group) => [
      group.policyHash,
      group.routes[0].n,
      group.routes[0].rate,
    ]),
    [
      ["sha256:one", 1, 1],
      ["sha256:two", 2, 0],
    ],
  );
});

test("a class is ready only once the window is full and the cap is met", () => {
  const clean = Array.from({ length: 3 }, (_, at) => event({ pr: at + 1 }));
  const tight = { window: 3, maxFalseAuto: 0 };
  assert.equal(calibrate(clean, tight)[0].routes[0].byClass[0].ready, true);

  const one = [...clean, event({ pr: 4, disagreement: true })];
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
  const groups = calibrate(
    [event({ pr: 1 }), event({ pr: 2, disagreement: true })],
    { window: 2, maxFalseAuto: 0.5 },
  );
  const text = renderCalibration({
    repo: "acme/app",
    since: "2026-01-01T00:00:00.000Z",
    sink: "local",
    events: 2,
    unreadable: 0,
    thresholds: { window: 2, maxFalseAuto: 0.5 },
    groups,
  });
  assert.match(text, /calibration — acme\/app since 2026-01-01/);
  assert.match(text, /2 dry-run event\(s\) from the local sink/);
  assert.match(
    text,
    /policy sha256:one — would: auto \(50\.0% false-auto over 2\)/,
  );
  assert.match(text, /false-auto\s+n\s+verdict/);
  assert.match(text, /by class\n\s+docs\s+50\.0%\s+2\s+ready/);
  assert.match(text, /by rule\n\s+auto-mechanical\s+50\.0%\s+2\s+ready/);

  const empty = renderCalibration({
    repo: "acme/app",
    sink: "local",
    events: 0,
    unreadable: 0,
    thresholds: DEFAULTS,
    groups: [],
  });
  assert.match(empty, /nothing to calibrate/);
});
