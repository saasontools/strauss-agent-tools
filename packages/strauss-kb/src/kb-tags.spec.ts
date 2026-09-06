import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { KB_COMMANDS_BY_NAME } from "./commands/index.js";
import { composeRecord } from "./compose.js";
import { buildContext } from "./kb-context.js";
import { KbMissingFlagValueError } from "./kb-errors.js";
import { PINS_FILE, pinBase } from "./kb-pins/index.js";
import { KbStore } from "./kb-store.js";

const at = "2026-09-01T00:00:00Z";
const noStdin = () => Promise.resolve("");

describe("tag filter", () => {
  const store = new KbStore();
  let workspace: string;
  let bundle: string;

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), "strauss-kb-tags-"));
    bundle = join(workspace, "docs", "kb");
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "extract-parser",
          title: "Extract the parser",
          why: "The reviewer asked for it.",
          tags: ["review", "review:extract"],
        },
        "seed",
        at,
      ),
    );
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "move-config",
          title: "Move the config",
          why: "It belongs with its consumer.",
          tags: ["review"],
        },
        "seed",
        at,
      ),
    );
    // No tags at all — the case a filter must drop rather than throw over.
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "region-key",
          title: "The cache key carries the region",
          why: "Two regions collided on one key.",
        },
        "seed",
        at,
      ),
    );
  });

  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  test("list ANDs the tags, and an unknown tag matches nothing", async () => {
    expect((await store.list(bundle)).length).toBe(3);

    const tagged = await store.list(bundle, undefined, { tags: ["review"] });
    expect(tagged.map((record) => record.conceptId).sort()).toEqual([
      "decision.extract-parser",
      "decision.move-config",
    ]);

    // AND: only the record carrying both survives.
    const both = await store.list(bundle, undefined, {
      tags: ["review", "review:extract"],
    });
    expect(both.map((record) => record.conceptId)).toEqual([
      "decision.extract-parser",
    ]);

    expect(
      await store.list(bundle, undefined, { tags: ["review:security"] }),
    ).toEqual([]);
  });

  test("query and catalog filter without moving standing", async () => {
    await store.supersede(
      bundle,
      "decision.move-config",
      "decision.extract-parser",
    );

    const hits = await store.query(bundle, "", {
      includeNonCurrent: true,
      tags: ["review"],
    });
    expect(
      hits.map((hit) => [hit.record.conceptId, hit.standing]).sort(),
    ).toEqual([
      ["decision.extract-parser", "current"],
      ["decision.move-config", "superseded"],
    ]);

    // The superseded record still names its replacement, and the untagged
    // fact is gone from the counts.
    const result = await store.catalog(bundle, { tags: ["review"] });
    expect(result.recordCount).toBe(2);
    expect(result.standings).toMatchObject({ current: 1, superseded: 1 });
    expect(
      result.entries.find((entry) => entry.conceptId === "decision.move-config")
        ?.supersededBy,
    ).toEqual(["decision.extract-parser"]);
  });

  // The drop rule is "superseded, and the replacement is here too". Computed
  // over the unfiltered set it fired on a replacement the filter had cut, so a
  // tagged record vanished from a query for its own tag.
  test("a tagged superseded record survives its replacement being filtered out", async () => {
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "rewrite-loader",
          title: "Rewrite the loader",
          why: "The extraction went further than the move.",
        },
        "seed",
        at,
      ),
    );
    await store.supersede(
      bundle,
      "decision.move-config",
      "decision.rewrite-loader",
    );

    const hits = await store.query(bundle, "", { tags: ["review"] });
    const moved = hits.find(
      (hit) => hit.record.conceptId === "decision.move-config",
    );
    expect(moved?.standing).toBe("superseded");
    expect(moved?.heads.map((head) => head.conceptId)).toEqual([
      "decision.rewrite-loader",
    ]);
  });

  test("list and catalog narrow by type and tags together", async () => {
    const ctx = { store, actor: "test", now: () => at };

    const list = KB_COMMANDS_BY_NAME.get("list")!;
    const listed = (await list.run(
      ctx,
      list.input.parse(
        list.fromArgv(
          ["list", "decision", "--tag=review:extract"],
          bundle,
          noStdin,
        ),
      ),
    )) as { conceptId: string }[];
    expect(listed.map((record) => record.conceptId)).toEqual([
      "decision.extract-parser",
    ]);

    // The tag exists, the type does not carry it: both have to bind.
    const catalog = KB_COMMANDS_BY_NAME.get("catalog")!;
    const rendered = (await catalog.run(
      ctx,
      catalog.input.parse(
        catalog.fromArgv(
          ["catalog", "fact", "--tag", "review"],
          bundle,
          noStdin,
        ),
      ),
    )) as string;
    expect(rendered).toContain("(no records matching fact · tags: review)");
  });

  // A tag joined to the type by the same separator was indistinguishable from
  // one, so an empty result named a filter the reader could not read back.
  test("the catalog heading tells the type from the tags", async () => {
    const catalog = KB_COMMANDS_BY_NAME.get("catalog")!;
    const rendered = (await catalog.run(
      { store, actor: "test", now: () => at },
      catalog.input.parse(
        catalog.fromArgv(
          ["catalog", "decision", "--tag", "review", "--tag=review:extract"],
          bundle,
          noStdin,
        ),
      ),
    )) as string;
    expect(rendered).toContain(
      "# KB Catalog — decision · tags: review, review:extract",
    );
    expect(rendered).toContain("decision.extract-parser");
  });

  test("the positional type survives a leading --tag, in either order", () => {
    for (const name of ["list", "catalog"] as const) {
      const command = KB_COMMANDS_BY_NAME.get(name)!;
      for (const argv of [
        [name, "--tag", "review", "decision"],
        [name, "--tag=review", "decision"],
        [name, "decision", "--tag", "review"],
      ]) {
        expect(
          command.input.parse(command.fromArgv(argv, "/b", noStdin)),
          argv.join(" "),
        ).toMatchObject({ type: "decision", tags: ["review"] });
      }
    }
  });

  test("--tag with no value is an error, not an absent flag", () => {
    for (const name of ["list", "catalog", "query"] as const) {
      const command = KB_COMMANDS_BY_NAME.get(name)!;
      for (const argv of [
        [name, "--tag"],
        [name, "--tag="],
      ]) {
        expect(
          () => command.fromArgv(argv, "/b", noStdin),
          argv.join(" "),
        ).toThrow(KbMissingFlagValueError);
      }
    }
  });

  test("list, query and catalog take --tag repeatably", () => {
    for (const [name, argv] of [
      ["list", ["list", "--tag", "review", "--tag=review:extract"]],
      ["catalog", ["catalog", "--tag", "review", "--tag=review:extract"]],
      ["query", ["query", "parser", "--tag", "review", "--tag=review:extract"]],
    ] as const) {
      const command = KB_COMMANDS_BY_NAME.get(name);
      expect(command, name).toBeDefined();
      expect(
        command?.fromArgv(argv as unknown as string[], "/bundle", noStdin),
        name,
      ).toMatchObject({ tags: ["review", "review:extract"] });
    }
  });

  test("--tag never falls into a positional type or the query text", () => {
    // `list --tag review` used to hand "--tag" to the type enum and fail.
    const list = KB_COMMANDS_BY_NAME.get("list");
    const parsed = list?.input.parse(
      list.fromArgv(["list", "--tag", "review"], "/b", noStdin),
    );
    expect(parsed).toMatchObject({ tags: ["review"] });
    expect(parsed).not.toHaveProperty("type");

    const query = KB_COMMANDS_BY_NAME.get("query");
    expect(
      query?.fromArgv(
        ["query", "cache", "--tag", "review", "key"],
        "/b",
        noStdin,
      ),
    ).toMatchObject({ text: "cache key", tags: ["review"] });
  });

  test("context excludes tagged records from index and full pins", async () => {
    await pinBase(store, workspace, bundle, at, { mode: "full" });

    const withReview = await buildContext(store, workspace, {
      budgetTokens: 50_000,
    });
    expect(withReview.block).toContain("Extract the parser");

    const excluded = await buildContext(store, workspace, {
      budgetTokens: 50_000,
      excludeTags: ["review"],
    });
    expect(excluded.block).not.toContain("Extract the parser");
    expect(excluded.block).toContain("The cache key carries the region");

    // Index mode excludes the same records the full mode does.
    const asIndex = await buildContext(store, workspace, {
      budgetTokens: 50_000,
      fullUnderTokens: 0,
      excludeTags: ["review"],
    });
    expect(asIndex.block).not.toContain("Move the config");
  });

  test("the profile's excludeTags come from the manifest, flags over them", async () => {
    await pinBase(store, workspace, bundle, at);
    const file = join(workspace, PINS_FILE);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      file,
      JSON.stringify({
        ...manifest,
        context: { "session-start": { excludeTags: ["review", 7] } },
      }),
    );

    const scoped = await buildContext(store, workspace, {
      profile: "session-start",
    });
    expect(scoped.block).not.toContain("Extract the parser");

    // A profile the manifest says nothing about is unaffected.
    const other = await buildContext(store, workspace, { profile: "compact" });
    expect(other.block).toContain("Extract the parser");

    // Explicit options win, as they do for the budgets.
    const explicit = await buildContext(store, workspace, {
      profile: "session-start",
      excludeTags: [],
    });
    expect(explicit.block).toContain("Extract the parser");
  });

  test("a profile's empty excludeTags lifts the manifest default's", async () => {
    await pinBase(store, workspace, bundle, at);
    const file = join(workspace, PINS_FILE);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      file,
      JSON.stringify({
        ...manifest,
        context: {
          default: { excludeTags: ["review"] },
          "session-start": { excludeTags: [] },
        },
      }),
    );

    const lifted = await buildContext(store, workspace, {
      profile: "session-start",
    });
    expect(lifted.block).toContain("Extract the parser");

    // Every other profile still takes the default's exclusion.
    const inherited = await buildContext(store, workspace, {
      profile: "compact",
    });
    expect(inherited.block).not.toContain("Extract the parser");
  });
});
