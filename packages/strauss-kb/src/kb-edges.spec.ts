/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import { composeRecord, type ComposeInput } from "./compose.js";
import { edgeNeighbours, neighbours } from "./kb-edges.js";
import type { KbRecord, KbRecordStatus } from "./kb-record.schema.js";
import { KbStore } from "./kb-store.js";

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

function record(
  conceptId: string,
  frontmatter: Partial<KbRecord["frontmatter"]> = {},
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      strauss_status: "accepted" as KbRecordStatus,
      ...frontmatter,
    } as KbRecord["frontmatter"],
    body: "Body.",
  };
}

async function byId(
  store: KbStore,
  bundle: string,
): Promise<{ records: KbRecord[]; get: (id: string) => KbRecord }> {
  const records = await store.list(bundle);
  const map = new Map(records.map((r) => [r.conceptId, r]));
  return {
    records,
    get: (id) => {
      const found = map.get(id);
      if (!found) throw new Error(`missing fixture record ${id}`);
      return found;
    },
  };
}

describe("edgeNeighbours", () => {
  test("body-link reaches the target of a markdown link in the body", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("linker", {
        sections: {
          Claim: "See [fact.target](fact.target.md) for the measurement.",
        },
      }),
    );
    await store.write(bundle, fact("target"));

    const { records, get } = await byId(store, bundle);
    expect(
      edgeNeighbours(get("fact.linker"), records, "body-link").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.target"]);
  });

  // compose.ts renders relatedConceptIds as `Relates to [id](id.md).` — a
  // related edge in stored form IS a body link, so this is the path a record
  // written with relatedConceptIds takes to its neighbours.
  test("reaches a record named through composeRecord relatedConceptIds", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("curious", { relatedConceptIds: ["fact.target"] }),
    );
    await store.write(bundle, fact("target"));

    const { records, get } = await byId(store, bundle);
    const curious = get("fact.curious");
    expect(curious.body).toContain("[fact.target](fact.target.md)");
    expect(
      edgeNeighbours(curious, records, "body-link").map((r) => r.conceptId),
    ).toEqual(["fact.target"]);
  });

  // Broken links are legal per compose.ts: records are routinely written
  // before the ones they point at exist.
  test("skips a body link whose target is not in the bundle", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("linker", {
        sections: { Claim: "See [fact.gone](fact.gone.md), written later." },
      }),
    );

    const { records, get } = await byId(store, bundle);
    expect(edgeNeighbours(get("fact.linker"), records, "body-link")).toEqual(
      [],
    );
  });

  test("supersession connects both directions of a store-written pair", async ({
    store,
    bundle,
  }) => {
    await store.write(bundle, fact("old"));
    await store.write(bundle, fact("new", { supersedes: ["fact.old"] }));

    const { records, get } = await byId(store, bundle);
    expect(
      edgeNeighbours(get("fact.new"), records, "supersession").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.old"]);
    expect(
      edgeNeighbours(get("fact.old"), records, "supersession").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.new"]);
  });

  // A hand-edit can leave one pointer behind; either side alone must still
  // connect the pair, from both ends.
  test("supersession holds through a single one-sided pointer", () => {
    const old = record("fact.old");
    const current = record("fact.new", {
      strauss_supersedes: ["fact.old"],
    });

    expect(
      edgeNeighbours(old, [old, current], "supersession").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.new"]);
    expect(
      edgeNeighbours(current, [old, current], "supersession").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.old"]);
  });

  test("anchor connects a file-level record but not another symbol", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("seed", { anchors: [{ file: "src/a.ts", symbol: "X" }] }),
    );
    await store.write(
      bundle,
      fact("file-level", { anchors: [{ file: "src/a.ts" }] }),
    );
    await store.write(
      bundle,
      fact("other-symbol", { anchors: [{ file: "src/a.ts", symbol: "Y" }] }),
    );
    await store.write(
      bundle,
      fact("other-file", { anchors: [{ file: "src/b.ts", symbol: "X" }] }),
    );

    const { records, get } = await byId(store, bundle);
    expect(
      edgeNeighbours(get("fact.seed"), records, "anchor").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.file-level"]);
  });

  test("source connects records citing the same source id", async ({
    store,
    bundle,
  }) => {
    const source = { id: "pr-12", resource: "https://example.test/pr/12" };
    await store.write(bundle, fact("cited", { sources: [source] }));
    await store.write(bundle, fact("citing", { sources: [source] }));
    await store.write(
      bundle,
      fact("elsewhere", {
        sources: [{ id: "pr-13", resource: "https://example.test/pr/13" }],
      }),
    );

    const { records, get } = await byId(store, bundle);
    expect(
      edgeNeighbours(get("fact.cited"), records, "source").map(
        (r) => r.conceptId,
      ),
    ).toEqual(["fact.citing"]);
  });
});

describe("neighbours", () => {
  test("carries every edge kind that connects a pair, not just the first", async ({
    store,
    bundle,
  }) => {
    await store.write(
      bundle,
      fact("old", { anchors: [{ file: "src/a.ts" }] }),
    );
    await store.write(
      bundle,
      fact("new", {
        supersedes: ["fact.old"],
        anchors: [{ file: "src/a.ts" }],
      }),
    );

    const { records, get } = await byId(store, bundle);
    const [neighbour] = neighbours(get("fact.new"), records);

    expect(neighbour?.record.conceptId).toBe("fact.old");
    expect(neighbour?.via.sort()).toEqual(["anchor", "supersession"]);
  });

  test("honours a narrowed kind list", async ({ store, bundle }) => {
    await store.write(
      bundle,
      fact("old", { anchors: [{ file: "src/a.ts" }] }),
    );
    await store.write(bundle, fact("new", { supersedes: ["fact.old"] }));

    const { records, get } = await byId(store, bundle);
    expect(neighbours(get("fact.new"), records, ["anchor"])).toEqual([]);
  });
});
