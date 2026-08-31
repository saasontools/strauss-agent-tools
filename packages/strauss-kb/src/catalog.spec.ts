/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { catalog, renderCatalogLine } from "./catalog.js";
import { composeRecord } from "./compose.js";
import { KbStore } from "./kb-store.js";

interface Ctx {
  bundle: string;
  store: KbStore;
}

const test = baseTest.extend<Ctx>({
  bundle: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-catalog-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  store: async ({}, use) => {
    await use(new KbStore());
  },
});

const WRITTEN_BY = "test-writer";
const WRITTEN_AT = "2026-08-02T09:14:00Z";

/**
 * One of each interesting shape: a current fact, a stale fact, a rejected
 * decision, a question superseded by a decision, and a draft.
 */
async function seed(store: KbStore, bundle: string): Promise<void> {
  const write = (
    type: Parameters<typeof composeRecord>[0],
    input: Parameters<typeof composeRecord>[1],
  ) => store.write(bundle, composeRecord(type, input, WRITTEN_BY, WRITTEN_AT));

  await write("fact", {
    slug: "region-key",
    title: "The cache key includes the region",
    why: "A region-less key serves the wrong region's data.",
    sections: { Claim: "Every key is prefixed with the region." },
  });
  await write("fact", {
    slug: "abandoned-note",
    title: "A note nobody has confirmed lately",
    why: "It was true once.",
    sections: { Claim: "It was true once." },
    stale_after: "2020-01-01",
  });
  await write("decision", {
    slug: "cache-per-region",
    title: "A cache per region",
    why: "One more thing to provision, and it drifts.",
    sections: { Decision: "Not adopted." },
  });
  await write("decision", {
    slug: "retry-timeouts-only",
    title: "Retry timeouts only",
    why: "Retrying every failure repeats non-idempotent writes.",
    sections: { Decision: "Timeouts only." },
  });
  await write("open-question", {
    slug: "retry-scope",
    title: "Which failures should the client retry?",
    why: "Scope decides how much of the client needs a backoff.",
  });
  await store.setStatus(bundle, "decision.cache-per-region", "rejected");
  await store.supersede(
    bundle,
    "open-question.retry-scope",
    "decision.retry-timeouts-only",
    WRITTEN_BY,
  );
}

