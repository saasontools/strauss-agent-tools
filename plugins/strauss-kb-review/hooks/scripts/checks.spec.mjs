// @ts-check
/** One test per check, over hand-built `ctx` objects — no repository, no CLI. */
import assert from "node:assert/strict";
import test from "node:test";
import * as familyA from "./lib/family-a.mjs";
import * as familyB from "./lib/family-b.mjs";
import * as familyC from "./lib/family-c.mjs";
import * as familyD from "./lib/family-d.mjs";
import * as familyE from "./lib/family-e.mjs";
import * as familyF from "./lib/family-f.mjs";
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

test("A1 fires on a changed symbol nothing written covers", () => {
  const found = familyA.check(
    ctx({ changedSymbols: [{ file: "src/a.ts", symbol: "Alpha", hunks: [] }] }),
  );
  assert.deepEqual(ids(found), ["A1"]);
  assert.equal(found[0]?.severity, "block");
  assert.equal(found[0]?.kind, "semantic");
});

test("A1 stays quiet when a record written in the diff anchors the file", () => {
  const found = familyA.check(
    ctx({
      changedSymbols: [{ file: "src/a.ts", symbol: "Alpha", hunks: [] }],
      records: [record({ anchors: [{ file: "src/a.ts", symbol: "Alpha" }] })],
    }),
  );
  assert.deepEqual(ids(found), []);
});

