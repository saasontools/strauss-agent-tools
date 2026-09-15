import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  anchorHashOf,
  detectAnchorDrift,
  hashAnchorText,
  resolveAnchorSpan,
} from "./anchor-resolver/index.js";
import { anchorResolveCommand } from "./commands/anchor-resolve.js";
import {
  doctorCommand,
  type KbDoctorCommandResult,
} from "./commands/doctor.js";
import { composeRecord } from "./compose.js";
import { matchToDiff } from "./match-diff.js";
import {
  kbAnchorSchema,
  kbAnchorWriteSchema,
  type KbAnchor,
  type KbRecord,
} from "./kb-record.schema.js";
import { KbStore } from "./kb-store.js";
import { validateBundle } from "./validate.js";

/**
 * Spans exist for what has no symbol. YAML is the plainest case: no resolver
 * in the chain can name a key, so the range is the only address there is.
 */
const FILE = "config/queue.yaml";
const SOURCE = [
  "retries:",
  "  attempts: 3",
  "  backoff: exponential",
  "workers: 4",
  "",
].join("\n");

/** Lines 1-3: the retry block, and nothing else. */
const RETRIES = "retries:\n  attempts: 3\n  backoff: exponential";
const ID = "constraint.retry-budget";
const NOW = "2026-09-05T09:00:00Z";

function spanAnchor(extra: Partial<KbAnchor> = {}): KbAnchor {
  return {
    file: FILE,
    span: { start: 1, end: 3 },
    hash: hashAnchorText(RETRIES),
    hash_kind: "raw",
    resolver: "span",
    lines: 3,
    resolved_at: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

function record(anchors: KbAnchor[]): KbRecord {
  const input = composeRecord(
    "constraint",
    {
      slug: "retry-budget",
      title: "Three attempts, exponential backoff",
      why: "A fourth attempt outlives the caller's timeout.",
      anchors,
    },
    "agent:writer",
    "2026-08-01T00:00:00Z",
  );
  return {
    conceptId: ID,
    frontmatter: { ...input.frontmatter, type: input.type },
    body: input.body,
  } as KbRecord;
}

describe("the anchor schema", () => {
  test("accepts a span, and a side that names its ref", () => {
    expect(
      kbAnchorWriteSchema.safeParse({
        file: FILE,
        span: { start: 1, end: 3 },
      }).success,
    ).toBe(true);
    expect(
      kbAnchorWriteSchema.safeParse({
        file: FILE,
        symbol: "totals",
        side: "old",
        ref: "abc1234",
      }).success,
    ).toBe(true);
  });

  test("a write refuses a span beside a symbol, and side: old with no ref", () => {
    expect(
      kbAnchorWriteSchema.safeParse({
        file: FILE,
        symbol: "totals",
        span: { start: 1, end: 3 },
      }).error?.issues[0]?.message,
    ).toMatch(/symbol or a span/);
    expect(
      kbAnchorWriteSchema.safeParse({ file: FILE, side: "old" }).error
        ?.issues[0]?.message,
    ).toMatch(/needs a ref/);
  });

  test("a write refuses a backwards range, and an ast hash over a span", () => {
    expect(
      kbAnchorWriteSchema.safeParse({ file: FILE, span: { start: 9, end: 4 } })
        .error?.issues[0]?.message,
    ).toMatch(/must not precede start/);
    expect(
      kbAnchorWriteSchema.safeParse({
        file: FILE,
        span: { start: 1, end: 3 },
        hash: hashAnchorText(RETRIES),
        hash_kind: "ast",
      }).error?.issues[0]?.message,
    ).toMatch(/hashed raw/);
  });

  // A record that will not parse is a record `kb_validate` cannot fault: it is
  // dropped from `list()` before the check runs.
  test("the read side keeps every defect loadable, and kb_validate names them", () => {
    for (const anchor of [
      { file: FILE, symbol: "totals", span: { start: 1, end: 3 } },
      { file: FILE, span: { start: 9, end: 4 } },
      { file: FILE, span: { start: 1, end: 3 }, hash_kind: "ast" },
    ]) {
      expect(kbAnchorSchema.safeParse(anchor).success).toBe(true);
    }

    // Hand-built: `composeRecord` refuses every one, so only an edited file
    // can carry them into a bundle.
    const problems = validateBundle([
      {
        conceptId: ID,
        frontmatter: {
          type: "constraint",
          strauss_status: "accepted",
          strauss_anchors: [
            { file: FILE, symbol: "totals", span: { start: 1, end: 3 } },
            { file: FILE, span: { start: 9, end: 4 } },
            { file: FILE, span: { start: 1, end: 3 }, hash_kind: "ast" },
            { file: FILE, side: "old" },
          ],
        },
        body: "Body.",
      } as KbRecord,
    ]);

    expect(problems.map((problem) => problem.check)).toEqual([
      "anchor_span",
      "anchor_span",
      "anchor_span",
      "anchor_side",
    ]);
    expect(problems.every((problem) => problem.severity === "error")).toBe(
      true,
    );
  });
});

describe("span resolution", () => {
  test("hashes exactly the named lines, and says which resolver did", () => {
    const outcome = resolveAnchorSpan(SOURCE, {
      file: FILE,
      span: { start: 1, end: 3 },
    });

    expect(outcome).toMatchObject({
      ok: true,
      resolver: "span",
      span: { text: RETRIES, startLine: 1, endLine: 3 },
    });
  });

  // The lines the record named are not there to read, which is the same
  // finding a deleted symbol produces.
  test("a span past the end of the file is out of range", () => {
    expect(
      resolveAnchorSpan("one\ntwo\n", {
        file: FILE,
        span: { start: 1, end: 9 },
      }),
    ).toEqual({ ok: false, reason: "span-out-of-range" });
  });

  // A span is a slice, not a syntactic unit, so no parser is asked to
  // normalise it — the hash stays over raw text whatever the file's language.
  test("a span never takes an ast hash", () => {
    const outcome = resolveAnchorSpan("const a = 1;\nconst b = 2;\n", {
      file: "src/a.ts",
      span: { start: 1, end: 1 },
    });

    expect(outcome.ok && outcome.normalized).toBeUndefined();
  });

  // A hand-written `hash_kind: "ast"` is not honoured: comparing a raw hash
  // against a token stream would report drift on every run for ever.
  test("a stored ast kind does not make a span hash ast", () => {
    const outcome = resolveAnchorSpan(SOURCE, {
      file: FILE,
      span: { start: 1, end: 3 },
    });
    if (!outcome.ok) throw new Error("fixture span did not resolve");

    expect(anchorHashOf(spanAnchor({ hash_kind: "ast" }), outcome)).toEqual({
      hash: hashAnchorText(RETRIES),
      kind: "raw",
    });
  });

  // Absent means the post-change side, so an old-side anchor must not land on
  // a hunk from a caller that never heard of `side`.
  test("an old-side anchor stays off a hunk naming no side", () => {
    expect(
      matchToDiff(
        [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 3 }] }],
        [record([spanAnchor({ side: "old", ref: "abc1234" })])],
      ),
    ).toEqual([]);
  });
});

