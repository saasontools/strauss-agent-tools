/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { composeRecord } from "./compose.js";
import {
  KbPackBudgetExceededError,
  KbRecordNotFoundError,
} from "./kb-errors.js";
import { KbStore } from "./kb-store.js";
import type { KbPackResult } from "./pack.js";

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
const PR_SOURCE = { id: "pr-12", resource: "https://example.test/pr/12" };

/**
 * One graph, every edge kind, three depths.
 *
 * Depth 1 from `decision.root`: `decision.old-way` (supersession),
 * `fact.related-note` (relatedConceptIds, stored as a body link),
 * `constraint.linked-limit` (hand-written body link), `fact.same-anchor`,
 * `fact.stale-note` and `decision.rejected-alt` (shared anchor),
 * `fact.same-source` and `open-question.pending` (shared source).
 * Depth 2: `fact.second-hop`, sharing only `src/notes.ts` with the note.
 * Depth 3: `fact.third-hop`, linked only from second-hop's body.
 */
async function seed(store: KbStore, bundle: string): Promise<void> {
  const write = (
    type: Parameters<typeof composeRecord>[0],
    input: Parameters<typeof composeRecord>[1],
  ) =>
    store.write(bundle, composeRecord(type, input, WRITTEN_BY, WRITTEN_AT));

  await write("decision", {
    slug: "old-way",
    title: "Old way",
    why: "The direction the root replaced.",
    sections: { Decision: "Charge synchronously." },
  });
  await write("fact", {
    slug: "related-note",
    title: "Related note",
    why: "Context the root cites.",
    sections: { Claim: "A cited note." },
    anchors: [{ file: "src/notes.ts" }],
  });
  await write("constraint", {
    slug: "linked-limit",
    title: "Linked limit",
    why: "A bound the root names in prose.",
    sections: { Claim: "At most one charge per order." },
  });
  await write("fact", {
    slug: "same-anchor",
    title: "Same anchor",
    why: "About the same file as the root.",
    sections: { Claim: "charge.ts retries twice." },
    anchors: [{ file: "src/pay/charge.ts" }],
  });
  await write("fact", {
    slug: "same-source",
    title: "Same source",
    why: "Drawn from the same PR as the root.",
    sections: { Claim: "PR 12 landed the retry." },
    sources: [PR_SOURCE],
  });
  await write("open-question", {
    slug: "pending",
    title: "Pending question",
    why: "Still unsettled.",
    sections: { Question: "What about refunds?" },
    sources: [PR_SOURCE],
  });
  await write("decision", {
    slug: "rejected-alt",
    title: "Rejected alternative",
    why: "The direction not taken.",
    sections: { Decision: "Queue every charge." },
    anchors: [{ file: "src/pay/charge.ts", symbol: "Charge.run" }],
  });
  await write("fact", {
    slug: "stale-note",
    title: "Stale note",
    why: "A quota the outside world moves.",
    sections: { Claim: "The quota is 100." },
    stale_after: "2020-01-01",
    anchors: [{ file: "src/pay/charge.ts" }],
  });
  await write("fact", {
    slug: "second-hop",
    title: "Second hop",
    why: "Reached only through the note.",
    sections: { Claim: "See [fact.third-hop](fact.third-hop.md)." },
    anchors: [{ file: "src/notes.ts" }],
  });
  await write("fact", {
    slug: "third-hop",
    title: "Third hop",
    why: "Past the default hop bound.",
    sections: { Claim: "Distant." },
  });
  await write("decision", {
    slug: "root",
    title: "Root decision",
    why: "The pack's seed.",
    sections: {
      Decision: "Charge asynchronously.",
      Impact: "Bounded by [constraint.linked-limit](constraint.linked-limit.md).",
    },
    anchors: [{ file: "src/pay/charge.ts", symbol: "Charge.run" }],
    sources: [PR_SOURCE],
    relatedConceptIds: ["fact.related-note"],
    supersedes: ["decision.old-way"],
  });
  await store.setStatus(bundle, "decision.rejected-alt", "rejected");
}

function packedIds(result: KbPackResult): string[] {
  return [
    ...result.records.map((r) => r.conceptId),
    ...result.superseded.map((s) => s.conceptId),
  ];
}

