// @ts-check
/**
 * The record body one route at a time, and the report block it renders into.
 * Both are built from a hand-written policy output, so a change to the prose
 * shows up here before it shows up on a pull request.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildRecord, nextWrite, slugify } from "./lib/record.mjs";
import { MARKER, MAX_LINES, prRepo, report } from "./lib/report.mjs";
import { result } from "./lib/render.mjs";

/** The `Input` shape the two builders read, with everything quiet by default.
 * @param {Partial<any>} [over] */
function input(over = {}) {
  // Hand-built, so the literal is widened to the gathered `Input` on purpose.
  return /** @type {any} */ ({
    base: "main",
    head: "topic",
    headSha: "d1135cbf7b0cbbeecece9700f4bff6910590084b",
    policy: {
      present: true,
      path: ".strauss/merge-policy.json",
      version: 1,
      hash: "sha256:abc",
      format: "json",
      data: { enabled: "true", owners: ["dana"] },
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
    approvals: [],
    log: [],
    ...over,
  });
}

/** @param {Partial<any>} [over] */
function options(over = {}) {
  return {
    subject: "7",
    pr: "7",
    prUrl: "https://github.com/acme/app/pull/7",
    notChecked: [],
    enforcing: true,
    gate: { blocks: [], warns: [] },
    ...over,
  };
}

const CLEAN = { exit: /** @type {0} */ (0), why: "auto", approvedBy: [] };

test("a slug is lower kebab, whatever the subject was spelled like", () => {
  assert.equal(slugify("SAA-741"), "saa-741");
  assert.equal(slugify("feature/Login v2"), "feature-login-v2");
  assert.equal(slugify("!!!"), "unnamed");
});

test("an auto route names human review as what it rejected", () => {
  const body = buildRecord(
    input(),
    {
      route: "auto",
      rule: "auto-mechanical",
      reason: "only mechanical classes",
    },
    CLEAN,
    options(),
  );
  assert.equal(body.conceptId, "decision.merge-7");
  assert.equal(body.title, "Merge route for PR 7: auto");
  assert.equal(body.why, "auto-mechanical: only mechanical classes");
  assert.match(body.alternative, /^Human review\. Rejected: `auto-mechanical`/);
  assert.match(body.impact, /`auto` merges 1 changed file with no human read/);
  assert.match(body.impact, /- decider: exit 0 — auto/);
  assert.deepEqual(body.tags, ["review", "review:merge-policy"]);
  // The record is about the range, so it anchors to no symbol.
  assert.deepEqual(body.anchors, []);
  assert.deepEqual(body.sources, [
    {
      id: "pr",
      resource: "https://github.com/acme/app/pull/7",
      title: "Pull request",
    },
  ]);
});

test("an agent-review-then-auto route carries the reviewer's run and verdicts", () => {
  const body = buildRecord(
    input({
      reviewer: {
        present: true,
        sha: "d1135cbf",
        verdicts: { "risk.a": "verified" },
        risksWritten: [],
      },
      records: [
        {
          id: "risk.a",
          type: "risk",
          effective: "non-blocking",
          status: "open",
          verifiedBy: ["agent:reviewer"],
          onDiff: true,
        },
      ],
    }),
    {
      route: "agent-review-then-auto",
      rule: "reviewer-clean",
      reason: "the reviewer verified every record on the diff",
    },
    { exit: 0, why: "the reviewer ran on the head commit", approvedBy: [] },
    options(),
  );
  assert.match(
    body.impact,
    /- reviewer: ran on d1135cbf, verdicts risk\.a=verified/,
  );
  assert.match(
    body.impact,
    /- records: risk\.a \(risk, non-blocking, open, verified by agent:reviewer\)/,
  );
});

test("a human route names the auto route it refused, and the rule that refused it", () => {
  const body = buildRecord(
    input(),
    {
      route: "human",
      rule: "open-obligation",
      reason: "open: risk.payment-retry",
    },
    {
      exit: 1,
      why: "route is human and no owner has APPROVED",
      approvedBy: [],
    },
    options({ notChecked: ["gate: did not answer"] }),
  );
  assert.equal(
    body.alternative,
    "auto, and agent-review-then-auto. Rejected: `open-obligation` matched above both of them — open: risk.payment-retry.",
  );
  assert.match(body.impact, /nothing here merges without a human read/);
  assert.match(body.impact, /\*\*Not checked\*\*\n- gate: did not answer/);
});

test("a subject with no --pr is the head SHA, and no source is attached", () => {
  const body = buildRecord(
    input(),
    { route: "auto", rule: "auto-mechanical", reason: "quiet" },
    CLEAN,
    options({ subject: "d1135cbf7b0c", pr: null, prUrl: null }),
  );
  assert.equal(body.conceptId, "decision.merge-d1135cbf7b0c");
  assert.equal(body.title, "Merge route for d1135cbf7b0c: auto");
  assert.deepEqual(body.sources, []);
});

test("only a github pull URL becomes a link base", () => {
  assert.deepEqual(prRepo("https://github.com/acme/app/pull/7"), {
    repo: "https://github.com/acme/app",
    number: "7",
  });
  for (const bad of [
    null,
    "not a url",
    "http://github.com/acme/app/pull/7",
    "https://evil.example/acme/app/pull/7",
    "https://github.com/acme/app/issues/7",
    "https://github.com/acme/app/pull/0",
  ]) {
    assert.equal(prRepo(bad), null, String(bad));
  }
});

/** The `--json` model for a scenario, without running anything.
 * @param {any} over @param {any} decision @param {any} verdict */
function model(over, decision, verdict) {
  return result(input(over), decision, verdict, {
    enforcing: true,
    subject: "7",
    pr: "7",
    prUrl: "https://github.com/acme/app/pull/7",
    bundleDir: ".strauss/kb",
  });
}

test("the docs-only report is one capped block behind a stable marker", () => {
  const block = report(
    model(
      {},
      {
        route: "auto",
        rule: "auto-mechanical",
        reason: "only mechanical classes, and the base is quiet",
      },
      CLEAN,
    ),
  );
  assert.equal(
    block,
    `${MARKER}
### Merge policy: auto

| | |
| --- | --- |
| route | \`auto\` via \`auto-mechanical\` |
| why | only mechanical classes, and the base is quiet |
| policy | \`.strauss/merge-policy.json\` v1 \`sha256:abc\` |
| head | \`d1135cbf7b0cbbeecece9700f4bff6910590084b\` |
| enforce | exit 0 — auto |

**Records on the diff** — none.

- **Classifier** — docs 1
- **Gate** — blocks none; warns none
- **Reviewer** — not supplied

**Not checked**
- reviewer: no --reviewer output
- approvals: no --approvals dump
`,
  );
});

test("the blocking-risk report links each record and names the gate blocks", () => {
  const block = report(
    model(
      {
        files: [
          {
            path: "src/pay.ts",
            class: "code",
            excluded: false,
            crosses: false,
          },
        ],
        records: [
          {
            id: "risk.payment-retry",
            type: "risk",
            materiality: "blocking",
            effective: "blocking",
            status: "open",
            verifiedBy: [],
            onDiff: true,
          },
        ],
        gate: {
          supplied: true,
          pending: false,
          blocks: [{ id: "A1", family: "A", file: "src/pay.ts" }],
          warns: [{ id: "B2", family: "B", file: null }],
          answered: true,
        },
      },
      {
        route: "human",
        rule: "open-obligation",
        reason: "open: risk.payment-retry",
      },
      {
        exit: 1,
        why: "route is human and no owner has APPROVED the head commit",
        approvedBy: [],
      },
    ),
  );
  assert.ok(block.startsWith(`${MARKER}\n`));
  assert.match(
    block,
    /\| \[risk\.payment-retry\]\(https:\/\/github\.com\/acme\/app\/blob\/d1135cbf7b0cbbeecece9700f4bff6910590084b\/\.strauss\/kb\/risk\.payment-retry\.md\) \| risk \| blocking \| open \| nobody \|/,
  );
  assert.match(block, /- \*\*Gate\*\* — blocks A1; warns B2/);
  assert.match(block, /\| enforce \| exit 1 — route is human/);
  assert.match(block, /- gate: supplied by --gate, not run/);
});

test("the block stays inside its line cap however loud the range is", () => {
  const many = Array.from({ length: 60 }, (_, at) => ({
    id: `risk.r${at}`,
    type: "risk",
    materiality: "blocking",
    effective: "blocking",
    status: "open",
    verifiedBy: [],
    onDiff: true,
  }));
  const block = report(
    model(
      { records: many },
      { route: "human", rule: "open-obligation", reason: "open" },
      {
        exit: 1,
        why: "human",
        approvedBy: [],
      },
    ),
  );
  assert.ok(block.trimEnd().split("\n").length <= MAX_LINES, block);
  assert.match(block, /and 52 more\./);
});

test("a rerun takes the next free ordinal and supersedes every current sibling", () => {
  const bundle = mkdtempSync(join(tmpdir(), "merge-record-"));
  assert.deepEqual(nextWrite(bundle, "merge-7"), {
    slug: "merge-7",
    supersedes: [],
  });

  writeFileSync(
    join(bundle, "decision.merge-7.md"),
    "---\ntype: decision\nstrauss_status: accepted\n---\n",
  );
  assert.deepEqual(nextWrite(bundle, "merge-7"), {
    slug: "merge-7-2",
    supersedes: ["decision.merge-7"],
  });

  // A record already settled is not superseded twice, but its id stays taken.
  writeFileSync(
    join(bundle, "decision.merge-7-2.md"),
    "---\ntype: decision\nstrauss_status: superseded\n---\n",
  );
  assert.deepEqual(nextWrite(bundle, "merge-7-2"), {
    slug: "merge-7-2-2",
    supersedes: [],
  });

  // A different subject is a different record, never an ordinal of this one.
  writeFileSync(
    join(bundle, "decision.merge-8.md"),
    "---\ntype: decision\nstrauss_status: accepted\n---\n",
  );
  assert.deepEqual(nextWrite(bundle, "merge-7"), {
    slug: "merge-7-3",
    supersedes: ["decision.merge-7"],
  });
});
