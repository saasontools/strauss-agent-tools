/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { composeRecord, type ComposeInput } from "./compose.js";
import { KbRecordNotFoundError } from "./kb-errors.js";
import { edgeNeighbours } from "./kb-edges.js";
import { backlinks, impact } from "./kb-links/index.js";
import type { KbLink, KbRecord, KbRecordStatus } from "./kb-record.schema.js";
import { KbStore } from "./kb-store.js";
import { pack } from "./pack.js";
import { validateBundle } from "./validate.js";

interface Ctx {
  bundle: string;
  store: KbStore;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  store: async ({}, use) => {
    await use(new KbStore());
  },
});

const WRITTEN_BY = "test-writer";
const WRITTEN_AT = "2026-08-02T09:14:00Z";

function fact(slug: string, overrides: Partial<ComposeInput> = {}) {
  return composeRecord(
    "fact",
    {
      slug,
      title: `Fact ${slug}`,
      why: "Something observed.",
      sections: { Claim: "The claim." },
      ...overrides,
    },
    WRITTEN_BY,
    WRITTEN_AT,
  );
}

/**
 * A record built in memory rather than through `composeRecord`, which is the
 * only way to state an edge the composer refuses to write — an unknown rel, a
 * dangling target, a cycle. Those are exactly the cases `kb_validate` exists
 * to report, so the tests for them cannot go through the strict write path.
 */
function record(
  conceptId: string,
  links: KbLink[] = [],
  status: KbRecordStatus = "accepted",
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      title: conceptId,
      strauss_status: status,
      ...(links.length ? { strauss_links: links } : {}),
    } as KbRecord["frontmatter"],
    body: "Body.",
  };
}

const ids = (result: { impacted: { conceptId: string }[] }) =>
  result.impacted.map((entry) => entry.conceptId);

describe("strauss_links on the record", () => {
  test("a record with no links round-trips with the key absent", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("plain"));

    const [stored] = await store.list(bundle);
    expect(stored?.frontmatter.strauss_links).toBeUndefined();
    expect(validateBundle(await store.list(bundle))).toEqual([]);
  });

  test("compose stores the links and renders one sentence each", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("cache-key"));
    await store.write(bundle, fact("region-rollout"));
    await store.write(
      bundle,
      fact("router", {
        links: [
          { target: "fact.cache-key", rel: "depends_on" },
          { target: "fact.region-rollout", rel: "verified_by" },
        ],
      }),
    );

    const router = (await store.list(bundle)).find(
      (r) => r.conceptId === "fact.router",
    );

    expect(router?.frontmatter.strauss_links).toEqual([
      { target: "fact.cache-key", rel: "depends_on" },
      { target: "fact.region-rollout", rel: "verified_by" },
    ]);
    // The prose is what an OKF reader that knows nothing about strauss_links
    // still gets: a markdown link with the kind in the surrounding words.
    expect(router?.body).toContain(
      "Depends on [fact.cache-key](fact.cache-key.md).",
    );
    expect(router?.body).toContain(
      "Verified by [fact.region-rollout](fact.region-rollout.md).",
    );
  });

  test("compose refuses a rel outside the closed vocabulary", () => {
    expect(() =>
      fact("bad", {
        links: [{ target: "fact.other", rel: "supersedes" } as never],
      }),
    ).toThrow();
  });

  // Supersession is a lifecycle, not an edge: it already has two frontmatter
  // keys the store writes together, and a rel would be a second spelling that
  // can disagree with the first.
  test("the vocabulary has no supersession rel", async () => {
    const { KB_LINK_RELS } = await import("./record-types.js");
    expect(KB_LINK_RELS).toEqual([
      "depends_on",
      "constrains",
      "informs",
      "blocks",
      "invalidates",
      "verified_by",
      "satisfies",
      "related_to",
    ]);
  });
});

