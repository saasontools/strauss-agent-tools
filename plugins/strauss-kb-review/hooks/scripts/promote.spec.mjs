// @ts-check
/**
 * The two hops: the rules over hand-built records, and one end-to-end run
 * through the real CLI so the refusals are tested against the store.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveLocalBin } from "./lib/cli.mjs";
import { bundles, parseArgs, promote } from "./kb-promote.mjs";
import { renderReport } from "./lib/promote/report.mjs";
import {
  isOpenFinding,
  reviewerActors,
  selectForRepo,
  selectForReview,
} from "./lib/promote/select.mjs";

const REVIEWERS = reviewerActors(["correctness", "security"]);

/** @param {Partial<any>} fields @returns {any} */
function record(fields = {}) {
  return {
    conceptId: `${fields.type ?? "decision"}.${fields.slug ?? "a"}`,
    file: "",
    type: "decision",
    title: "T",
    status: "accepted",
    standing: "current",
    body: "",
    anchors: [],
    links: [],
    tags: [],
    sources: [],
    assumption: false,
    verify: [],
    verified: [],
    ...fields,
  };
}

test("the review hop takes every reviewer risk and every unanswered question", () => {
  const records = [
    record({
      type: "risk",
      slug: "reviewed",
      status: "resolved",
      writtenBy: "agent:correctness",
    }),
    record({ type: "risk", slug: "authored", writtenBy: "mcp" }),
    record({ type: "open-question", slug: "open", status: "open" }),
    record({ type: "open-question", slug: "done", status: "resolved" }),
  ];
  const { taken, left } = selectForReview(records, REVIEWERS);
  assert.deepEqual(taken.map((row) => row.record.conceptId).sort(), [
    "open-question.open",
    "risk.reviewed",
  ]);
  assert.deepEqual(left.map((row) => row.record.conceptId).sort(), [
    "open-question.done",
    "risk.authored",
  ]);
});

test("the review hop takes current heads and leaves what was withdrawn", () => {
  const records = [
    record({ type: "decision", slug: "kept" }),
    record({ type: "decision", slug: "none", conceptId: "decision.none" }),
    record({ type: "decision", slug: "gone", standing: "superseded" }),
    record({ type: "fact", slug: "cut", status: "rejected" }),
    record({ type: "contract", slug: "api" }),
    record({ type: "source-note", slug: "scrap" }),
  ];
  const { taken } = selectForReview(records, REVIEWERS);
  assert.deepEqual(taken.map((row) => row.record.conceptId).sort(), [
    "contract.api",
    "decision.kept",
  ]);
});

test("an obligation anchored on a test has landed; one anchored on source is owed", () => {
  const records = [
    record({
      type: "test-obligation",
      slug: "landed",
      status: "open",
      anchors: [{ file: "src/a.spec.ts" }],
    }),
    record({
      type: "test-obligation",
      slug: "owed",
      status: "open",
      anchors: [{ file: "src/a.ts" }],
    }),
    record({ type: "test-obligation", slug: "closed", status: "resolved" }),
  ];
  const isTest = (/** @type {string} */ path) => path.endsWith(".spec.ts");
  const { taken } = selectForReview(records, REVIEWERS, isTest);
  assert.deepEqual(
    taken.map((row) => row.record.conceptId),
    ["test-obligation.owed"],
  );
});

test("the merge hop keeps anchored heads and accepted risks, and nothing else", () => {
  const live = (/** @type {any} */ anchor) => anchor.file === "src/a.ts";
  const records = [
    record({
      type: "decision",
      slug: "anchored",
      anchors: [{ file: "src/a.ts" }],
    }),
    record({
      type: "decision",
      slug: "floating",
      anchors: [{ file: "gone.ts" }],
    }),
    record({ type: "flow", slug: "f", anchors: [{ file: "src/a.ts" }] }),
    record({
      type: "risk",
      slug: "accepted",
      status: "accepted",
      anchors: [{ file: "src/a.ts" }],
    }),
    record({
      type: "risk",
      slug: "open",
      status: "open",
      anchors: [{ file: "src/a.ts" }],
    }),
    record({ type: "requirement", slug: "r", anchors: [{ file: "src/a.ts" }] }),
  ];
  const { taken } = selectForRepo(records, live);
  assert.deepEqual(taken.map((row) => row.record.conceptId).sort(), [
    "decision.anchored",
    "flow.f",
    "risk.accepted",
  ]);
});

test("a settled reviewer risk is no longer an open finding", () => {
  const open = record({
    type: "risk",
    slug: "open",
    status: "open",
    writtenBy: "agent:security",
  });
  const settled = record({
    type: "risk",
    slug: "settled",
    status: "accepted",
    writtenBy: "agent:security",
  });
  assert.equal(isOpenFinding(open, REVIEWERS), true);
  assert.equal(isOpenFinding(settled, REVIEWERS), false);
});

