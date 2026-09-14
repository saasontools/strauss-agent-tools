// @ts-check
/** One test per check, over hand-built `ctx` objects — no repository, no CLI. */
import assert from "node:assert/strict";
import test from "node:test";
import * as anchor from "./lib/checks/anchor.mjs";
import * as claim from "./lib/checks/claim.mjs";
import * as owed from "./lib/checks/owed.mjs";
import * as standing from "./lib/checks/standing.mjs";
import * as store from "./lib/checks/store.mjs";
import * as uncovered from "./lib/checks/uncovered.mjs";
import { builtinClass } from "./lib/classify.mjs";
import { isProbeable } from "./lib/urls.mjs";
import { DEFAULTS, applyPolicy } from "./lib/thresholds.mjs";
import { label } from "./lib/report.mjs";
import { parseFrontmatter, section } from "./lib/util.mjs";

/** @param {Partial<any>} overrides @returns {any} */
function ctx(overrides = {}) {
  const records = overrides.records ?? [];
  const base = {
    repoRoot: "/repo",
    bundle: "/repo/.strauss/kb",
    range: ["main..HEAD"],
    base: "main",
    head: "HEAD",
    offline: true,
    report: false,
    classifier: "builtin",
    classes: new Map(),
    files: [],
    changedPaths: new Set(),
    hunks: [],
    matches: [],
    records,
    byId: new Map(records.map((/** @type {any} */ r) => [r.conceptId, r])),
    touched: records.filter((/** @type {any} */ r) => r.touched),
    noDecision:
      records.find((/** @type {any} */ r) => r.conceptId === "decision.none") ??
      null,
    changedSymbols: [],
    codeFiles: [],
    commits: [],
    newestCommitAt: "2020-01-01T00:00:00.000Z",
    log: { entries: [] },
    logAdded: [],
    validate: [],
    doctor: { groups: [] },
    stamp: "digest",
    anchorState: new Map(),
    thresholds: { ...DEFAULTS, warn: [], off: [] },
    backlinks: () => ({ backlinks: [] }),
    fileAtHead: () => "",
    repoHas: () => true,
    kb: { cwd: "/repo", bundle: "/repo/.strauss/kb", command: "strauss-kb" },
  };
  return { ...base, ...overrides };
}

/** @param {Partial<any>} fields @returns {any} */
function record(fields = {}) {
  return {
    conceptId: "decision.x",
    path: ".strauss/kb/decision.x.md",
    type: "decision",
    title: "x",
    status: "accepted",
    standing: "current",
    body: "",
    touched: true,
    anchors: [],
    links: [],
    tags: [],
    sources: [],
    verify: [],
    verified: [],
    assumption: false,
    ...fields,
  };
}

/** @param {any[]} findings */
const ids = (findings) => findings.map((item) => item.id);

test("uncovered.symbol fires on a changed symbol nothing written covers", () => {
  const found = uncovered.check(
    ctx({ changedSymbols: [{ file: "src/a.ts", symbol: "Alpha", hunks: [] }] }),
  );
  assert.deepEqual(ids(found), ["uncovered.symbol"]);
  assert.equal(found[0]?.severity, "block");
  assert.equal(found[0]?.kind, "semantic");
});

test("uncovered.symbol stays quiet when a record written in the diff anchors the file", () => {
  const found = uncovered.check(
    ctx({
      changedSymbols: [{ file: "src/a.ts", symbol: "Alpha", hunks: [] }],
      records: [record({ anchors: [{ file: "src/a.ts", symbol: "Alpha" }] })],
    }),
  );
  assert.deepEqual(ids(found), []);
});