test("A2 fires on a decision.none reason too short to be one", () => {
  const found = familyA.check(
    ctx({
      changedSymbols: [{ file: "src/a.ts", symbol: "Alpha", hunks: [] }],
      records: [
        record({
          conceptId: "decision.none",
          touched: true,
          writtenAt: "2030-01-01T00:00:00.000Z",
          body: "## Decision\n\nNothing to say.",
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("A2"));
});

test("A2 fires when the reason names none of the uncovered files", () => {
  const found = familyA.check(
    ctx({
      changedSymbols: [{ file: "src/alpha.ts", symbol: "Alpha", hunks: [] }],
      records: [
        record({
          conceptId: "decision.none",
          writtenAt: "2030-01-01T00:00:00.000Z",
          body: "## Decision\n\nRenamed a private helper and moved one import; the diff answers all of it.",
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("A2"));
  assert.match(
    String(found.find((item) => item.id === "A2")?.message),
    /alpha\.ts/,
  );
});

test("A3 fires when decision.none stands beside an F signal", () => {
  const found = familyA.check(
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
  assert.ok(ids(found).includes("A3"));
});

test("A4 warns when every record is a stub written at the buzzer", () => {
  const found = familyA.check(
    ctx({
      records: [record({ writtenAt: new Date().toISOString(), body: "short" })],
    }),
  );
  assert.deepEqual(ids(found), ["A4"]);
  assert.equal(found[0]?.severity, "warn");
});

test("B1 fires on a file-only anchor over a file full of symbols", () => {
  const found = familyB.check(
    ctx({
      records: [record({ anchors: [{ file: "src/a.ts" }] })],
      classes: new Map([["src/a.ts", "code"]]),
      fileAtHead: () => "export class Alpha {\n  run() {}\n}\n",
    }),
  );
  assert.deepEqual(ids(found), ["B1"]);
});

test("B1 leaves a test file's file-only anchor alone", () => {
  const found = familyB.check(
    ctx({
      records: [record({ anchors: [{ file: "src/a.spec.ts" }] })],
      classes: new Map([["src/a.spec.ts", "test"]]),
      fileAtHead: () => "export class Alpha {}\n",
    }),
  );
  assert.deepEqual(ids(found), []);
});

test("B2 warns when the anchor symbol is not among the changed ones", () => {
  const found = familyB.check(
    ctx({
      changedPaths: new Set(["src/a.ts"]),
      changedSymbols: [{ file: "src/a.ts", symbol: "Beta", hunks: [] }],
      records: [
        record({ anchors: [{ file: "src/a.ts", symbol: "Alpha.run" }] }),
      ],
    }),
  );
  assert.deepEqual(ids(found), ["B2"]);
  assert.equal(found[0]?.severity, "warn");
});

test("B3 fires when only the tests are anchored", () => {
  const found = familyB.check(
    ctx({
      records: [record({ anchors: [{ file: "src/a.spec.ts" }] })],
      classes: new Map([["src/a.spec.ts", "test"]]),
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      fileAtHead: () => "",
    }),
  );
  assert.ok(ids(found).includes("B3"));
});

test("B4 warns on one record spread over the whole change", () => {
  const anchors = Array.from({ length: 7 }, (_, index) => ({
    file: `src/f${index % 4}.ts`,
    symbol: `S${index}`,
  }));
  const found = familyB.check(ctx({ records: [record({ anchors })] }));
  assert.deepEqual(ids(found), ["B4"]);
});

test("B5 fires when an anchor resolves symbol-not-found", () => {
  const found = familyB.check(
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
  assert.deepEqual(ids(found), ["B5"]);
});

test("C1 fires on a decision with no Rejected section", () => {
  const found = familyC.check(
    ctx({
      records: [record({ body: "## Decision\n\nCache for a minute.\n" })],
    }),
  );
  assert.ok(ids(found).includes("C1"));
});

test("C1 fires on a strawman rejection naming nothing from the diff", () => {
  const found = familyC.check(
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
  assert.ok(ids(found).includes("C1"));
});

test("C2 warns when the body is the added lines, retyped", () => {
  const added = [
    "const cacheTtl = sixtyThousand;",
    "const coldKeys = ids.filter(missing);",
    "this.store.write(chunk, batchGet(rows));",
  ];
  const found = familyC.check(
    ctx({
      hunks: [{ file: "src/a.ts", added, removed: [], newLines: 3 }],
      records: [record({ body: `## Decision\n\n${added.join(" ")}\n` })],
    }),
  );
  assert.ok(ids(found).includes("C2"));
});

test("C3 fires when a mitigation names code that is nowhere", () => {
  const found = familyC.check(
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
  assert.ok(ids(found).includes("C3"));
});

test("C4 fires on an empty mitigation and leaves a short one to A4", () => {
  const empty = familyC.check(
    ctx({
      records: [
        record({ type: "risk", conceptId: "risk.x", body: "## Risk\n\nx\n" }),
      ],
    }),
  );
  assert.ok(ids(empty).includes("C4"));
  const blank = familyC.check(
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
  assert.ok(ids(blank).includes("C4"));
  const stated = familyC.check(
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
  assert.ok(!ids(stated).includes("C4"));
});

test("C5 is skipped offline and on the hook path", () => {
  const sources = [{ id: "x", resource: "https://github.com/o/r/pull/1" }];
  const offline = familyC.check(
    ctx({ offline: true, report: true, records: [record({ sources })] }),
  );
  assert.ok(!ids(offline).includes("C5"));
  const hook = familyC.check(
    ctx({ offline: false, report: false, records: [record({ sources })] }),
  );
  assert.ok(!ids(hook).includes("C5"));
});

test("the C5 allowlist is anchored at the authority", () => {
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

test("C6 fires on an unsourced fact, and not on one with a verify command", () => {
  const bare = familyC.check(
    ctx({
      records: [
        record({ type: "fact", conceptId: "fact.x", body: "## Claim\n\nx\n" }),
      ],
    }),
  );
  assert.ok(ids(bare).includes("C6"));
  const verified = familyC.check(
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
  assert.ok(!ids(verified).includes("C6"));
});

test("C7 warns on two records saying the same thing", () => {
  const body =
    "## Decision\n\nBatch tenant lookups through the repository in chunks of a hundred identifiers.\n\n## Rejected\n\nOne round trip per identifier.\n";
  const found = familyC.check(
    ctx({
      records: [
        record({ conceptId: "decision.a", body }),
        record({ conceptId: "decision.b", body }),
      ],
    }),
  );
  assert.ok(ids(found).includes("C7"));
});

test("C8 warns when nothing blocks and everything is certain", () => {
  const found = familyC.check(
    ctx({
      records: [
        record({
          conceptId: "risk.a",
          type: "risk",
          materiality: "non-blocking",
          confidence: "high",
        }),
        record({
          conceptId: "risk.b",
          type: "risk",
          materiality: "non-blocking",
          confidence: "high",
        }),
        record({ conceptId: "decision.c", confidence: "high" }),
      ],
    }),
  );
  assert.equal(ids(found).filter((id) => id === "C8").length, 2);
});

test("C9 warns when the store refused a verification this session", () => {
  const found = familyC.check(
    ctx({ logAdded: [{ operation: "verify:refused", conceptId: "risk.x" }] }),
  );
  assert.ok(ids(found).includes("C9"));
});

test("D1 fires on a record written and closed with no commit between", () => {
  const found = familyD.check(
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
  assert.ok(ids(found).includes("D1"));
});

test("D2 reads the anchor hash, not the paths in this diff", () => {
  /** @param {string} state */
  const resolved = (state) =>
    familyD.check(
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
  assert.ok(ids(resolved("match")).includes("D2"));
  // The code did move — that is D5's finding, not D2's.
  assert.ok(!ids(resolved("drifted")).includes("D2"));
});

test("D3 fires when the author owns their own question", () => {
  const found = familyD.check(
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
  assert.deepEqual(ids(found), ["D3"]);
});

test("D4 warns on a supersede chain over two", () => {
  const found = familyD.check(
    ctx({
      logAdded: [
        { operation: "supersede", conceptId: "a" },
        { operation: "supersede", conceptId: "b" },
        { operation: "supersede", conceptId: "c" },
      ],
    }),
  );
  assert.deepEqual(ids(found), ["D4"]);
});

test("D5 fires on a drifted anchor", () => {
  const found = familyD.check(
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
  assert.deepEqual(ids(found), ["D5"]);
});

test("E1 blocks on a validate error and E2 warns on an expiry", () => {
  // Both shapes are the CLI's own: `validate` problems and a `doctor --json`
  // report.
  const found = familyE.check(
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
  assert.deepEqual(ids(found), ["E1", "E2"]);
  assert.match(String(found[0]?.message), /target fact\.gone is missing/);
  assert.equal(found[0]?.severity, "block");
  assert.equal(found[1]?.severity, "warn");
});

test("E3 fires on a link whose target is not in the base", () => {
  const found = familyE.check(
    ctx({
      records: [
        record({ links: [{ target: "fact.missing", rel: "depends_on" }] }),
      ],
    }),
  );
  assert.deepEqual(ids(found), ["E3"]);
});

test("F1 fires on a dependency, not on a bump or an ordinary key", () => {
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

  const found = familyF.check(ctx({ ...shape, hunks: [hunk] }));
  assert.deepEqual(ids(found), ["F1"]);
  // The bumped dependency and the changed licence are not new dependencies.
  assert.match(String(found[0]?.message), /vitest added to dependencies/);
  assert.doesNotMatch(String(found[0]?.message), /zod|license/);

  const bumpOnly = familyF.check(
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

test("F3 fires when a test is skipped", () => {
  const found = familyF.check(
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
  assert.deepEqual(ids(found), ["F3"]);
});

test("F4 fires on a ts-ignore, and an anchored decision answers it", () => {
  const shape = {
    codeFiles: [{ path: "src/a.ts", status: "M" }],
    classes: new Map([["src/a.ts", "code"]]),
    hunks: [
      { file: "src/a.ts", added: ["// @ts-ignore"], removed: [], newLines: 1 },
    ],
  };
  assert.deepEqual(ids(familyF.check(ctx(shape))), ["F4"]);
  const answered = familyF.check(
    ctx({ ...shape, records: [record({ anchors: [{ file: "src/a.ts" }] })] }),
  );
  assert.deepEqual(ids(answered), []);
});

test("F5 fires on CI config and leaves .strauss policy alone", () => {
  assert.deepEqual(
    ids(
      familyF.check(
        ctx({ files: [{ path: ".github/workflows/ci.yml", status: "M" }] }),
      ),
    ),
    ["F5"],
  );
  assert.deepEqual(
    ids(
      familyF.check(
        ctx({ files: [{ path: ".strauss/merge-policy.yaml", status: "M" }] }),
      ),
    ),
    [],
  );
});

test("F6 fires on a migration and wants a contract", () => {
  const found = familyF.check(
    ctx({
      files: [{ path: "db/migrations/0004_add_tenant.sql", status: "A" }],
    }),
  );
  assert.deepEqual(ids(found), ["F6"]);
  assert.match(String(found[0]?.message), /contract/);
});

test("F8 fires on security identifiers and wants a review:security risk", () => {
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
  assert.deepEqual(ids(familyF.check(ctx(shape))), ["F8"]);
  const answered = familyF.check(
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

test("F8 ignores an author, and every identifier is word-bounded", () => {
  const found = familyF.check(
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
  assert.ok(!ids(found).includes("F8"));
  const authn = familyF.check(
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
  assert.ok(ids(authn).includes("F8"));
});

test("F8 ignores an ordinary multi-tenant identifier", () => {
  const found = familyF.check(
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
  assert.ok(!ids(found).includes("F8"));
});

test("F9 warns rather than blocks", () => {
  const found = familyF.check(
    ctx({
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      classes: new Map([["src/a.ts", "code"]]),
      hunks: [
        {
          file: "src/a.ts",
          added: ["await Promise.all(chunks);"],
          removed: [],
          newLines: 1,
        },
      ],
    }),
  );
  assert.deepEqual(ids(found), ["F9"]);
  assert.equal(found[0]?.severity, "warn");
});

test("F10 fires on a sourced requirement nothing satisfies", () => {
  const found = familyF.check(
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
  assert.ok(ids(found).includes("F10"));
});

test("F11 fires on an open blocking risk nothing verifies", () => {
  const open = record({
    conceptId: "risk.x",
    type: "risk",
    status: "open",
    materiality: "blocking",
    anchors: [{ file: "src/a.ts" }],
  });
  assert.ok(ids(familyF.check(ctx({ records: [open] }))).includes("F11"));
  const resolved = { ...open, status: "resolved" };
  assert.ok(!ids(familyF.check(ctx({ records: [resolved] }))).includes("F11"));
});

test("F12 fires on a wide change carried by a fact alone", () => {
  const found = familyF.check(
    ctx({
      changedSymbols: [
        {
          file: "src/a.ts",
          symbol: "Alpha",
          hunks: [{ added: Array(31).fill("x"), removed: [] }],
        },
      ],
      records: [
        record({
          type: "fact",
          conceptId: "fact.x",
          anchors: [{ file: "src/a.ts" }],
        }),
      ],
    }),
  );
  assert.ok(ids(found).includes("F12"));
});

test("F7 is not implemented without a codegraph", () => {
  const found = familyF.check(
    ctx({
      codeFiles: [{ path: "src/a.ts", status: "M" }],
      classes: new Map([["src/a.ts", "code"]]),
      hunks: [
        {
          file: "src/a.ts",
          added: ["export function alpha() {}"],
          removed: [],
          newLines: 1,
        },
      ],
    }),
  );
  assert.ok(!ids(found).includes("F7"));
});

test("a block demotes to a warning by id", () => {
  const findings = [
    {
      id: "A1",
      family: "A",
      severity: /** @type {const} */ ("block"),
      kind: /** @type {const} */ ("semantic"),
      message: "x",
    },
  ];
  const [only] = applyPolicy(findings, { ...DEFAULTS, warn: ["A1"], off: [] });
  assert.equal(only?.severity, "warn");
  assert.deepEqual(
    applyPolicy(findings, { ...DEFAULTS, warn: [], off: ["A1"] }),
    [],
  );
});

test("--report flags only the one repair the fixer may apply", () => {
  /** @param {string} id */
  const one = (id) =>
    label({
      id,
      family: id[0] ?? "",
      severity: /** @type {const} */ ("block"),
      kind: /** @type {const} */ ("mechanical"),
      message: "x",
    });
  assert.equal(one("D5").fixable, true);
  // B1, E2 and E3 are mechanical in the tiers that may edit a record, and
  // still not the fixer's: no op it is granted performs them.
  assert.deepEqual(
    ["A1", "B1", "B5", "C1", "D1", "E1", "E2", "E3", "F1"].map(
      (id) => one(id).fixable,
    ),
    [false, false, false, false, false, false, false, false, false],
  );
  assert.equal(one("D5").label, "mechanical");
});

test("the builtin classifier names the classes family A skips", () => {
  assert.equal(builtinClass("src/a.spec.ts"), "test");
  assert.equal(builtinClass("src/protocol/generated/index.ts"), "generated");
  assert.equal(builtinClass("pnpm-lock.yaml"), "lockfile");
  assert.equal(builtinClass("docs/README.md"), "docs");
  assert.equal(builtinClass(".github/workflows/ci.yml"), "ci");
  assert.equal(builtinClass("src/services/tenant.service.ts"), "code");
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
    familyB.check(ctx({ records: [record({ anchors: [] })] })),
    [],
  );
});