describe("validateBundle over typed links", () => {
  // An unknown rel cannot be traversed by anything and no later write fixes
  // it, so it fails the check.
  test("an unknown rel is an error", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "causes" }]),
      record("fact.b"),
    ];

    expect(validateBundle(bundle)).toEqual([
      {
        check: "link_rel",
        conceptId: "fact.a",
        note: expect.stringContaining('unknown rel "causes" on link to fact.b'),
        severity: "error",
      },
    ]);
  });

  // Writing a record before the one it points at is ordinary, so a dangling
  // target is reported without failing.
  test("a target not in the bundle is a warning", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.later", rel: "informs" }]),
    ];

    expect(validateBundle(bundle)).toEqual([
      {
        check: "link_target",
        conceptId: "fact.a",
        note: "target fact.later is not in the bundle",
        severity: "warning",
      },
    ]);
  });

  test("a self-link is a warning, not a parse failure", () => {
    expect(
      validateBundle([record("fact.a", [{ target: "fact.a", rel: "blocks" }])]),
    ).toEqual([
      {
        check: "link_target",
        conceptId: "fact.a",
        note: "links to itself (blocks)",
        severity: "warning",
      },
    ]);
  });

  // The tolerant read is the whole point of validating rels here rather than
  // in the schema: a strict schema would make the file fail to parse, and a
  // file that fails to parse is skipped by list() — reported by nothing.
  test("a record carrying an unknown rel still loads", async ({
    store,
    bundle,
  }) => {
    writeFileSync(
      join(bundle, "fact.foreign.md"),
      [
        "---",
        "type: fact",
        "strauss_status: accepted",
        "strauss_links:",
        "  - { target: fact.other, rel: causes }",
        "---",
        "Body.",
        "",
      ].join("\n"),
    );

    const records = await store.list(bundle);
    expect(records.map((r) => r.conceptId)).toEqual(["fact.foreign"]);
    expect(validateBundle(records)).toContainEqual(
      expect.objectContaining({ check: "link_rel", severity: "error" }),
    );
  });
});

describe("impact", () => {
  // A depends_on B, B depends_on C. Changing C reaches B, then A.
  test("walks inbound edges transitively", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.c", rel: "depends_on" }]),
      record("fact.c"),
    ];

    const result = impact("fact.c", bundle);
    expect(ids(result)).toEqual(["fact.b", "fact.a"]);
    expect(result.impacted.map((entry) => entry.depth)).toEqual([1, 2]);
    expect(result.impacted[0]?.via).toEqual([
      { from: "fact.b", rel: "depends_on" },
    ]);
  });

  // The edge lives on the source and reads source → target, so the record that
  // declared the dependence is downstream of its target, never upstream.
  test("does not walk outbound", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
    ];

    expect(ids(impact("fact.a", bundle))).toEqual([]);
    expect(ids(impact("fact.b", bundle))).toEqual(["fact.a"]);
  });

  test("ignores related_to, which claims no dependence", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "related_to" }]),
      record("fact.c", [{ target: "fact.b", rel: "constrains" }]),
      record("fact.b"),
    ];

    expect(ids(impact("fact.b", bundle))).toEqual(["fact.c"]);
    // ...unless the caller asks for it outright.
    expect(ids(impact("fact.b", bundle, { rels: ["related_to"] }))).toEqual([
      "fact.a",
    ]);
  });

  // Adjudicated, not filtered: the superseded record is in the answer with its
  // standing. What standing changes is traversal — its own edges no longer
  // hold, so nothing behind it is reported as at risk.
  test("reports a superseded record but does not walk through it", () => {
    const bundle = [
      record("fact.behind", [{ target: "fact.old", rel: "depends_on" }]),
      record(
        "fact.old",
        [{ target: "fact.c", rel: "depends_on" }],
        "superseded",
      ),
      record("fact.c"),
    ];

    const result = impact("fact.c", bundle);
    expect(ids(result)).toEqual(["fact.old"]);
    expect(result.impacted[0]?.standing).toBe("superseded");
    expect(result.stopped).toEqual(["fact.old"]);
  });

  test("stops at a rejected record too", () => {
    const bundle = [
      record("fact.behind", [{ target: "fact.no", rel: "blocks" }]),
      record("fact.no", [{ target: "fact.c", rel: "blocks" }], "rejected"),
      record("fact.c"),
    ];

    const result = impact("fact.c", bundle);
    expect(ids(result)).toEqual(["fact.no"]);
    expect(result.stopped).toEqual(["fact.no"]);
  });

  // `A depends_on B` with `B constrains A` is a legitimate pair, not a defect.
  test("terminates on a cycle and keeps every reason it was reached", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.a", rel: "constrains" }]),
    ];

    const result = impact("fact.a", bundle);
    expect(ids(result)).toEqual(["fact.b"]);
    expect(result.impacted[0]?.depth).toBe(1);

    // Two rels between the same pair both survive into `via`.
    const doubled = impact("fact.b", [
      record("fact.a", [
        { target: "fact.b", rel: "depends_on" },
        { target: "fact.b", rel: "informs" },
      ]),
      record("fact.b"),
    ]);
    expect(doubled.impacted[0]?.via).toEqual([
      { from: "fact.a", rel: "depends_on" },
      { from: "fact.a", rel: "informs" },
    ]);
  });

  test("honours a depth cap", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.c", rel: "depends_on" }]),
      record("fact.c"),
    ];

    expect(ids(impact("fact.c", bundle, { depth: 1 }))).toEqual(["fact.b"]);
  });

  // A blast radius of "nothing" for a record that isn't there is the most
  // dangerous possible answer, so it is refused rather than returned.
  test("refuses a concept id that is not in the bundle", () => {
    expect(() => impact("fact.ghost", [record("fact.a")])).toThrow(
      KbRecordNotFoundError,
    );
  });
});