describe("catalog", () => {
  test("names every record with type, title, standing and staleness", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const result = await store.catalog(bundle);

    expect(result.recordCount).toBe(5);
    expect(result.currentCount).toBe(3);
    expect(result.supersededCount).toBe(1);
    expect(result.staleCount).toBe(1);
    // Every record accounted for exactly once.
    expect(result.standings).toEqual({
      current: 3,
      superseded: 1,
      rejected: 1,
      unsettled: 0,
      open: 0,
    });
    expect(Object.values(result.standings).reduce((sum, n) => sum + n, 0)).toBe(
      result.recordCount,
    );
    expect(result.entries).toContainEqual({
      conceptId: "fact.region-key",
      type: "fact",
      title: "The cache key includes the region",
      standing: "current",
      supersededBy: [],
      stale: false,
    });
    expect(
      result.entries.find((entry) => entry.conceptId === "fact.abandoned-note"),
    ).toMatchObject({ standing: "current", stale: true });
    expect(
      result.entries.find(
        (entry) => entry.conceptId === "decision.cache-per-region",
      ),
    ).toMatchObject({ standing: "rejected" });
  });

  // The listing is a menu, and a superseded title reads exactly like a live
  // one. Naming the replacement puts the line to follow instead in view.
  test("shows a superseded record with its replacement", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const entry = (await store.catalog(bundle)).entries.find(
      (candidate) => candidate.conceptId === "open-question.retry-scope",
    );

    expect(entry).toMatchObject({
      standing: "superseded",
      supersededBy: ["decision.retry-timeouts-only"],
    });
    expect(renderCatalogLine(entry!)).toContain(
      "superseded → decision.retry-timeouts-only",
    );
  });

  test("sorts by type, then title, then concept id", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    expect(
      (await store.catalog(bundle)).entries.map((entry) => entry.conceptId),
    ).toEqual([
      "decision.cache-per-region",
      "decision.retry-timeouts-only",
      "fact.abandoned-note",
      "fact.region-key",
      "open-question.retry-scope",
    ]);
  });

  // A filter must not turn a superseded record into a current-looking one:
  // the replacement may be of another type.
  test("narrows to a type but adjudicates against the whole base", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const result = await store.catalog(bundle, { type: "open-question" });

    expect(result.recordCount).toBe(1);
    expect(result.entries[0]).toMatchObject({
      conceptId: "open-question.retry-scope",
      standing: "superseded",
      supersededBy: ["decision.retry-timeouts-only"],
    });
  });

  test("carries no body, description or anchors — a line is the point", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const serialized = JSON.stringify(await store.catalog(bundle));

    expect(serialized).not.toContain("Every key is prefixed with the region.");
    expect(serialized).not.toContain("repeats non-idempotent writes");
  });

  test("an empty base catalogs as empty", async ({ store, bundle }) => {
    expect(await store.catalog(bundle)).toMatchObject({
      entries: [],
      recordCount: 0,
      pageCount: 0,
    });
  });

  // The catalog's whole claim to be a load-refusal predictor rests on this
  // number meaning exactly what the gate counts. Two accountings would drift.
  describe("pageCount predicts load's gate", () => {
    test("equals load's pageCount, superseded records excluded", async ({
      store,
      bundle,
    }) => {
      await seed(store, bundle);

      const listing = await store.catalog(bundle);
      const loaded = await store.load(bundle);

      expect(loaded.loaded).toBe(true);
      if (!loaded.loaded) return;
      expect(listing.pageCount).toBe(loaded.pageCount);
      expect(listing.pageCount).toBe(
        listing.recordCount - listing.supersededCount,
      );
    });

    test("agrees with load under a type filter too", async ({
      store,
      bundle,
    }) => {
      await seed(store, bundle);

      const listing = await store.catalog(bundle, { type: "decision" });
      const loaded = await store.load(bundle, { type: "decision" });

      expect(loaded.loaded).toBe(true);
      if (!loaded.loaded) return;
      expect(listing.pageCount).toBe(loaded.pageCount);
    });

    // The number is only useful if acting on it is right: a catalog reporting
    // one page over the gate must correspond to a load that actually refuses.
    test("a pageCount over the gate is exactly when load refuses", async ({
      store,
      bundle,
    }) => {
      await seed(store, bundle);
      const listing = await store.catalog(bundle);

      expect(
        (await store.load(bundle, { maxRecords: listing.pageCount })).loaded,
      ).toBe(true);
      expect(
        (await store.load(bundle, { maxRecords: listing.pageCount - 1 }))
          .loaded,
      ).toBe(false);
    });
  });

  // localeCompare without a locale reads the host's collation, so the same
  // base would sort differently on two machines and the determinism claim
  // would quietly stop holding.
  test("orders by code unit, not by host collation", async ({
    store,
    bundle,
  }) => {
    for (const { slug, title } of [
      { slug: "lower-apple", title: "apple" },
      { slug: "upper-apple", title: "Apple" },
      { slug: "upper-banana", title: "Banana" },
    ]) {
      await store.write(
        bundle,
        composeRecord(
          "fact",
          {
            slug,
            title,
            why: "Ordering only.",
            sections: { Claim: "Ordering only." },
          },
          WRITTEN_BY,
          WRITTEN_AT,
        ),
      );
    }

    const titles = (await store.catalog(bundle)).entries.map(
      (entry) => entry.title,
    );

    // Code-unit order puts every capital ahead of every lowercase. A locale
    // collation interleaves them — and picks a different order per host,
    // which is what the determinism claim cannot survive.
    expect(titles).toEqual(["Apple", "Banana", "apple"]);
  });

  test("staleness is measured against the clock it is given", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const before = catalog(await store.list(bundle), {
      now: new Date("2019-01-01T00:00:00Z"),
    });

    expect(before.staleCount).toBe(0);
  });

  test("an untitled record still gets a line", () => {
    expect(
      renderCatalogLine({
        conceptId: "fact.nameless",
        type: "fact",
        title: null,
        standing: "current",
        supersededBy: [],
        stale: false,
      }),
    ).toBe("- fact.nameless · fact · (untitled) · current");
  });

  // A record whose replacement is missing resolves to no head. Saying
  // "superseded" with nothing after it would be worse than saying so plainly.
  test("a superseded record with no surviving head says so", () => {
    expect(
      renderCatalogLine({
        conceptId: "fact.orphaned",
        type: "fact",
        title: "Orphaned",
        standing: "superseded",
        supersededBy: [],
        stale: false,
      }),
    ).toContain("superseded → (no surviving head)");
  });
});