test("uncovered.signal fires when decision.none stands beside an F signal", () => {
  const found = uncovered.check(
    ctx({
      files: [{ path: ".github/workflows/ci.yml", status: "M" }],
      classes: new Map([[".github/workflows/ci.yml", "ci"]]),
      records: [
        record({
          conceptId: "decision.none",
          writtenAt: "2030-01-01T00:00:00.000Z",
          body: "## Decision\n\nOnly the pipeline timeout moved, and the diff says exactly that much.",
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("uncovered.signal"));
});

test("anchor.file-only fires on a file-only anchor over a file full of symbols", () => {
  const found = anchor.check(
    ctx({
      records: [record({ anchors: [{ file: "src/a.ts" }] })],
      classes: new Map([["src/a.ts", "code"]]),
      fileAtHead: () => "export class Alpha {\n  run() {}\n}\n",
    }),
  );
  assert.deepEqual(ids(found), ["anchor.file-only"]);
});

test("anchor.file-only leaves a test file's file-only anchor alone", () => {
  const found = anchor.check(
    ctx({
      records: [record({ anchors: [{ file: "src/a.spec.ts" }] })],
      classes: new Map([["src/a.spec.ts", "test"]]),
      fileAtHead: () => "export class Alpha {}\n",
    }),
  );
  assert.deepEqual(ids(found), []);
});

test("anchor.outside-diff warns when the anchor symbol is not among the changed ones", () => {
  const found = anchor.check(
    ctx({
      changedPaths: new Set(["src/a.ts"]),
      changedSymbols: [{ file: "src/a.ts", symbol: "Beta", hunks: [] }],
      records: [
        record({ anchors: [{ file: "src/a.ts", symbol: "Alpha.run" }] }),
      ],
    }),
  );
  assert.deepEqual(ids(found), ["anchor.outside-diff"]);
  assert.equal(found[0]?.severity, "warn");
});

test("anchor.missing-symbol fires when an anchor resolves symbol-not-found", () => {
  const found = anchor.check(
    ctx({
      anchorState: new Map([
        [
          "decision.x",
          {
            results: [
              { file: "src/a.ts", symbol: "gone", reason: "symbol-not-found" },
            ],
          },
        ],
      ]),
    }),
  );
  assert.deepEqual(ids(found), ["anchor.missing-symbol"]);
});

test("claim.no-rejection fires on a decision with no Rejected section", () => {
  const found = claim.check(
    ctx({
      records: [record({ body: "## Decision\n\nCache for a minute.\n" })],
    }),
  );
  assert.ok(ids(found).includes("claim.no-rejection"));
});

test("claim.no-rejection fires on a strawman rejection naming nothing from the diff", () => {
  const found = claim.check(
    ctx({
      hunks: [
        {
          file: "src/a.ts",
          added: ["const ttl = 60;"],
          removed: [],
          newLines: 1,
        },
      ],
      records: [
        record({ body: "## Decision\n\nx\n\n## Rejected\n\nDo nothing.\n" }),
      ],
    }),
  );
  assert.ok(ids(found).includes("claim.no-rejection"));
});

test("claim.mitigation-absent fires when a mitigation names code that is nowhere", () => {
  const found = claim.check(
    ctx({
      repoHas: () => false,
      records: [
        record({
          type: "risk",
          conceptId: "risk.x",
          body: "## Mitigation\n\nGuard.rebuild now runs first, which closes it.\n",
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("claim.mitigation-absent"));
});

test("claim.no-mitigation fires on an empty mitigation ", () => {
  const empty = claim.check(
    ctx({
      records: [
        record({ type: "risk", conceptId: "risk.x", body: "## Risk\n\nx\n" }),
      ],
    }),
  );
  assert.ok(ids(empty).includes("claim.no-mitigation"));
  const blank = claim.check(
    ctx({
      records: [
        record({
          type: "risk",
          conceptId: "risk.x",
          body: "## Mitigation\n\n   \n",
        }),
      ],
    }),
  );
  assert.ok(ids(blank).includes("claim.no-mitigation"));
  const stated = claim.check(
    ctx({
      records: [
        record({
          type: "risk",
          conceptId: "risk.x",
          body: "## Mitigation\n\nA follow-up will add the guard once the shape settles.\n",
        }),
      ],
    }),
  );
  assert.ok(!ids(stated).includes("claim.no-mitigation"));
});

test("claim.dead-source is skipped offline and on the hook path", () => {
  const sources = [{ id: "x", resource: "https://github.com/o/r/pull/1" }];
  const offline = claim.check(
    ctx({ offline: true, report: true, records: [record({ sources })] }),
  );
  assert.ok(!ids(offline).includes("claim.dead-source"));
  const hook = claim.check(
    ctx({ offline: false, report: false, records: [record({ sources })] }),
  );
  assert.ok(!ids(hook).includes("claim.dead-source"));
});

test("the claim.dead-source allowlist is anchored at the authority", () => {
  for (const url of [
    "http://127.0.0.1:8080/x.atlassian.net/",
    "https://127.0.0.1/o/r",
    "http://github.com/o/r",
    "https://localhost/github.com/o",
    "https://evil.example/https://github.com/o/r",
    "https://github.com.evil.example/o/r",
  ]) {
    assert.equal(isProbeable(url), false, url);
  }
  assert.ok(isProbeable("https://github.com/o/r/pull/1"));
  assert.ok(isProbeable("https://acme.atlassian.net/browse/SAA-1"));
});

test("claim.unsourced fires on an unsourced fact, and not on one with a verify command", () => {
  const bare = claim.check(
    ctx({
      records: [
        record({ type: "fact", conceptId: "fact.x", body: "## Claim\n\nx\n" }),
      ],
    }),
  );
  assert.ok(ids(bare).includes("claim.unsourced"));
  const verified = claim.check(
    ctx({
      records: [
        record({
          type: "fact",
          conceptId: "fact.x",
          verify: ["pnpm gen"],
          body: "## Claim\n\nx\n",
        }),
      ],
    }),
  );
  assert.ok(!ids(verified).includes("claim.unsourced"));
});

test("claim.self-verified warns when the store refused a verification this session", () => {
  const found = claim.check(
    ctx({ logAdded: [{ operation: "verify:refused", conceptId: "risk.x" }] }),
  );
  assert.ok(ids(found).includes("claim.self-verified"));
});

test("standing.closed-same-turn fires on a record written and closed with no commit between", () => {
  const found = standing.check(
    ctx({
      records: [
        record({
          conceptId: "risk.x",
          type: "risk",
          status: "resolved",
          anchors: [{ file: "src/a.ts" }],
          path: ".strauss/kb/risk.x.md",
        }),
      ],
      changedPaths: new Set(["src/a.ts"]),
      logAdded: [
        { operation: "write", conceptId: "risk.x" },
        { operation: "status:resolved", conceptId: "risk.x" },
      ],
      commits: [
        { sha: "a", paths: new Set(["src/a.ts", ".strauss/kb/risk.x.md"]) },
        { sha: "b", paths: new Set([".strauss/kb/risk.x.md"]) },
      ],
    }),
  );
  assert.ok(ids(found).includes("standing.closed-same-turn"));
});

test("standing.resolved-unmoved reads the anchor hash, not the paths in this diff", () => {
  /** @param {string} state */
  const resolved = (state) =>
    standing.check(
      ctx({
        records: [
          record({
            conceptId: "risk.x",
            type: "risk",
            status: "resolved",
            anchors: [{ file: "src/a.ts", symbol: "Alpha" }],
          }),
        ],
        changedPaths: new Set(["src/a.ts"]),
        logAdded: [{ operation: "status:resolved", conceptId: "risk.x" }],
        anchorState: new Map([
          [
            "risk.x",
            {
              conceptId: "risk.x",
              results: [
                {
                  file: "src/a.ts",
                  symbol: "Alpha",
                  state,
                  storedHash: "h0",
                  currentHash: state === "match" ? "h0" : "h1",
                },
              ],
            },
          ],
        ]),
      }),
    );
  // Unchanged since it was written: the risk closed on nothing.
  assert.ok(ids(resolved("match")).includes("standing.resolved-unmoved"));
  // The code did move — that is anchor.drifted's finding, not standing.resolved-unmoved's.
  assert.ok(!ids(resolved("drifted")).includes("standing.resolved-unmoved"));
});

test("standing.self-owned-question fires when the author owns their own question", () => {
  const found = standing.check(
    ctx({
      records: [
        record({
          conceptId: "open-question.x",
          type: "open-question",
          owner: "agent:impl",
          writtenBy: "agent:impl",
        }),
      ],
    }),
  );
  assert.deepEqual(ids(found), ["standing.self-owned-question"]);
});

test("standing.supersede-chain warns on a supersede chain over two", () => {
  const found = standing.check(
    ctx({
      logAdded: [
        { operation: "supersede", conceptId: "a" },
        { operation: "supersede", conceptId: "b" },
        { operation: "supersede", conceptId: "c" },
      ],
    }),
  );
  assert.deepEqual(ids(found), ["standing.supersede-chain"]);
});

test("anchor.drifted fires on a drifted anchor", () => {
  const found = anchor.check(
    ctx({
      anchorState: new Map([
        [
          "decision.x",
          {
            results: [{ file: "src/a.ts", symbol: "Alpha", state: "drifted" }],
          },
        ],
      ]),
    }),
  );
  assert.deepEqual(ids(found), ["anchor.drifted"]);
});

test("store.validate blocks on a validate error and store.expired warns on an expiry", () => {
  // Both shapes are the CLI's own: `validate` problems and a `doctor --json`
  // report.
  const found = store.check(
    ctx({
      validate: [
        {
          check: "supersedes",
          conceptId: "decision.x",
          note: "target fact.gone is missing",
          severity: "error",
        },
        {
          check: "assumption",
          conceptId: "fact.y",
          note: "flagged an assumption and cites a source",
          severity: "warning",
        },
      ],
      doctor: {
        recordCount: 2,
        thresholds: { expiringDays: 30, unverifiedDays: 90, agingDays: 90 },
        counts: { expired: 0, expiring: 1 },
        findingCount: 1,
        healthy: false,
        groups: [
          {
            check: "expired",
            headline: "past its stale_after date",
            count: 0,
            findings: [],
          },
          {
            check: "expiring",
            headline: "stale_after falls within the window",
            count: 1,
            findings: [
              {
                conceptId: "fact.y",
                title: "free tier cap",
                status: "accepted",
                note: "stale_after 2030-01-01",
              },
            ],
          },
        ],
      },
    }),
  );
  assert.deepEqual(ids(found), ["store.validate", "store.expired"]);
  assert.match(String(found[0]?.message), /target fact\.gone is missing/);
  assert.equal(found[0]?.severity, "block");
  assert.equal(found[1]?.severity, "warn");
});

test("store.dangling-link fires on a link whose target is not in the base", () => {
  const found = store.check(
    ctx({
      records: [
        record({ links: [{ target: "fact.missing", rel: "depends_on" }] }),
      ],
    }),
  );
  assert.deepEqual(ids(found), ["store.dangling-link"]);
});

test("owed.dependency fires on a dependency, not on a bump or an ordinary key", () => {
  const before = {
    name: "app",
    license: "MIT",
    dependencies: { zod: "^3.0.0" },
  };
  const after = {
    name: "app",
    license: "Apache-2.0",
    dependencies: { zod: "^4.0.0" },
    devDependencies: { vitest: "^2.0.0" },
  };
  /** One `-U0` hunk carrying every line the two versions differ by. */
  const hunk = {
    file: "package.json",
    newLines: 3,
    added: lines(after).filter((line) => !lines(before).includes(line)),
    removed: lines(before).filter((line) => !lines(after).includes(line)),
  };
  const shape = {
    files: [{ path: "package.json", status: "M" }],
    classes: new Map([["package.json", "config"]]),
    fileAtHead: () => JSON.stringify(after, null, 2),
  };

  const found = owed.check(ctx({ ...shape, hunks: [hunk] }));
  assert.deepEqual(ids(found), ["owed.dependency"]);
  // The bumped dependency and the changed licence are not new dependencies.
  assert.match(String(found[0]?.message), /vitest added to dependencies/);
  assert.doesNotMatch(String(found[0]?.message), /zod|license/);

  const bumpOnly = owed.check(
    ctx({
      ...shape,
      fileAtHead: () => JSON.stringify(before, null, 2),
      hunks: [
        {
          file: "package.json",
          newLines: 1,
          added: ['    "zod": "^4.0.0",'],
          removed: ['    "zod": "^3.0.0",'],
        },
      ],
    }),
  );
  assert.deepEqual(ids(bumpOnly), []);
});

/** A package.json's lines, the way a diff hands them over. @param {any} value */
function lines(value) {
  return JSON.stringify(value, null, 2).split("\n");
}

test("owed.test-silenced fires when a test is skipped", () => {
  const found = owed.check(
    ctx({
      files: [{ path: "src/a.spec.ts", status: "M" }],
      classes: new Map([["src/a.spec.ts", "test"]]),
      hunks: [
        {
          file: "src/a.spec.ts",
          added: ["test.skip('x', () => {});"],
          removed: [],
          newLines: 1,
        },
      ],
    }),
  );
  assert.deepEqual(ids(found), ["owed.test-silenced"]);
});

test("owed.suppression fires on a ts-ignore, and an anchored decision answers it", () => {
  const shape = {
    codeFiles: [{ path: "src/a.ts", status: "M" }],
    classes: new Map([["src/a.ts", "code"]]),
    hunks: [
      { file: "src/a.ts", added: ["// @ts-ignore"], removed: [], newLines: 1 },
    ],
  };
  assert.deepEqual(ids(owed.check(ctx(shape))), ["owed.suppression"]);
  const answered = owed.check(
    ctx({ ...shape, records: [record({ anchors: [{ file: "src/a.ts" }] })] }),
  );
  assert.deepEqual(ids(answered), []);
});

test("owed.build-config fires on CI config and leaves .strauss policy alone", () => {
  assert.deepEqual(
    ids(
      owed.check(
        ctx({ files: [{ path: ".github/workflows/ci.yml", status: "M" }] }),
      ),
    ),
    ["owed.build-config"],
  );
  assert.deepEqual(
    ids(
      owed.check(
        ctx({ files: [{ path: ".strauss/merge-policy.yaml", status: "M" }] }),
      ),
    ),
    [],
  );
});

test("owed.contract fires on a migration and wants a contract", () => {
  const found = owed.check(
    ctx({
      files: [{ path: "db/migrations/0004_add_tenant.sql", status: "A" }],
    }),
  );
  assert.deepEqual(ids(found), ["owed.contract"]);
  assert.match(String(found[0]?.message), /contract/);
});

test("owed.permissions fires on security identifiers and wants a review:security risk", () => {
  const shape = {
    codeFiles: [{ path: "src/a.ts", status: "M" }],
    classes: new Map([["src/a.ts", "code"]]),
    hunks: [
      {
        file: "src/a.ts",
        added: ["const token = readSecret();"],
        removed: [],
        newLines: 1,
      },
    ],
  };
  assert.deepEqual(ids(owed.check(ctx(shape))), ["owed.permissions"]);
  const answered = owed.check(
    ctx({
      ...shape,
      records: [
        record({
          type: "risk",
          conceptId: "risk.x",
          tags: ["review:security"],
          anchors: [{ file: "src/a.ts" }],
        }),
      ],
    }),
  );
  assert.deepEqual(ids(answered), []);
});

test("owed.permissions ignores an author, and every identifier is word-bounded", () => {
  const found = owed.check(
    ctx({
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      classes: new Map([["src/a.ts", "code"]]),
      hunks: [
        {
          file: "src/a.ts",
          added: ["const author = commit.author;", "row.tokenized = true;"],
          removed: [],
          newLines: 2,
        },
      ],
    }),
  );
  assert.ok(!ids(found).includes("owed.permissions"));
  const authn = owed.check(
    ctx({
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      classes: new Map([["src/a.ts", "code"]]),
      hunks: [
        {
          file: "src/a.ts",
          added: ["await authn(request);"],
          removed: [],
          newLines: 1,
        },
      ],
    }),
  );
  assert.ok(ids(authn).includes("owed.permissions"));
});

test("owed.permissions ignores an ordinary multi-tenant identifier", () => {
  const found = owed.check(
    ctx({
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      classes: new Map([["src/a.ts", "code"]]),
      hunks: [
        {
          file: "src/a.ts",
          added: ["this.cache.set(tenant.id, row);"],
          removed: [],
          newLines: 1,
        },
      ],
    }),
  );
  assert.ok(!ids(found).includes("owed.permissions"));
});

test("owed.requirement fires on a sourced requirement nothing satisfies", () => {
  const found = owed.check(
    ctx({
      records: [
        record({
          conceptId: "requirement.ac-3",
          type: "requirement",
          sources: [
            { id: "saa-1", resource: "https://linear.app/x/issue/SAA-1" },
          ],
          anchors: [{ file: "src/a.ts" }],
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("owed.requirement"));
});

test("owed.verification fires on an open blocking risk nothing verifies", () => {
  const open = record({
    conceptId: "risk.x",
    type: "risk",
    status: "open",
    materiality: "blocking",
    anchors: [{ file: "src/a.ts" }],
  });
  assert.ok(ids(owed.check(ctx({ records: [open] }))).includes("owed.verification"));
  const resolved = { ...open, status: "resolved" };
  assert.ok(!ids(owed.check(ctx({ records: [resolved] }))).includes("owed.verification"));
});

test("a block demotes to a warning by id", () => {
  const findings = [
    {
      id: "uncovered.symbol",
      group: "uncovered",
      severity: /** @type {const} */ ("block"),
      kind: /** @type {const} */ ("semantic"),
      message: "x",
    },
  ];
  const [only] = applyPolicy(findings, { ...DEFAULTS, warn: ["uncovered.symbol"], off: [] });
  assert.equal(only?.severity, "warn");
  assert.deepEqual(
    applyPolicy(findings, { ...DEFAULTS, warn: [], off: ["uncovered.symbol"] }),
    [],
  );
});

test("--report flags only the one repair the fixer may apply", () => {
  /** @param {string} id */
  const one = (id) =>
    label({
      id,
      group: id.split(".")[0] ?? "",
      severity: /** @type {const} */ ("block"),
      kind: /** @type {const} */ ("mechanical"),
      message: "x",
    });
  assert.equal(one("anchor.drifted").fixable, true);
  // anchor.file-only, store.expired and store.dangling-link are mechanical in the tiers that may edit a record, and
  // still not the fixer's: no op it is granted performs them.
  assert.deepEqual(
    ["uncovered.symbol", "anchor.file-only", "anchor.missing-symbol", "claim.no-rejection", "standing.closed-same-turn", "store.validate", "store.expired", "store.dangling-link", "owed.dependency"].map(
      (id) => one(id).fixable,
    ),
    [false, false, false, false, false, false, false, false, false],
  );
  assert.equal(one("anchor.drifted").label, "mechanical");
});

test("without a classifier the hook states, never guesses: bundle or source", () => {
  assert.equal(builtinClass("src/a.spec.ts"), "source");
  assert.equal(builtinClass("pnpm-lock.yaml"), "source");
  assert.equal(builtinClass("docs/README.md"), "source");
  assert.equal(builtinClass(".strauss/kb/decision.x.md"), "kb");
});

test("frontmatter parses the shapes strauss-kb writes", () => {
  const { data, body } = parseFrontmatter(
    [
      "---",
      "type: risk",
      "title: >-",
      "  A retried checkout can",
      "  charge twice",
      "tags:",
      "  - review",
      "  - 'review:business'",
      "generated:",
      "  by: 'agent:impl'",
      "strauss_anchors:",
      "  - file: src/checkout/pay.ts",
      "    symbol: PaymentClient.charge",
      "strauss_materiality: blocking",
      "strauss_assumption: true",
      "---",
      "## Mitigation",
      "",
      "It is the order id now.",
      "",
    ].join("\n"),
  );
  assert.equal(data.type, "risk");
  assert.equal(data.title, "A retried checkout can charge twice");
  assert.deepEqual(data.tags, ["review", "review:business"]);
  assert.deepEqual(data.generated, { by: "agent:impl" });
  assert.deepEqual(data.strauss_anchors, [
    { file: "src/checkout/pay.ts", symbol: "PaymentClient.charge" },
  ]);
  assert.equal(data.strauss_assumption, true);
  assert.equal(section(body, "Mitigation"), "It is the order id now.");
});

test("frontmatter folds a plain scalar's continuation lines", () => {
  const { data } = parseFrontmatter(
    [
      "---",
      "title: A retried checkout can",
      "  charge the card twice",
      "type: risk",
      "---",
      "",
    ].join("\n"),
  );
  assert.equal(data.title, "A retried checkout can charge the card twice");
  assert.equal(data.type, "risk");
});

test("frontmatter keeps a `#` inside a quoted scalar", () => {
  const { data } = parseFrontmatter(
    [
      "---",
      "title: 'orders#charge is the seam' # the record's own note",
      'owner: "agent:impl # not a comment"',
      "type: fact # this one is",
      "---",
      "",
    ].join("\n"),
  );
  assert.equal(data.title, "orders#charge is the seam");
  assert.equal(data.owner, "agent:impl # not a comment");
  assert.equal(data.type, "fact");
});

test("frontmatter reads an empty flow collection as one", () => {
  const { data } = parseFrontmatter(
    ["---", "strauss_anchors: []", "sources: []", "---", ""].join("\n"),
  );
  assert.deepEqual(data.strauss_anchors, []);
  // Family B walks anchors: a string here is what threw.
  assert.deepEqual(
    anchor.check(ctx({ records: [record({ anchors: [] })] })),
    [],
  );
});
