import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { composeRecord, type ComposeLink } from "../compose.js";
import { INDEX_FILE } from "../kb-index.js";
import { LOG_FILE, parseLog } from "../kb-log.js";
import { KbBaseFrozenError, pinBase } from "../kb-pins/index.js";
import type { KbRecordStatus } from "../kb-record.schema.js";
import { KbStore } from "../kb-store.js";
import { SEARCH_INDEX_FILE } from "../search-index.js";
import { validateBundle } from "../validate.js";
import { sweepCommand, type KbSweepResult } from "./sweep.js";

const AT = "2026-08-01T00:00:00Z";
const TAG = "review";

describe("sweepCommand", () => {
  let store: KbStore;
  let bundle: string;

  beforeEach(() => {
    store = new KbStore();
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-sweep-"));
  });

  afterEach(() => rmSync(bundle, { recursive: true, force: true }));

  const seed = async (
    slug: string,
    status: KbRecordStatus,
    options: { tags?: string[]; links?: ComposeLink[] } = {},
  ) => {
    const written = await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug,
          title: `Fact ${slug}`,
          why: "Something observed.",
          tags: options.tags ?? [TAG],
          ...(options.links ? { links: options.links } : {}),
        },
        "agent:writer",
        AT,
      ),
    );
    await store.setStatus(bundle, written.conceptId, status, "agent:writer");
    return written.conceptId;
  };

  const run = (input: Record<string, unknown> = {}) =>
    sweepCommand.run(
      { store, actor: "agent:sweeper", now: () => AT },
      sweepCommand.input.parse({
        bundlePath: bundle,
        tag: TAG,
        terminal: true,
        ...input,
      }),
    ) as Promise<KbSweepResult>;

  /** A sweep that left a pointer dangling is a sweep that broke the base. */
  const expectValid = async () =>
    expect(validateBundle(await store.list(bundle))).toEqual([]);

  /** Every file in the base, by content hash — for asserting nothing moved. */
  const digestBase = () =>
    Object.fromEntries(
      readdirSync(bundle)
        .sort()
        .map((name) => [
          name,
          createHash("sha256")
            .update(readFileSync(join(bundle, name)))
            .digest("hex"),
        ]),
    );

  /** Runs `body` in a workspace that has pinned this base `--frozen`. */
  const onFrozenBase = async (body: () => Promise<void>) => {
    const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-sweep-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      await pinBase(store, workspace, bundle, AT, {
        layer: "local",
        frozen: true,
      });
      await body();
    } finally {
      cwd.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  };

  test("deletes only records that carry the tag and are in a terminal status", async () => {
    await seed("resolved-one", "resolved");
    await seed("rejected-one", "rejected");
    await seed("superseded-one", "superseded");
    await seed("still-open", "open");
    await seed("untagged", "resolved", { tags: ["other"] });

    const result = await run();

    expect(result.deleted).toEqual([
      "fact.rejected-one",
      "fact.resolved-one",
      "fact.superseded-one",
    ]);
    expect(result.failed).toEqual([]);
    expect(existsSync(join(bundle, "fact.still-open.md"))).toBe(true);
    expect(existsSync(join(bundle, "fact.untagged.md"))).toBe(true);
    await expectValid();
  });

  // The one destructive verb in the package: a caller who does not name a
  // scope gets a refusal, never a whole base.
  test("refuses without --tag or --terminal", () => {
    expect(() =>
      sweepCommand.input.parse({ bundlePath: bundle, terminal: true }),
    ).toThrow(/--tag/);
    expect(() =>
      sweepCommand.input.parse({ bundlePath: bundle, tag: TAG }),
    ).toThrow(/--terminal/);
    expect(
      sweepCommand.fromArgv(["sweep", "--terminal"], bundle, () =>
        Promise.resolve(""),
      ),
    ).toMatchObject({ tag: undefined });
  });

  test("--dry-run reports what would go and leaves the base byte-identical", async () => {
    const id = await seed("resolved-one", "resolved");
    const before = digestBase();

    const result = await run({ dryRun: true });

    expect(result).toMatchObject({ dryRun: true, deleted: [], failed: [] });
    expect(result.candidates).toEqual([id]);
    expect(digestBase()).toEqual(before);
  });

  // A typed link from a record that stays is the graph still leaning on this
  // one; deleting it would leave the survivor pointing at nothing.
  test("keeps a record a surviving record links to, and reports who holds it", async () => {
    const held = await seed("held", "resolved");
    await seed("live-dependant", "open", {
      tags: ["other"],
      links: [{ target: held, rel: "depends_on" }],
    });
    const free = await seed("free", "resolved");

    const result = await run();

    expect(result.deleted).toEqual([free]);
    expect(result.skipped).toEqual([
      { conceptId: held, heldBy: ["fact.live-dependant"] },
    ]);
    expect(existsSync(join(bundle, `${held}.md`))).toBe(true);
    await expectValid();
  });

  // A supersession pointer is not a typed link, and it dangles the same way:
  // the survivor's `strauss_supersedes` would name a record that is gone.
  test("keeps a superseded record whose replacement survives", async () => {
    const old = await seed("old", "accepted");
    const replacement = await seed("replacement", "accepted", {
      tags: ["other"],
    });
    await store.supersede(bundle, old, replacement, "agent:writer");

    const result = await run();

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([{ conceptId: old, heldBy: [replacement] }]);
    expect(existsSync(join(bundle, `${old}.md`))).toBe(true);
    await expectValid();
  });

  test("deletes both ends of a supersession when both are tagged and settled", async () => {
    const old = await seed("old", "accepted");
    const replacement = await seed("replacement", "accepted");
    await store.supersede(bundle, old, replacement, "agent:writer");
    await store.setStatus(bundle, replacement, "resolved", "agent:writer");

    const result = await run();

    expect(result.deleted).toEqual([old, replacement]);
    expect(result.skipped).toEqual([]);
    await expectValid();
  });

  // A holder that is itself swept is not a survivor — but a holder kept back
  // by something else is, so the decision has to settle rather than run once.
  test("a link from a record the sweep itself removes does not keep its target", async () => {
    const target = await seed("target", "resolved");
    await seed("holder", "resolved", {
      links: [{ target, rel: "depends_on" }],
    });

    const result = await run();

    expect(result.deleted).toEqual(["fact.holder", "fact.target"]);
    expect(result.skipped).toEqual([]);
    await expectValid();
  });

  test("logs one sweep entry per deletion and rebuilds the index", async () => {
    const id = await seed("resolved-one", "resolved");
    await seed("kept", "open", { tags: ["other"] });

    await run();

    const swept = parseLog(
      readFileSync(join(bundle, LOG_FILE), "utf8"),
    ).entries.filter((entry) => entry.operation === "sweep");
    expect(swept).toEqual([
      expect.objectContaining({ by: "agent:sweeper", conceptId: id }),
    ]);
    const index = readFileSync(join(bundle, INDEX_FILE), "utf8");
    expect(index).toContain("fact.kept.md");
    expect(index).not.toContain(`${id}.md`);
  });

  // A record removed under the sweep is one id's problem, not the run's: the
  // rest still go, the failure is named, and both projections are rebuilt.
  test("reports an id it could not remove and finishes the run", async () => {
    const vanishing = await seed("aaa-vanishing", "resolved");
    const doomed = await seed("zzz-doomed", "resolved");
    await seed("kept", "open", { tags: ["other"] });

    const real = KbStore.prototype.deleteRecord.bind(store);
    const spy = vi
      .spyOn(store, "deleteRecord")
      .mockImplementation(async (...args) => {
        rmSync(join(bundle, `${vanishing}.md`), { force: true });
        return real(...args);
      });

    try {
      const result = await run();

      expect(result.deleted).toEqual([doomed]);
      expect(result.failed).toMatchObject([{ conceptId: vanishing }]);
    } finally {
      spy.mockRestore();
    }

    const index = readFileSync(join(bundle, INDEX_FILE), "utf8");
    expect(index).toContain("fact.kept.md");
    expect(index).not.toContain(doomed);
    await expectValid();
  });

  // The search index re-indexes when a record is newer than it, which no
  // deletion makes true — so a real sweep drops it outright.
  test("drops the search index, and a swept record stops answering", async () => {
    const id = await seed("resolved-one", "resolved");
    await seed("kept", "open", { tags: ["other"] });
    writeFileSync(join(bundle, SEARCH_INDEX_FILE), "stale", "utf8");

    await run();

    expect(existsSync(join(bundle, SEARCH_INDEX_FILE))).toBe(false);
    const hits = await store.query(bundle, "resolved-one");
    expect(hits.map((hit) => hit.record.conceptId)).not.toContain(id);
  });

  test("refuses a real run on a frozen base", async () => {
    const id = await seed("resolved-one", "resolved");

    await onFrozenBase(async () => {
      await expect(run()).rejects.toThrow(KbBaseFrozenError);
    });

    expect(existsSync(join(bundle, `${id}.md`))).toBe(true);
  });

  // Frozen refuses the write, not the report: a concluded base is exactly
  // where a reader wants to see what a sweep would take.
  test("completes a dry run on a frozen base", async () => {
    const id = await seed("resolved-one", "resolved");

    await onFrozenBase(async () => {
      const before = digestBase();
      const result = await run({ dryRun: true });

      expect(result.candidates).toEqual([id]);
      expect(digestBase()).toEqual(before);
    });
  });
});