describe("span drift", () => {
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-span-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-span-bundle-"));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  function write(contents: string, file = FILE): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  async function drift(anchor: KbAnchor) {
    const entry = record([anchor]);
    const found = await detectAnchorDrift([entry], { repoRoot: repo });
    return found.get(ID)?.[0];
  }

  test("unchanged lines match", async () => {
    write(SOURCE);
    expect(await drift(spanAnchor())).toMatchObject({
      state: "match",
      hashKind: "raw",
    });
  });

  test("an edit inside the range is changed", async () => {
    write(SOURCE.replace("attempts: 3", "attempts: 5"));
    expect(await drift(spanAnchor())).toMatchObject({
      state: "drifted",
      class: "changed",
    });
  });

  test("a file that shrank past the range is gone", async () => {
    write("retries:\n");
    expect(await drift(spanAnchor())).toMatchObject({
      state: "unresolved",
      reason: "span-out-of-range",
      class: "gone",
    });
  });

  test("--rebaseline re-hashes the span and leaves the range where the author put it", async () => {
    const edited = SOURCE.replace("attempts: 3", "attempts: 5");
    write(edited);
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "constraint",
        {
          slug: "retry-budget",
          title: "Three attempts, exponential backoff",
          why: "A fourth attempt outlives the caller's timeout.",
          anchors: [spanAnchor()],
        },
        "agent:writer",
        "2026-08-01T00:00:00Z",
      ),
    );

    const output = (await anchorResolveCommand.run(
      { store, actor: "agent:resolver", now: () => NOW },
      anchorResolveCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        repoRoot: repo,
        rebaseline: true,
      }),
    )) as { results: { state: string; rebaselined?: boolean }[] };

    expect(output.results[0]).toMatchObject({
      state: "drifted",
      rebaselined: true,
    });

    const after = (await store.read(bundle, ID))?.frontmatter
      .strauss_anchors?.[0];
    expect(after).toMatchObject({
      span: { start: 1, end: 3 },
      resolver: "span",
      hash_kind: "raw",
      hash: hashAnchorText(edited.split("\n").slice(0, 3).join("\n")),
      resolved_at: NOW,
    });
  });

  test("kb_doctor names the span bucket", async () => {
    write(SOURCE);
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "constraint",
        {
          slug: "retry-budget",
          title: "Three attempts, exponential backoff",
          why: "A fourth attempt outlives the caller's timeout.",
          anchors: [spanAnchor()],
        },
        "agent:writer",
        "2026-08-01T00:00:00Z",
      ),
    );

    const report = (await doctorCommand.run(
      { store, actor: "agent:reader", now: () => NOW },
      doctorCommand.input.parse({ bundlePath: bundle, repoRoot: repo }),
    )) as KbDoctorCommandResult;

    expect(report.anchorResolvers).toMatchObject({ total: 1, span: 1 });
    expect(doctorCommand.render?.(report)).toContain(
      "anchors: 1 hashed — 0 tree-sitter, 0 regex, 1 span",
    );
  });
});
