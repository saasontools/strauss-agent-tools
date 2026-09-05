// @ts-check
/** Step-model rules, against a hand-built stand-in for the CLI's output. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { escapeHtml, fill, renderHtml } from "./lib/html.mjs";
import { deepLink, fileAnchor, normalizePrUrl } from "./lib/links.mjs";
import {
  AnchorCheckError,
  buildModel,
  DriftRefusal,
  STEP_CAP,
} from "./lib/model.mjs";
import { main, readReviewer, UsageError } from "./render.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, "..", "templates", "walkthrough.html");

const OPTIONS = {
  range: "main..head",
  repoRoot: "/repo",
  bundle: "/repo/.strauss/kb",
  pr: "https://github.com/acme/app/pull/7",
  reviewer: {},
  allowDrift: false,
};

/**
 * @param {string} conceptId
 * @param {object} extra
 */
function loadRecord(conceptId, extra) {
  return {
    conceptId,
    title: `title of ${conceptId}`,
    standing: "current",
    supersededBy: [],
    warnings: [],
    anchors: [],
    body: "",
    ...extra,
  };
}

/**
 * The canned CLI: one canned answer per verb, keyed the way the model asks.
 *
 * @param {any} fixture
 * @returns {import("./lib/cli.mjs").Runners}
 */
function fakeRunners(fixture) {
  return {
    /**
     * @param {string[]} argv
     * @param {{ optional?: boolean }} [options]
     */
    kb(argv, options) {
      const verb = argv[0];
      if (verb === "load") return fixture.load;
      if (verb === "match") return fixture.match ?? [];
      if (verb === "classify") return fixture.classify ?? null;
      if (verb === "anchor-resolve") {
        const canned = fixture.anchorResolve?.[argv[1] ?? ""];
        if (canned instanceof Error) throw canned;
        // `null` stands for a CLI that has no such verb.
        if (canned === null) return null;
        return canned ?? { results: [] };
      }
      if (verb === "backlinks") {
        return fixture.backlinks?.[argv[1] ?? ""] ?? { backlinks: [] };
      }
      if (verb === "list") {
        return fixture.list?.[argv[argv.indexOf("--tag") + 1] ?? ""] ?? [];
      }
      if (options?.optional) return null;
      throw new Error(`unexpected verb ${verb}`);
    },
    /** @param {string[]} argv */
    git(argv) {
      if (argv[0] === "rev-parse") return `${fixture.headSha}\n`;
      // `--name-only -z`: NUL-separated, no trailing separator drama.
      if (argv[0] === "diff") {
        return (fixture.changed ?? [])
          .map((/** @type {string} */ f) => `${f}\0`)
          .join("");
      }
      throw new Error(`unexpected git ${argv.join(" ")}`);
    },
  };
}

/**
 * One base carrying every step kind, so ordering is testable in one build.
 *
 * @returns {any}
 */