test("--to takes review or repo, and the bases follow from it", () => {
  assert.throws(() => parseArgs(["--to", "elsewhere"]));
  assert.throws(() => parseArgs(["--to"]));
  assert.deepEqual(parseArgs(["promote", "--to", "review", "--dry-run"]), {
    to: "review",
    dryRun: true,
  });

  const review = bundles("/repo", { to: "review", dryRun: false });
  assert.equal(review.from, join("/repo", ".strauss", "scratch"));
  assert.equal(review.to, join("/repo", ".strauss", "review"));
  assert.equal(review.report, join("/repo", ".strauss", "review", "REPORT.md"));

  const repo = bundles("/repo", { to: "repo", dryRun: false });
  assert.equal(repo.from, join("/repo", ".strauss", "review"));
  assert.equal(repo.to, join("/repo", ".strauss", "kb"));
  // The level-2 base owns the report in both hops: it is what a human reads.
  assert.equal(repo.report, join("/repo", ".strauss", "review", "REPORT.md"));

  const named = bundles("/repo", {
    to: "review",
    from: "/a",
    toBundle: "/b",
    dryRun: false,
  });
  assert.deepEqual([named.from, named.to], ["/a", "/b"]);
});

test("the report leads with open items and one row per risk", () => {
  const report = renderReport({
    to: "/repo/.strauss/review",
    hop: "review",
    range: ["main..HEAD"],
    taken: [
      {
        record: record({
          type: "risk",
          slug: "leak",
          status: "open",
          materiality: "blocking",
          title: "Leak",
          verified: [{ by: "agent:security", note: "still open" }],
        }),
        why: "reviewer's risk",
      },
      {
        record: record({
          type: "decision",
          slug: "kept",
          title: "Kept",
          anchors: [{ file: "src/a.ts", symbol: "handler" }],
        }),
        why: "current decision",
      },
    ],
    left: [
      {
        record: record({ type: "fact", slug: "old" }),
        why: "superseded",
        finding: false,
      },
    ],
    promoted: ["risk.leak", "decision.kept"],
    skipped: [],
    trailers: {
      addressedBy: new Map([["risk.leak", ["0ddba11"]]]),
      pinnedBy: new Map([["risk.leak", ["src/a.spec.ts"]]]),
    },
    reasons: new Map([["risk.leak", "bound asserted"]]),
    dryRun: false,
  });

  assert.match(report, /## Open items[\s\S]*risk\.leak/);
  assert.match(
    report,
    /\| `risk\.leak` \| open \| blocking \| 0ddba11 \| src\/a\.spec\.ts \|/,
  );
  assert.match(report, /agent:security: still open/);
  assert.match(report, /bound asserted/);
  assert.match(report, /## Decisions[\s\S]*src\/a\.ts:handler/);
  assert.match(report, /## Not selected[\s\S]*superseded — 1: fact\.old/);
});

test("end to end: the hop lands its records, then leaves a human's alone", (t) => {
  const bin = resolveLocalBin(process.cwd());
  if (!bin) return t.skip("no strauss-kb build in this checkout");

  const root = mkdtempSync(join(tmpdir(), "kb-promote-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scratch = join(root, "scratch");
  const review = join(root, "review");

  // The roster is read from the working directory, and nothing outside this
  // repository resolves the CLI — the launcher takes the override.
  mkdirSync(join(root, ".strauss"), { recursive: true });
  writeFileSync(
    join(root, ".strauss", "kb-pins.json"),
    JSON.stringify({ gate: {}, reviewers: { correctness: {} } }),
    "utf8",
  );
  const bin0 = process.env.STRAUSS_KB_BIN;
  process.env.STRAUSS_KB_BIN = bin;
  t.after(() => {
    if (bin0 === undefined) delete process.env.STRAUSS_KB_BIN;
    else process.env.STRAUSS_KB_BIN = bin0;
  });

  /**
   * @param {string} bundle @param {string[]} args @param {string} actor
   * @param {string} [stdin]
   */
  const kb = (bundle, args, actor, stdin) =>
    execFileSync(process.execPath, [bin, "--bundle", bundle, ...args], {
      cwd: root,
      encoding: "utf8",
      ...(stdin === undefined ? {} : { input: stdin }),
      env: { ...process.env, STRAUSS_KB_ACTOR: actor },
    });

  kb(
    scratch,
    ["write", "risk"],
    "agent:correctness",
    JSON.stringify({
      slug: "leak",
      title: "Leak",
      why: "A token reaches the log",
      sections: {
        Risk: "A token reaches the log.",
        "Why it matters": "It is a token.",
      },
    }),
  );

  const run = (/** @type {string[]} */ argv) => promote({ cwd: root, argv });
  const args = ["--to", "review", "--from", scratch, "--to-bundle", review];

  const first = run(args);
  assert.equal(first.status, 0, first.lines.join("\n"));
  assert.match(first.lines[0] ?? "", /Promoted 1 of 1/);

  // The copy keeps the reviewer's name: no record is rewritten in another's.
  const copy = readFileSync(join(review, "risk.leak.md"), "utf8");
  assert.match(copy, /by: ['"]agent:correctness['"]/);
  assert.match(copy, /strauss_status: open/);

  kb(
    review,
    ["status", "risk.leak", "resolved", "--reason", "fixed on the branch"],
    "human:reviewer",
  );

  const second = run(args);
  assert.equal(second.status, 0, second.lines.join("\n"));
  assert.match(
    second.lines.join("\n"),
    /left alone \(settled by human:reviewer\)/,
  );
  assert.match(
    readFileSync(join(review, "risk.leak.md"), "utf8"),
    /strauss_status: resolved/,
  );
  assert.match(
    readFileSync(join(review, "REPORT.md"), "utf8"),
    /## Open items/,
  );
});
