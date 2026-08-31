/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { composeRecord, type ComposeInput } from "./compose.js";
import { KbRecordNotFoundError, KbUnknownLinkRelError } from "./kb-errors.js";
import { edgeNeighbours } from "./kb-edges.js";
import { backlinks, impact } from "./kb-links/index.js";
import type { KbLink, KbRecord, KbRecordStatus } from "./kb-record.schema.js";
import { KbStore } from "./kb-store.js";
import { pack } from "./pack.js";
import {
  KB_CAUSAL_LINK_RELS,
  KB_LINK_RELS,
  LINK_RELS,
} from "./record-types.js";
import { trace } from "./trace.js";
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

  // Inert rather than wrong, but there is no reason to store it: every walk
  // skips it, so it would read like a claim and mean nothing.
  test("compose refuses a link to the record's own id", () => {
    expect(() =>
      fact("selfish", {
        links: [{ target: "fact.selfish", rel: "depends_on" }],
      }),
    ).toThrow(/cannot depends_on itself/);
  });

  // The direction of dependence is per-rel and does not follow the edge, so
  // the table is the contract every walk reads.
  test("each rel declares which end depends on the other", () => {
    expect(
      Object.fromEntries(
        KB_LINK_RELS.map((rel) => [rel, LINK_RELS[rel].dependant]),
      ),
    ).toEqual({
      depends_on: "source",
      verified_by: "source",
      satisfies: "source",
      constrains: "target",
      informs: "target",
      blocks: "target",
      invalidates: "target",
      related_to: null,
    });
  });

  test("the causal rels are exactly those carrying a dependence", () => {
    expect(KB_CAUSAL_LINK_RELS).toEqual(
      KB_LINK_RELS.filter((rel) => LINK_RELS[rel].dependant !== null),
    );
    expect(KB_CAUSAL_LINK_RELS).not.toContain("related_to");
  });

  // Supersession is a lifecycle, not an edge: it already has two frontmatter
  // keys the store writes together, and a rel would be a second spelling that
  // can disagree with the first.
  test("the vocabulary has no supersession rel", () => {
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

  // Time can fix an absent target; it can never fix an id no write could
  // produce, so the two findings differ in severity.
  test("a malformed target id is an error, not a warning", () => {
    expect(
      validateBundle([
        record("fact.a", [{ target: "Not A Concept Id", rel: "informs" }]),
      ]),
    ).toEqual([
      {
        check: "link_target",
        conceptId: "fact.a",
        note: expect.stringContaining(
          'target "Not A Concept Id" is not a valid',
        ),
        severity: "error",
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
  // depends_on puts the dependant at the SOURCE: A needs B, so B's change
  // reaches A, then whatever needs A. The walk runs against the edge.
  test("follows a source-dependant rel against the edge, transitively", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.c", rel: "depends_on" }]),
      record("fact.c"),
    ];

    const result = impact("fact.c", bundle);
    expect(ids(result)).toEqual(["fact.b", "fact.a"]);
    expect(result.impacted.map((entry) => entry.depth)).toEqual([1, 2]);
    expect(result.impacted[0]?.via).toEqual([
      { source: "fact.b", target: "fact.c", rel: "depends_on" },
    ]);
    expect(result.truncated).toBe(false);
    expect(result.unexpanded).toEqual([]);
  });

  // ...and the other end stays safe. B needing C does not put C at risk when B
  // moves.
  test("a source-dependant rel does not propagate the other way", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
    ];

    expect(ids(impact("fact.a", bundle))).toEqual([]);
    expect(ids(impact("fact.b", bundle))).toEqual(["fact.a"]);
  });

  // informs/blocks/invalidates/constrains put the dependant at the TARGET, so
  // the walk runs ALONG the edge. Treating these as inbound — the bug this
  // suite exists to pin — reports the blast radius exactly backwards.
  test.each([
    ["informs"],
    ["blocks"],
    ["invalidates"],
    ["constrains"],
  ] as const)("%s puts the dependant at the target", (rel) => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel }]),
      record("fact.b"),
    ];

    // A informs B: change A, and B is what needs revisiting.
    expect(ids(impact("fact.a", bundle))).toEqual(["fact.b"]);
    expect(impact("fact.a", bundle).impacted[0]?.via).toEqual([
      { source: "fact.a", target: "fact.b", rel },
    ]);
    // Change B, and A — which merely informed it — is untouched.
    expect(ids(impact("fact.b", bundle))).toEqual([]);
  });

  test.each([["verified_by"], ["satisfies"]] as const)(
    "%s puts the dependant at the source",
    (rel) => {
      const bundle = [
        record("fact.a", [{ target: "fact.b", rel }]),
        record("fact.b"),
      ];

      expect(ids(impact("fact.b", bundle))).toEqual(["fact.a"]);
      expect(ids(impact("fact.a", bundle))).toEqual([]);
    },
  );

  // A chain that changes direction mid-walk: C informs B, and A depends_on B.
  // Changing C reaches B along the edge, then A against it.
  test("mixes both directions in one transitive walk", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
      record("fact.c", [{ target: "fact.b", rel: "informs" }]),
    ];

    const result = impact("fact.c", bundle);
    expect(ids(result)).toEqual(["fact.b", "fact.a"]);
    expect(result.impacted.map((entry) => entry.depth)).toEqual([1, 2]);
  });

  test("ignores related_to, which claims no dependence", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "related_to" }]),
      record("fact.c", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b"),
    ];

    expect(ids(impact("fact.b", bundle))).toEqual(["fact.c"]);
  });

  // Silently returning nothing for a rel the walk cannot follow is the one
  // answer a caller must never get from a typo.
  test("refuses a rels option the walk cannot follow", () => {
    const bundle = [record("fact.a")];

    expect(() => impact("fact.a", bundle, { rels: ["causes"] })).toThrow(
      KbUnknownLinkRelError,
    );
    // A real rel, but an inert one — it could only ever return an empty set.
    expect(() => impact("fact.a", bundle, { rels: ["related_to"] })).toThrow(
      KbUnknownLinkRelError,
    );
  });

  test("narrows to the rels asked for", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.c", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.c", rel: "satisfies" }]),
      record("fact.c"),
    ];

    expect(ids(impact("fact.c", bundle, { rels: ["depends_on"] }))).toEqual([
      "fact.a",
    ]);
  });

  // An unknown rel is untraversable everywhere. Unlike a bad `rels` option,
  // this one is stored data — it is reported by kb_validate, not thrown here.
  test("never traverses an unknown rel stored on a record", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "causes" }]),
      record("fact.b"),
    ];

    expect(ids(impact("fact.b", bundle))).toEqual([]);
    expect(ids(impact("fact.a", bundle))).toEqual([]);
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
      record("fact.behind", [{ target: "fact.no", rel: "depends_on" }]),
      record("fact.no", [{ target: "fact.c", rel: "depends_on" }], "rejected"),
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

    const result = impact("fact.b", bundle);
    expect(ids(result)).toEqual(["fact.a"]);
    // Reached both ways: A depends on B, and B constrains A.
    expect(result.impacted[0]?.via).toEqual([
      { source: "fact.a", target: "fact.b", rel: "depends_on" },
      { source: "fact.b", target: "fact.a", rel: "constrains" },
    ]);
    expect(result.impacted[0]?.depth).toBe(1);
  });

  // A cut walk must say it was cut: otherwise it reads as a complete blast
  // radius that happened to be small.
  test("reports truncation and what it left unexpanded", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "depends_on" }]),
      record("fact.b", [{ target: "fact.c", rel: "depends_on" }]),
      record("fact.c"),
    ];

    const cut = impact("fact.c", bundle, { depth: 1 });
    expect(ids(cut)).toEqual(["fact.b"]);
    expect(cut.truncated).toBe(true);
    expect(cut.unexpanded).toEqual(["fact.b"]);

    // A cap the walk never reaches is not a truncation.
    const whole = impact("fact.c", bundle, { depth: 5 });
    expect(whole.truncated).toBe(false);
    expect(whole.unexpanded).toEqual([]);
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

  // An unknown rel is not a claim any walk can interpret, so no walk follows
  // it anywhere — the edge inventory is where that is enforced once.
  test("an unknown rel is never traversed", () => {
    const bundle = [
      record("fact.a", [{ target: "fact.b", rel: "causes" }]),
      record("fact.b"),
    ];

    expect(edgeNeighbours(bundle[0] as KbRecord, bundle, "typed-link")).toEqual(
      [],
    );
    expect(pack(bundle, "fact.a").records.map((r) => r.conceptId)).toEqual([
      "fact.a",
    ]);
    expect(
      trace("fact.a", bundle).map((step) => step.record.conceptId),
    ).toEqual(["fact.a"]);
  });

  test("honours a narrowed rel list", () => {
    const bundle = [
      record("fact.a", [
        { target: "fact.b", rel: "depends_on" },
        { target: "fact.c", rel: "related_to" },
      ]),
      record("fact.b"),
      record("fact.c"),
    ];

    expect(
      edgeNeighbours(bundle[0] as KbRecord, bundle, "typed-link", [
        "depends_on",
      ]).map((r) => r.conceptId),
    ).toEqual(["fact.b"]);
  });

  // pack walks every edge kind, so a declared dependency is in the
  // neighbourhood even when the body never mentions it — and a neighbourhood
  // is the one place a bibliography belongs, so related_to counts here.
  test("pack reaches records named only in frontmatter, related_to included", () => {
    const bundle = [
      record("fact.a", [
        { target: "fact.b", rel: "depends_on" },
        { target: "fact.c", rel: "related_to" },
      ]),
      record("fact.b"),
      record("fact.c"),
    ];

    expect(
      pack(bundle, "fact.a")
        .records.map((r) => r.conceptId)
        .sort(),
    ).toEqual(["fact.a", "fact.b", "fact.c"]);
  });

  // A trace is a history, and related_to reaches whatever a writer thought
  // worth mentioning — the same flooding body-link is excluded for.
  test("trace follows causal typed links but not related_to", () => {
    const bundle = [
      record("fact.a", [
        { target: "fact.b", rel: "depends_on" },
        { target: "fact.c", rel: "related_to" },
      ]),
      record("fact.b"),
      record("fact.c"),
    ];

    const reached = trace("fact.a", bundle).map(
      (step) => step.record.conceptId,
    );
    expect(reached.sort()).toEqual(["fact.a", "fact.b"]);
    expect(
      trace("fact.a", bundle).find((step) => step.record.conceptId === "fact.b")
        ?.via,
    ).toEqual(["typed-link"]);
  });
});