describe("backlinks", () => {
  test("lists inbound edges of any rel, one hop, with standing", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.pointer", [{ target: "fact.b", rel: "related_to" }]),
      record("fact.gone", [{ target: "fact.b", rel: "informs" }], "rejected"),
      // Two hops away: backlinks is deliberately not transitive.
      record("fact.behind", [{ target: "fact.a", rel: "depends_on" }]),
      record("fact.b"),
    ];

    const result = backlinks("fact.b", bundle);
    expect(result.target).toBe("fact.b");
    expect(
      result.backlinks.map(({ from, rel, standing }) => ({
        from,
        rel,
        standing,
      })),
    ).toEqual([
      { from: "fact.a", rel: "depends_on", standing: "current" },
      { from: "fact.gone", rel: "informs", standing: "rejected" },
      { from: "fact.pointer", rel: "related_to", standing: "current" },
    ]);
  });

  test("is empty for a record nothing points at", () => {
    expect(backlinks("fact.a", [record("fact.a")]).backlinks).toEqual([]);
  });

  test("refuses a concept id that is not in the bundle", () => {
    expect(() => backlinks("fact.ghost", [record("fact.a")])).toThrow(
      KbRecordNotFoundError,
    );
  });
});

describe("typed links in the shared edge inventory", () => {
  test("typed-link is outbound only, like body-link", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
    ];

    expect(
      edgeNeighbours(bundle[0] as KbRecord, bundle, "typed-link").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.b"]);
    expect(edgeNeighbours(bundle[1] as KbRecord, bundle, "typed-link")).toEqual(
      [],
    );
  });

  test("a typed link with no record behind it is skipped, not thrown", () => {
    expect(
      edgeNeighbours(
        record("fact.a", [{ target: "fact.later", rel: "informs" }]),
        [record("fact.a")],
        "typed-link",
      ),
    ).toEqual([]);
  });

  // pack walks every edge kind, so a declared dependency is in the
  // neighbourhood even when the body never mentions it.
  test("pack reaches a record named only in frontmatter", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
    ];

    expect(pack(bundle, "fact.a").records.map((r) => r.conceptId)).toEqual([
      "fact.a",
      "fact.b",
    ]);
  });
});