function everyKind() {
  return {
    headSha: "0123456789abcdef0123456789abcdef01234567",
    changed: [
      "src/checkout/pay.ts",
      "src/services/tenant.service.ts",
      "src/protocol/generated/index.ts",
      "docs/readme.md",
      ".strauss/kb/risk.double-charge.md",
    ],
    load: {
      loaded: true,
      recordCount: 5,
      digest: "d1",
      records: [
        loadRecord("risk.double-charge", {
          body: "## Mitigation\n\nKey is the order id.\n\n## Verification\n\nnode --test pay.spec.ts\n\nVerified by [test-obligation.single-charge](test-obligation.single-charge.md).",
        }),
        loadRecord("risk.slow-batch", { body: "## Mitigation\n\nChunked." }),
        loadRecord("requirement.ac-3-partial-batch", {
          body: "## Claim\n\nMissing keys come back. And more.",
        }),
        loadRecord("flow.tenant-batch-get", {
          anchors: [
            {
              file: "src/services/tenant.service.ts",
              symbol: "TenantService.findMany",
              hash: "sha256:x",
              resolved_at: "now",
              lines: 9,
            },
          ],
        }),
        loadRecord("open-question.retry-budget-scope", {
          standing: "open",
          body: "## Question\n\nPer tenant or global?\n\n## Default assumption\n\nGlobal.",
        }),
        loadRecord("fact.protocol-generated", {
          body: "## Claim\n\nGenerated.",
        }),
        loadRecord("test-obligation.single-charge", { standing: "open" }),
      ],
    },
    match: [
      {
        filePath: "src/checkout/pay.ts",
        hunk: { startLine: 24, endLine: 26 },
        precision: "symbol",
        records: [
          {
            conceptId: "risk.double-charge",
            type: "risk",
            title: "A retried checkout can charge twice",
            standing: "current",
            status: "open",
            supersededBy: [],
            materiality: "blocking",
            confidence: "medium",
            anchor: {
              file: "src/checkout/pay.ts",
              symbol: "PaymentClient.charge",
            },
          },
        ],
      },
      {
        filePath: "src/services/tenant.service.ts",
        hunk: { startLine: 8, endLine: 8, side: "old" },
        precision: "symbol",
        records: [
          {
            conceptId: "risk.slow-batch",
            type: "risk",
            title: "A batch that throws loses the whole call",
            standing: "current",
            status: "open",
            supersededBy: [],
            materiality: "important",
            anchor: {
              file: "src/services/tenant.service.ts",
              symbol: "TenantService.findMany",
            },
          },
        ],
      },
    ],
    backlinks: {
      "requirement.ac-3-partial-batch": {
        target: "requirement.ac-3-partial-batch",
        backlinks: [
          {
            from: "flow.tenant-batch-get",
            rel: "satisfies",
            title: "Tenant lookup batches ids",
            standing: "current",
          },
          {
            from: "decision.tenant-cache-ttl",
            rel: "depends_on",
            title: "Cached for sixty seconds",
            standing: "current",
          },
        ],
      },
    },
    list: {
      "review:generated": [
        {
          conceptId: "fact.protocol-generated",
          title: "Protocol types are generated",
          status: "accepted",
          anchors: [{ file: "src/protocol/generated/index.ts" }],
        },
      ],
    },
  };
}

