import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "./compose.js";
import { KbStore } from "./kb-store.js";
import {
  loadQmd,
  resolveHits,
  searchBase,
  type QmdModule,
  type SearchHit,
} from "./search-index.js";

const hit = (displayPath: string): SearchHit => ({ displayPath, score: 1 });

/**
 * qmd reports its own normalised paths, so mapping back is the only place a
 * search result can silently become the wrong record.
 */
describe("resolveHits", () => {
  const records = [
    { conceptId: "decision.cursor-keyset" },
    { conceptId: "fact.auth-retries" },
  ];

  // The dot in a concept id survives as a dash, which is why the mapping runs
  // forwards from ids we hold rather than trying to parse qmd's filename.
  test("maps a normalised filename back to its record", () => {
    expect(resolveHits([hit("kb/decision-cursor-keyset.md")], records)).toEqual(
      [{ conceptId: "decision.cursor-keyset" }],
    );
  });

  test("preserves the order qmd ranked them in", () => {
    expect(
      resolveHits(
        [hit("kb/fact-auth-retries.md"), hit("kb/decision-cursor-keyset.md")],
        records,
      ).map((record) => record.conceptId),
    ).toEqual(["fact.auth-retries", "decision.cursor-keyset"]);
  });

  test("ignores a hit naming nothing in the base", () => {
    expect(resolveHits([hit("kb/decision-gone.md")], records)).toEqual([]);
  });

  // `decision.a-b` and `decision-a.b` both flatten to `decision-a-b`. Returning
  // either would be a guess presented as a search result.
  test("drops an ambiguous name rather than guessing between two records", () => {
    const ambiguous = [
      { conceptId: "decision.a-b" },
      { conceptId: "decision-a.b" },
    ];

    expect(resolveHits([hit("kb/decision-a-b.md")], ambiguous)).toEqual([]);
  });

  test("tolerates a path with no directory and no extension", () => {
    expect(resolveHits([hit("decision-cursor-keyset")], records)).toEqual([
      { conceptId: "decision.cursor-keyset" },
    ]);
  });
});

/**
 * The backend is an optional peer dependency, so "installed" and "absent" are
 * both normal states and both are covered here. The absent branch is the one
 * this suite runs in by default — nothing installs qmd to test it — so the
 * present branch is driven through the injected module instead.
 */
describe("searchBase", () => {
  let bundle: string;

  beforeEach(() => {
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-search-"));
  });
  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  function fakeQmd(
    hits: { displayPath?: string; filepath?: string; score?: number }[],
    calls: string[] = [],
  ): QmdModule {
    return {
      createStore: () =>
        Promise.resolve({
          searchLex: (query: string) => {
            calls.push(`search:${query}`);
            return Promise.resolve(hits);
          },
          update: () => {
            calls.push("update");
            return Promise.resolve(undefined);
          },
          close: () => {
            calls.push("close");
            return Promise.resolve();
          },
        }),
    };
  }

  test("returns null when the backend is not installed", async () => {
    const warnings: Record<string, unknown>[] = [];

    const result = await searchBase(bundle, "anything", {
      logger: { warn: (entry) => warnings.push(entry) },
    });

    expect(result).toBeNull();
    expect(warnings).toContainEqual({
      operation: "kb.search",
      outcome: "qmd-unavailable",
    });
  });

  test("loadQmd resolves to null rather than throwing", async () => {
    await expect(loadQmd()).resolves.toBeNull();
  });

  test("indexes, ranks, and closes the store when a backend is present", async () => {
    const calls: string[] = [];
    const qmd = fakeQmd(
      [{ displayPath: "kb/fact-a.md", score: 2 }, { filepath: "kb/fact-b.md" }],
      calls,
    );

    const result = await searchBase(bundle, "cache", { qmd });

    // The index does not exist yet, so it is built before the query runs.
    expect(calls).toEqual(["update", "search:cache", "close"]);
    expect(result).toEqual([
      { displayPath: "kb/fact-a.md", score: 2 },
      // `filepath` stands in when qmd reports no display path, and a missing
      // score is zero rather than undefined.
      { displayPath: "kb/fact-b.md", score: 0 },
    ]);
  });

  test("drops a hit that names no path at all", async () => {
    const result = await searchBase(bundle, "cache", {
      qmd: fakeQmd([{ score: 1 }]),
    });

    expect(result).toEqual([]);
  });

  // A search index is an optimisation; losing it must degrade recall, never the
  // answer. So a backend that throws is reported and swallowed.
  test("reports a failing backend as unavailable instead of throwing", async () => {
    const warnings: Record<string, unknown>[] = [];

    const result = await searchBase(bundle, "cache", {
      logger: { warn: (entry) => warnings.push(entry) },
      qmd: { createStore: () => Promise.reject(new Error("no sqlite")) },
    });

    expect(result).toBeNull();
    expect(warnings).toContainEqual({
      operation: "kb.search",
      outcome: "unavailable",
      error: "no sqlite",
    });
  });
});

describe("KbStore.query without a search backend", () => {
  let bundle: string;

  beforeEach(() => {
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-fallback-"));
  });
  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  // The graceful-degradation path end to end: qmd is not installed here, so
  // this is the substring scan answering, and it must answer rather than fail.
  test("falls back to a substring scan and still returns the record", async () => {
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "cache-key-includes-region",
          title: "The cache key includes the region",
          why: "A region-less key serves one region another region's data.",
          sections: { Claim: "Every key is prefixed with the region." },
        },
        "test-writer",
        "2026-08-02T09:14:00Z",
      ),
    );

    const hits = await store.query(bundle, "prefixed with the region");

    expect(hits.map((entry) => entry.record.conceptId)).toEqual([
      "fact.cache-key-includes-region",
    ]);
  });

  test("a query matching nothing returns nothing rather than failing", async () => {
    const store = new KbStore();
    expect(await store.query(bundle, "nothing here")).toEqual([]);
  });
});
