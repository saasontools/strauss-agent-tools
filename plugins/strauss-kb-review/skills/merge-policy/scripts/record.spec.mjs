// @ts-check
/**
 * The record body one route at a time, and the report block it renders into.
 * Both are built from a hand-written policy output, so a change to the prose
 * shows up here before it shows up on a pull request.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRecord,
  nextWrite,
  slugify,
  subjectTag,
  writeRecord,
} from "./lib/record.mjs";
import {
  bundleHref,
  cell,
  MARKER,
  MAX_LINES,
  prRepo,
  report,
} from "./lib/report.mjs";
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
    decider: {
      present: false,
      verdict: null,
      reason: "",
      sha: null,
      model: null,
      reliedOn: [],
      disputes: [],
      notes: ["decider: no --decider output"],
    },
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
  assert.match(body.impact, /- decider: not supplied/);
  assert.match(body.impact, /- enforce: exit 0 — auto/);
  assert.deepEqual(body.tags, [
    "review",
    "review:merge-policy",
    "review:merge-policy:merge-7",
  ]);
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
  const quiet = model(
    {},
    { route: "auto", rule: "auto-mechanical", reason: "q" },
    CLEAN,
  );
  // `enabled` is the string union all the way out: `true` here is a regression.
  assert.strictEqual(quiet.policy.enabled, "true");

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
- **Decider** — not supplied

**Not checked**
- reviewer: no --reviewer output
- decider: no --decider output
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

test("a cell is one line, and a pipe in it never opens a column", () => {
  assert.equal(cell("risk.a|b"), "risk.a\\|b");
  assert.equal(
    cell("blocked | see\nthe next line"),
    "blocked \\| see the next line",
  );
  assert.ok(!cell("a\nb").includes("\n"));
});

test("a bundle that climbs out of the repo builds no link", () => {
  assert.equal(bundleHref(".strauss/kb"), ".strauss/kb");
  assert.equal(bundleHref("kb/one two"), "kb/one%20two");
  for (const bad of ["../elsewhere/kb", "..", "/abs/kb", "C:/kb", ""]) {
    assert.equal(bundleHref(bad), null, bad);
  }
});

test("a record whose bundle is outside the repo is named, never linked", () => {
  const block = report({
    ...model(
      {},
      { route: "auto", rule: "auto-mechanical", reason: "q" },
      CLEAN,
    ),
    bundle: "../other/kb",
    records: [
      {
        id: "risk.a",
        type: "risk",
        materiality: "blocking",
        effective: "blocking",
        status: "open",
        verifiedBy: [],
      },
    ],
  });
  assert.match(block, /\| `risk\.a` \| risk \|/);
  assert.ok(!block.includes("../other/kb"), block);
});

/** A bundle as the `list` verb reports it, keyed by subject tag.
 * @param {Record<string, { conceptId: string, status: string }[]>} rows */
function lister(rows) {
  /** @type {import("./lib/record.mjs").List} */
  const list = (_kb, tag) => rows[tag] ?? [];
  return list;
}

/** @type {any} */
const KB = { cwd: ".", bundle: ".strauss/kb", command: "strauss-kb" };

test("a rerun takes the next free ordinal and supersedes the record still current", () => {
  const tag = subjectTag("merge-7");
  assert.deepEqual(nextWrite(KB, "merge-7", lister({})), {
    ordinal: 1,
    slug: "merge-7",
    supersedes: [],
  });

  assert.deepEqual(
    nextWrite(
      KB,
      "merge-7",
      lister({
        [tag]: [{ conceptId: "decision.merge-7", status: "accepted" }],
      }),
    ),
    { ordinal: 2, slug: "merge-7-2", supersedes: ["decision.merge-7"] },
  );

  // A settled record is not superseded twice, but its ordinal stays taken.
  assert.deepEqual(
    nextWrite(
      KB,
      "merge-7",
      lister({
        [tag]: [
          { conceptId: "decision.merge-7", status: "superseded" },
          { conceptId: "decision.merge-7-2", status: "accepted" },
        ],
      }),
    ),
    { ordinal: 3, slug: "merge-7-3", supersedes: ["decision.merge-7-2"] },
  );
});

test("a subject's priors are its own tag's records, never an id that looks like one", () => {
  // `merge-7-2` is PR `7-2`'s own first record. A run for PR `7` neither
  // supersedes it nor counts it: selection is the tag, not the id's shape.
  const list = lister({
    [subjectTag("merge-7")]: [
      { conceptId: "decision.merge-7", status: "accepted" },
    ],
    [subjectTag("merge-7-2")]: [
      { conceptId: "decision.merge-7-2", status: "accepted" },
    ],
  });
  const next = nextWrite(KB, "merge-7", list);
  assert.deepEqual(next?.supersedes, ["decision.merge-7"]);
  assert.ok(!next?.supersedes.includes("decision.merge-7-2"));

  // And PR `7-2`'s own rerun is numbered from its own chain.
  assert.deepEqual(nextWrite(KB, "merge-7-2", list), {
    ordinal: 2,
    slug: "merge-7-2-2",
    supersedes: ["decision.merge-7-2"],
  });
});

/** The write half of `writeRecord`, with the store in memory.
 * @param {Partial<any>} [over] */
function how(over = {}) {
  return {
    kb: KB,
    body: buildRecord(
      input(),
      { route: "auto", rule: "auto-mechanical", reason: "quiet" },
      CLEAN,
      options(),
    ),
    route: "auto",
    enforcing: true,
    ...over,
  };
}

/** @param {number} status @param {string} stdout @param {string} stderr */
function reply(status, stdout, stderr = "") {
  return { status, stdout, stderr, missing: false, unknownVerb: false };
}

test("a dry-run policy reports the route and writes nothing", () => {
  let sent = 0;
  const answer = writeRecord(how({ enabled: "dry-run" }), {
    send: () => {
      sent += 1;
      return reply(0, "{}");
    },
  });
  assert.equal(answer.written, false);
  assert.equal(sent, 0);
  assert.match(answer.why, /dry-run/);
});

test("an ordinal taken between the scan and the write is retried, once", () => {
  /** @type {{ conceptId: string, status: string }[]} */
  const held = [{ conceptId: "decision.merge-7", status: "accepted" }];
  const rows = { [subjectTag("merge-7")]: held };
  /** @type {string[]} */
  const tried = [];
  const answer = writeRecord(how(), {
    list: lister(rows),
    send: (_kb, input) => {
      const slug = /** @type {any} */ (input).slug;
      tried.push(slug);
      // A sibling run lands this ordinal between our scan and our write.
      if (tried.length === 1) {
        held.push({ conceptId: `decision.${slug}`, status: "accepted" });
        return reply(
          1,
          "",
          `strauss-kb: error: kb: decision.${slug} already exists — choose a more specific slug\n`,
        );
      }
      return reply(0, JSON.stringify({ conceptId: `decision.${slug}` }));
    },
  });
  assert.deepEqual(tried, ["merge-7-2", "merge-7-3"]);
  assert.equal(answer.written, true);
  assert.equal(answer.conceptId, "decision.merge-7-3");
});

test("a prior scan that did not answer writes nothing", () => {
  let sent = 0;
  const answer = writeRecord(how(), {
    list: () => null,
    send: () => {
      sent += 1;
      return reply(0, "{}");
    },
  });
  assert.equal(answer.written, false);
  assert.equal(sent, 0);
  assert.match(answer.why, /could not list/);
});