describe("pack", () => {
  test("reaches a neighbour through every edge kind", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root");

    const ids = packedIds(result);
    // relatedConceptIds and a hand-written body link — both body links in
    // stored form — plus supersession, shared anchor, and shared source.
    expect(ids).toContain("fact.related-note");
    expect(ids).toContain("constraint.linked-limit");
    expect(ids).toContain("decision.old-way");
    expect(ids).toContain("fact.same-anchor");
    expect(ids).toContain("fact.same-source");
    expect(result.recordCount).toBe(10);
    expect(result.excluded).toEqual(["fact.third-hop"]);
  });

  test("follows supersession backwards: packing the replaced record reaches its replacement", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.old-way");

    expect(result.root).toBe("decision.old-way");
    expect(result.records.map((r) => r.conceptId)).toContain("decision.root");
    // A superseded root is still a superseded record: named, not spelled out.
    expect(result.superseded.map((s) => s.conceptId)).toContain(
      "decision.old-way",
    );
  });

  test("stubs a superseded record in exactly the kb_load stub shape", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root");

    expect(result.records.map((r) => r.conceptId)).not.toContain(
      "decision.old-way",
    );
    expect(result.superseded).toEqual([
      {
        conceptId: "decision.old-way",
        title: "Old way",
        supersededBy: ["decision.root"],
        at: WRITTEN_AT,
      },
    ]);

    const loaded = await store.load(bundle);
    if (!loaded.loaded) throw new Error("fixture base exceeded load budget");
    expect(loaded.superseded).toContainEqual(result.superseded[0]);
  });

  test("returns rejected and open records whole, each flagged", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root");

    const rejected = result.records.find(
      (r) => r.conceptId === "decision.rejected-alt",
    );
    expect(rejected?.standing).toBe("rejected");
    expect(rejected?.warnings).toContainEqual({ kind: "rejected" });
    expect(rejected?.body).toContain("Queue every charge.");

    const open = result.records.find(
      (r) => r.conceptId === "open-question.pending",
    );
    expect(open?.standing).toBe("open");
    expect(open?.warnings).toContainEqual({ kind: "unresolved-question" });
    expect(open?.body).toContain("What about refunds?");
  });

  test("flags a record past its staleness deadline", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root");

    const stale = result.records.find(
      (r) => r.conceptId === "fact.stale-note",
    );
    expect(stale?.warnings).toContainEqual({
      kind: "stale",
      staleAfter: "2020-01-01",
    });
  });

  test("hops=1 keeps the first ring and lists deeper records by id", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root", { hops: 1 });

    const ids = packedIds(result);
    expect(ids).not.toContain("fact.second-hop");
    expect(ids).not.toContain("fact.third-hop");
    expect(result.excluded).toEqual(["fact.second-hop", "fact.third-hop"]);
  });

  test("cuts to maxNodes by rank and lists every cut id", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root", { maxNodes: 4 });

    // Depth first, then decisions and constraints before facts and questions.
    expect(result.records.map((r) => r.conceptId)).toEqual([
      "decision.root",
      "decision.rejected-alt",
      "constraint.linked-limit",
    ]);
    expect(result.superseded.map((s) => s.conceptId)).toEqual([
      "decision.old-way",
    ]);
    expect(result.excluded).toEqual([
      "fact.related-note",
      "fact.same-anchor",
      "fact.same-source",
      "fact.second-hop",
      "fact.stale-note",
      "fact.third-hop",
      "open-question.pending",
    ]);
  });

  test("fails closed over budget, carrying the count and every excluded id", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const error = await store
      .pack(bundle, "decision.root", { maxNodes: 4, budgetTokens: 10 })
      .then(
        () => null,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeInstanceOf(KbPackBudgetExceededError);
    const details = (error as KbPackBudgetExceededError).details;
    expect(details?.recordCount).toBe(4);
    expect(details?.budgetTokens).toBe(10);
    expect(typeof details?.approxTokens).toBe("number");
    expect(details?.approxTokens as number).toBeGreaterThan(10);
    expect(details?.excluded).toEqual([
      "fact.related-note",
      "fact.same-anchor",
      "fact.same-source",
      "fact.second-hop",
      "fact.stale-note",
      "fact.third-hop",
      "open-question.pending",
    ]);
  });

  test("is deterministic: two runs are deep-equal and byte-identical", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);

    const first = await store.pack(bundle, "decision.root");
    const second = await store.pack(bundle, "decision.root");

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("accounts tokens over what is emitted and stays within the default budget", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    const result = await store.pack(bundle, "decision.root");

    expect(result.tokensLoaded).toBeGreaterThan(0);
    expect(result.tokensLoaded).toBeLessThanOrEqual(result.budgetTokens);
    expect(result.budgetTokens).toBe(25_000);
  });

  test("refuses a root that is not in the bundle", async ({
    store,
    bundle,
  }) => {
    await seed(store, bundle);
    await expect(store.pack(bundle, "fact.absent")).rejects.toBeInstanceOf(
      KbRecordNotFoundError,
    );
  });
});