test("builds a step model from the CLI's output alone", () => {
  const model = buildModel(fakeRunners(everyKind()), OPTIONS);
  assert.equal(model.headSha, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(model.digest, "d1");
  assert.equal(model.classifier, "kb-only");
  // The stamp is step 1 and is not counted: `steps` is the content deck.
  assert.equal(model.steps, model.primary.length - 1);

  const risk = model.primary.find((/** @type {any} */ s) => s.kind === "risk");
  assert.equal(risk.detail.mitigation, "Key is the order id.");
  assert.equal(risk.detail.verification, "node --test pay.spec.ts");
  assert.equal(risk.detail.verify, "node --test pay.spec.ts");
  assert.deepEqual(risk.detail.verifiedBy, [
    { conceptId: "test-obligation.single-charge", standing: "open" },
  ]);
  assert.equal(risk.detail.verifiedByState, "open");

  const question = model.primary.find(
    (/** @type {any} */ s) => s.kind === "question",
  );
  assert.equal(question.detail.assumption, "Global.");
});

test("orders risks by materiality, then walks AC, skips, questions, files", () => {
  const model = buildModel(fakeRunners(everyKind()), OPTIONS);
  assert.deepEqual(
    model.primary.map((/** @type {any} */ step) => step.kind),
    ["stamp", "risk", "risk", "acceptance", "skip", "question", "file"],
  );
  assert.deepEqual(
    model.primary
      .filter((/** @type {any} */ s) => s.kind === "risk")
      .map((/** @type {any} */ s) => s.detail.materiality),
    ["blocking", "important"],
  );
  // The AC's satisfier is the flow; a `depends_on` backlink is not one.
  const ac = model.primary[3];
  assert.deepEqual(
    ac.detail.satisfiedBy.map((/** @type {any} */ e) => e.conceptId),
    ["flow.tenant-batch-get"],
  );
  assert.deepEqual(ac.detail.satisfiedBy[0].anchors, [
    {
      file: "src/services/tenant.service.ts",
      symbol: "TenantService.findMany",
    },
  ]);
  // Anchored and skipped files are spoken for; only docs/readme.md is left.
  assert.deepEqual(
    model.primary
      .filter((/** @type {any} */ s) => s.kind === "file")
      .map((/** @type {any} */ s) => s.detail.filePath),
    ["docs/readme.md"],
  );
});

test("the companion base's own files go in the skip step, not the deck", () => {
  const model = buildModel(fakeRunners(everyKind()), OPTIONS);
  const skip = model.primary.find((/** @type {any} */ s) => s.kind === "skip");
  assert.deepEqual(
    skip.detail.files.map((/** @type {any} */ f) => f.filePath),
    [".strauss/kb/risk.double-charge.md"],
  );
  assert.equal(skip.detail.records[0].conceptId, "fact.protocol-generated");
  assert.equal(skip.detail.records[0].verify, null);
});

test("drops a superseded risk and an answered question", () => {
  const fixture = everyKind();
  fixture.match[0].records[0].standing = "superseded";
  // `resolved` adjudicates to `current`; the question is answered and gone.
  fixture.load.records[4].standing = "current";
  const kinds = buildModel(fakeRunners(fixture), OPTIONS).primary.map(
    (/** @type {any} */ step) => step.kind,
  );
  // The dropped risk's file is no longer spoken for, so it gets a file step.
  assert.deepEqual(kinds, [
    "stamp",
    "risk",
    "acceptance",
    "skip",
    "file",
    "file",
  ]);
});

test("caps the content steps at twelve and sends the overflow to `also`", () => {
  const fixture = everyKind();
  const before = buildModel(fakeRunners(fixture), OPTIONS).primary.filter(
    (/** @type {any} */ step) => step.kind !== "file" && step.kind !== "stamp",
  ).length;
  fixture.changed = Array.from({ length: 30 }, (_, i) => `src/file-${i}.ts`);
  const model = buildModel(fakeRunners(fixture), OPTIONS);
  // The stamp rides outside the cap, and `steps` counts the content only.
  assert.equal(model.primary[0].kind, "stamp");
  assert.equal(model.primary.length, STEP_CAP + 1);
  assert.equal(model.steps, STEP_CAP);
  assert.equal(model.also.length, before + 30 - STEP_CAP);
  assert.deepEqual(
    model.primary.map((/** @type {any} */ s) => s.n),
    Array.from({ length: STEP_CAP + 1 }, (_, i) => i + 1),
  );
  assert.equal(model.also[0].kind, "file");
});

test("refuses to render when an anchor in the diff drifted", () => {
  const fixture = everyKind();
  fixture.anchorResolve = {
    "risk.double-charge": {
      conceptId: "risk.double-charge",
      results: [
        {
          file: "src/checkout/pay.ts",
          symbol: "PaymentClient.charge",
          state: "drifted",
          reason: "moved",
        },
      ],
    },
  };
  assert.throws(() => buildModel(fakeRunners(fixture), OPTIONS), DriftRefusal);
  const model = buildModel(fakeRunners(fixture), {
    ...OPTIONS,
    allowDrift: true,
  });
  assert.deepEqual(model.drift, [
    {
      conceptId: "risk.double-charge",
      file: "src/checkout/pay.ts",
      symbol: "PaymentClient.charge",
      reason: "moved",
    },
  ]);
  assert.deepEqual(model.primary[0].detail.drift, ["risk.double-charge"]);
});

test("a rebaselined anchor is not drift", () => {
  const fixture = everyKind();
  fixture.anchorResolve = {
    "risk.double-charge": {
      results: [
        { file: "src/checkout/pay.ts", state: "drifted", rebaselined: true },
      ],
    },
  };
  assert.deepEqual(buildModel(fakeRunners(fixture), OPTIONS).drift, []);
});

test("deep links hash the path the way GitHub does", () => {
  assert.equal(
    fileAnchor("src/checkout/pay.ts"),
    "2c81e7b068e0eaaef9a8dbb3aa11072b08bbbe782487abba3b09da299ba367b8",
  );
  const pr = "https://github.com/acme/app/pull/7";
  assert.equal(
    deepLink({ pr, filePath: "src/checkout/pay.ts", line: 24 }).href,
    `${pr}/files#diff-${fileAnchor("src/checkout/pay.ts")}R24`,
  );
  assert.equal(
    deepLink({ pr, filePath: "src/checkout/pay.ts", line: 8, side: "old" })
      .href,
    `${pr}/files#diff-${fileAnchor("src/checkout/pay.ts")}L8`,
  );
  const fileOnly = deepLink({ pr, filePath: "src/checkout/pay.ts" });
  assert.equal(fileOnly.precise, false);
  assert.match(fileOnly.note ?? "", /opens the file/);
  assert.equal(deepLink({ pr: null, filePath: "a.ts" }).href, null);
});

test("the old-side hunk a record sits on becomes an L anchor", () => {
  const model = buildModel(fakeRunners(everyKind()), OPTIONS);
  const important = model.primary[2];
  assert.ok(important);
  assert.equal(important.detail.materiality, "important");
  assert.match(important.link.href, /L8$/);
});

test("escapes everything a record wrote", () => {
  assert.equal(
    escapeHtml(`<script>"x"&'y'</script>`),
    "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
  );
  const fixture = everyKind();
  fixture.load.records[0].title = "<script>alert(1)</script>";
  fixture.match[0].records[0].title = "<script>alert(1)</script>";
  fixture.load.records[0].body =
    "## Mitigation\n\n<img src=x onerror=alert(1)>";
  const html = renderHtml(
    buildModel(fakeRunners(fixture), OPTIONS),
    readFileSync(TEMPLATE, "utf8"),
  );
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("--pr is refused unless it is a GitHub pull request URL", () => {
  assert.equal(
    normalizePrUrl("https://github.com/acme/app/pull/7/"),
    "https://github.com/acme/app/pull/7",
  );
  for (const bad of [
    "javascript:alert(1)",
    "http://github.com/acme/app/pull/7",
    "https://github.com.evil.test/acme/app/pull/7",
    "https://github.com/acme/app/pulls/7",
    "https://github.com/acme/app/pull/seven",
    "acme/app#7",
  ]) {
    assert.equal(normalizePrUrl(bad), null, bad);
  }
  assert.throws(
    () =>
      main(["--range", "main..head", "--json", "--pr", "javascript:alert(1)"]),
    UsageError,
  );
  // Belt and braces: the renderer still refuses a non-http href.
  const model = buildModel(fakeRunners(everyKind()), {
    ...OPTIONS,
    pr: "javascript:alert(1)",
  });
  assert.ok(
    !renderHtml(model, readFileSync(TEMPLATE, "utf8")).includes(
      "javascript:alert(1)",
    ),
  );
});

test("malformed --reviewer input is a usage error", () => {
  assert.deepEqual(readReviewer('{"risk.a":{"verdict":"ok"}}'), {
    "risk.a": { verdict: "ok" },
  });
  assert.throws(() => readReviewer("{nope"), UsageError);
});

test("the template fills only the placeholders it is given", () => {
  assert.equal(fill("<p>{{a}}{{b}}</p>", { a: "1" }), "<p>1{{b}}</p>");
});

test("the reviewer's verdict rides on the record it names", () => {
  const model = buildModel(fakeRunners(everyKind()), {
    ...OPTIONS,
    reviewer: {
      "risk.double-charge": {
        verdict: "accepted",
        note: "checked the key derivation",
        findings: ["one charge in the retry test"],
      },
    },
  });
  assert.deepEqual(model.primary[1].detail.verdict, {
    verdict: "accepted",
    note: "checked the key derivation",
    findings: ["one charge in the retry test"],
  });
  assert.equal(model.primary[2].detail.verdict, null);
});

test("an anchor nobody could check refuses the render like drift", () => {
  const fixture = everyKind();
  fixture.anchorResolve = {
    "risk.double-charge": {
      results: [
        {
          file: "src/checkout/pay.ts",
          state: "unresolved",
          reason: "remote-unreachable",
        },
      ],
    },
  };
  assert.throws(() => buildModel(fakeRunners(fixture), OPTIONS), DriftRefusal);
  const model = buildModel(fakeRunners(fixture), {
    ...OPTIONS,
    allowDrift: true,
  });
  assert.deepEqual(model.drift, []);
  assert.deepEqual(model.unchecked, [
    {
      conceptId: "risk.double-charge",
      file: "src/checkout/pay.ts",
      reason: "remote-unreachable",
    },
  ]);
  assert.deepEqual(model.primary[0].detail.unchecked, ["risk.double-charge"]);
});

test("an anchor-resolve that failed is not a clean check", () => {
  const fixture = everyKind();
  fixture.anchorResolve = {
    "risk.double-charge": Object.assign(new Error("anchor-resolve exited 2"), {
      stderr: "strauss-kb: error: --repo-root is not a repository",
    }),
  };
  assert.throws(
    () => buildModel(fakeRunners(fixture), OPTIONS),
    AnchorCheckError,
  );
  // `--allow-drift` allows drift; it does not invent a drift answer.
  assert.throws(
    () => buildModel(fakeRunners(fixture), { ...OPTIONS, allowDrift: true }),
    (/** @type {any} */ error) =>
      error instanceof AnchorCheckError &&
      error.stderr.includes("not a repository"),
  );
});

test("`driftChecked` counts the resolves that came back", () => {
  const fixture = everyKind();
  assert.equal(
    buildModel(fakeRunners(fixture), OPTIONS).primary[0].detail.driftChecked,
    2,
  );
  fixture.anchorResolve = { "risk.double-charge": null };
  const model = buildModel(fakeRunners(fixture), {
    ...OPTIONS,
    allowDrift: true,
  });
  assert.equal(model.primary[0].detail.driftChecked, 1);
  assert.deepEqual(model.primary[0].detail.unchecked, ["risk.double-charge"]);
});

test("a superseded fact stops telling the reviewer to skip its file", () => {
  const fixture = everyKind();
  fixture.load.records[5].standing = "superseded";
  const skip = buildModel(fakeRunners(fixture), OPTIONS).primary.find(
    (/** @type {any} */ s) => s.kind === "skip",
  );
  assert.deepEqual(skip.detail.records, []);
});

test("standing excludes a satisfier, then the acceptance criterion itself", () => {
  const fixture = everyKind();
  fixture.backlinks["requirement.ac-3-partial-batch"].backlinks[0].standing =
    "superseded";
  const ac = buildModel(fakeRunners(fixture), OPTIONS).primary.find(
    (/** @type {any} */ s) => s.kind === "acceptance",
  );
  assert.deepEqual(ac.detail.satisfiedBy, []);
  fixture.load.records[2].standing = "rejected";
  assert.equal(
    buildModel(fakeRunners(fixture), OPTIONS).primary.some(
      (/** @type {any} */ s) => s.kind === "acceptance",
    ),
    false,
  );
});

test("the footnote `promote` writes is not an acceptance criterion", () => {
  const fixture = everyKind();
  fixture.load.records[2] = loadRecord("requirement.retry-budget", {
    body: "## Claim\n\nRetries are budgeted.\n\n[^promoted]: https://github.com/acme/app/pull/7",
    sources: [
      { id: "promoted", resource: "https://github.com/acme/app/pull/7" },
    ],
  });
  const isAc = (/** @type {any} */ f) =>
    buildModel(fakeRunners(f), OPTIONS).primary.some(
      (/** @type {any} */ s) => s.kind === "acceptance",
    );
  assert.equal(isAc(fixture), false);
  fixture.load.records[2].sources.push({ id: "saa-1", resource: "SAA-1" });
  fixture.load.records[2].body += "\n[^saa-1]: SAA-1";
  assert.equal(isAc(fixture), true);
});

test("a non-ASCII path reaches the deck unquoted", () => {
  const fixture = everyKind();
  fixture.changed = ["src/caf\u00e9.ts"];
  const model = buildModel(fakeRunners(fixture), OPTIONS);
  const file = model.primary.find((/** @type {any} */ s) => s.kind === "file");
  assert.equal(file.detail.filePath, "src/caf\u00e9.ts");
  assert.equal(
    file.link.href,
    `${OPTIONS.pr}/files#diff-${fileAnchor("src/caf\u00e9.ts")}`,
  );
});

test("a risk names how its verification stands", () => {
  const html = renderHtml(
    buildModel(fakeRunners(everyKind()), OPTIONS),
    readFileSync(TEMPLATE, "utf8"),
  );
  assert.match(html, /test-obligation\.single-charge \(open\) — open/);
});
