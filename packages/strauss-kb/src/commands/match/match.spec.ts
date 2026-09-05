import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "../../compose.js";
import { KbStore } from "../../kb-store.js";
import type { KbAnchor } from "../../kb-record.schema.js";
import { matchCommand } from "./command.js";
import type { KbMatch } from "./model.js";

const AT = "2026-08-01T00:00:00Z";
const FILE = "src/order.service.ts";

/** `listOrders` spans lines 3–6, `cancel` lines 8–10. */
const SOURCE = [
  "export type Order = { id: string; amount: number };",
  "",
  "export function listOrders(after: string): Order[] {",
  "  void after;",
  "  return [];",
  "}",
  "",
  "export function cancel(id: string): void {",
  "  void id;",
  "}",
  "",
].join("\n");

const noStdin = () => Promise.resolve("");

describe("matchCommand", () => {
  let store: KbStore;
  let repo: string;
  let bundle: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

  beforeEach(() => {
    store = new KbStore();
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-match-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-match-bundle-"));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  function write(contents: string, file = FILE): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  const seed = (
    slug: string,
    anchors: KbAnchor[],
    extra: Record<string, unknown> = {},
  ) =>
    store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug,
          title: `Decision ${slug}`,
          why: "Offsets skip rows under concurrent writes.",
          anchors,
          ...extra,
        },
        "agent:writer",
        AT,
      ),
      "agent:writer",
    );

  const run = async (input: Record<string, unknown>) =>
    (await matchCommand.run(
      { store, actor: "agent:reader", now: () => AT },
      matchCommand.input.parse({
        bundlePath: bundle,
        repoRoot: repo,
        ...input,
      }),
    )) as KbMatch[];

  test("resolves symbol ranges itself, and reports symbol precision", async () => {
    write(SOURCE);
    await seed("cursor", [{ file: FILE, symbol: "listOrders" }]);

    const matches = await run({
      files: [
        {
          filePath: FILE,
          hunks: [
            { startLine: 5, endLine: 5 },
            { startLine: 9, endLine: 9 },
          ],
        },
      ],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.hunk).toEqual({ startLine: 5, endLine: 5 });
    expect(matches[0]?.precision).toBe("symbol");
    expect(matches[0]?.records[0]).toMatchObject({
      conceptId: "decision.cursor",
      type: "decision",
      title: "Decision cursor",
      standing: "current",
      status: "accepted",
      supersededBy: [],
      anchor: { file: FILE, symbol: "listOrders" },
    });
  });

  // A record absent because the file was not there is worse than one shown
  // imprecisely and labelled as such.
  test("an unreadable file degrades the hunk to file precision", async () => {
    await seed("cursor", [{ file: FILE, symbol: "listOrders" }]);

    const matches = await run({
      files: [{ filePath: FILE, hunks: [{ startLine: 99, endLine: 99 }] }],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.precision).toBe("file");
  });

  // `precision` describes what came back, so a hunk whose only kept record was
  // placed by a symbol is not `file` because a withheld one was.
  test("precision is recomputed over the records actually returned", async () => {
    write(SOURCE);
    await seed("scoped", [{ file: FILE, symbol: "listOrders" }]);
    await seed("whole-file", [{ file: FILE }]);
    await seed("replacement", [], { supersedes: ["decision.whole-file"] });
    const files = [{ filePath: FILE, hunks: [{ startLine: 5, endLine: 5 }] }];

    const current = await run({ files });
    expect(current[0]?.records.map((hit) => hit.conceptId)).toEqual([
      "decision.scoped",
    ]);
    expect(current[0]?.precision).toBe("symbol");

    const all = await run({ files, includeNonCurrent: true });
    expect(all[0]?.precision).toBe("file");
  });

  // An unknown field on a hunk is the caller's, and it comes back on the hunk
  // it was sent on.
  test("a field the hunk schema does not know is echoed", async () => {
    await seed("cursor", [{ file: FILE }]);

    const matches = await run({
      files: [
        {
          filePath: FILE,
          hunks: [{ startLine: 1, endLine: 2, hunkId: "h1" }],
        },
      ],
    });

    expect(matches[0]?.hunk).toMatchObject({ hunkId: "h1" });
  });

  // The two sides number different trees, so an anchor pinned to the base rev
  // is about the code that went away and nothing that replaced it.
  test("an old-side record lands on the old side and nowhere else", async () => {
    await seed("gone", [
      { file: FILE, side: "old", ref: "abc1234", span: { start: 1, end: 2 } },
    ]);
    const hunk = { startLine: 1, endLine: 2 };

    const onOld = await run({
      files: [{ filePath: FILE, hunks: [{ ...hunk, side: "old" }] }],
    });
    expect(onOld.map((match) => match.records[0]?.conceptId)).toEqual([
      "decision.gone",
    ]);
    expect(onOld[0]?.hunk).toMatchObject({ side: "old" });

    expect(await run({ files: [{ filePath: FILE, hunks: [hunk] }] })).toEqual(
      [],
    );
  });

  test("caller-supplied symbolRanges are used as given", async () => {
    await seed("cursor", [{ file: FILE, symbol: "listOrders" }]);

    const matches = await run({
      files: [{ filePath: FILE, hunks: [{ startLine: 200, endLine: 210 }] }],
      symbolRanges: [
        { file: FILE, symbol: "listOrders", startLine: 100, endLine: 140 },
      ],
    });

    expect(matches).toEqual([]);
  });

  test("carries the frontmatter a reader decides on, and no body", async () => {
    await seed("cursor", [{ file: FILE }], {
      materiality: "blocking",
      confidence: "medium",
      tags: ["paging"],
    });

    const matches = await run({
      files: [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 2 }] }],
    });

    expect(matches[0]?.records[0]).toMatchObject({
      type: "decision",
      status: "accepted",
      materiality: "blocking",
      confidence: "medium",
      tags: ["paging"],
      sources: [],
      verified: [],
      // Frontmatter, and the one line a reader decides on without opening it.
      description: "Offsets skip rows under concurrent writes.",
    });
    expect(matches[0]?.records[0]).not.toHaveProperty("body");
    // No section ever crosses over: bodies are what `kb_load` is for.
    expect(JSON.stringify(matches)).not.toContain("## ");
  });

  test("superseded records are withheld until asked for, then flagged", async () => {
    await seed("cursor-v1", [{ file: FILE }]);
    await seed("cursor-v2", [{ file: FILE }], {
      supersedes: ["decision.cursor-v1"],
    });
    const files = [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 2 }] }];

    const current = await run({ files });
    expect(current[0]?.records.map((hit) => hit.conceptId)).toEqual([
      "decision.cursor-v2",
    ]);

    const all = await run({ files, includeNonCurrent: true });
    expect(all[0]?.records.map((hit) => hit.standing)).toEqual([
      "current",
      "superseded",
    ]);
    expect(
      all[0]?.records.find((hit) => hit.conceptId === "decision.cursor-v1")
        ?.supersededBy,
    ).toEqual(["decision.cursor-v2"]);
  });

  test("an empty diff matches nothing", async () => {
    await seed("cursor", [{ file: FILE }]);

    expect(await run({ files: [] })).toEqual([]);
  });

  test("--git reads the range through the guarded runner", async () => {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write(SOURCE);
    git("add", "-A");
    git("commit", "-qm", "first");
    write(SOURCE.replace("return [];", "return [] as Order[];"));
    git("add", "-A");
    git("commit", "-qm", "second");

    const parsed = matchCommand.input.parse(
      await matchCommand.fromArgv(
        ["match", "--git", "HEAD~1..HEAD", "--repo-root", repo],
        bundle,
        noStdin,
      ),
    );

    expect(parsed.files).toEqual([
      {
        filePath: FILE,
        hunks: [
          { startLine: 5, endLine: 5 },
          { startLine: 5, endLine: 5, side: "old" },
        ],
      },
    ]);
    expect(parsed.repoRoot).toBe(repo);
  });

  // git's default `core.quotePath` octal-escapes this path; the runner pins it
  // off, so the record's own spelling is what reaches the parser.
  test("--git reads a non-ASCII path the way an anchor spells it", async () => {
    const unicode = "src/café.ts";
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write(SOURCE, unicode);
    git("add", "-A");
    git("commit", "-qm", "first");
    write(SOURCE.replace("return [];", "return [] as Order[];"), unicode);
    git("add", "-A");
    git("commit", "-qm", "second");

    const parsed = matchCommand.input.parse(
      await matchCommand.fromArgv(
        ["match", "--git", "HEAD~1..HEAD", "--repo-root", repo],
        bundle,
        noStdin,
      ),
    );

    expect(parsed.files).toEqual([
      {
        filePath: unicode,
        hunks: [
          { startLine: 5, endLine: 5 },
          { startLine: 5, endLine: 5, side: "old" },
        ],
      },
    ]);
  });

  // The half a caller controls reaches git argv, so an option-shaped rev is
  // refused before a subprocess exists rather than answered with nothing.
  test("a range git may not be handed names both halves as the reason", async () => {
    git("init", "-q");

    await expect(
      matchCommand.fromArgv(
        ["match", "--git", "-x..HEAD", "--repo-root", repo],
        bundle,
        noStdin,
      ),
    ).rejects.toThrow(/not a range .*both halves/);
  });

  test("--offline reaches the input", async () => {
    expect(
      await matchCommand.fromArgv(
        ["match", "--stdin", "--offline"],
        bundle,
        () => Promise.resolve(JSON.stringify({ files: [] })),
      ),
    ).toMatchObject({ offline: true });
  });

  test("--stdin takes the MCP object, and cannot rewrite the bundle", async () => {
    const payload = JSON.stringify({
      bundlePath: "/somewhere/else",
      files: [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 2 }] }],
      symbolRanges: [
        { file: FILE, symbol: "listOrders", startLine: 1, endLine: 2 },
      ],
    });

    expect(
      await matchCommand.fromArgv(["match", "--stdin"], bundle, () =>
        Promise.resolve(payload),
      ),
    ).toMatchObject({
      bundlePath: bundle,
      files: [{ filePath: FILE, hunks: [{ startLine: 1, endLine: 2 }] }],
      symbolRanges: [
        { file: FILE, symbol: "listOrders", startLine: 1, endLine: 2 },
      ],
    });
  });

  test("neither --git nor --stdin says which one to pass", async () => {
    await expect(
      matchCommand.fromArgv(["match"], bundle, noStdin),
    ).rejects.toThrow(/--git .*--stdin/);
  });

  // Without this a consumer had to re-derive the changed symbols itself, from
  // git's function context, and got a different answer to the one here.
  describe("--include-uncovered", () => {
    beforeEach(() => write(SOURCE));

    const files = [
      {
        filePath: FILE,
        hunks: [
          { startLine: 4, endLine: 4 },
          { startLine: 9, endLine: 9 },
          { startLine: 1, endLine: 1 },
        ],
      },
    ];

    test("names every hunk's symbol, covered or not", async () => {
      await seed("cursor", [{ file: FILE, symbol: "listOrders" }]);

      const matches = await run({ files, includeUncovered: true });

      expect(
        matches.map((match) => [
          match.hunk.startLine,
          match.symbol,
          match.records.length,
        ]),
      ).toEqual([
        [4, "listOrders", 1],
        // Changed, and nothing sits on it — the row a consumer enumerates.
        [9, "cancel", 0],
        // A top-level type declaration is no symbol at all, not a guess.
        [1, null, 0],
      ]);
    });

    test("off by default, and the covered rows are unchanged", async () => {
      await seed("cursor", [{ file: FILE, symbol: "listOrders" }]);

      const matches = await run({ files });

      expect(matches).toHaveLength(1);
      expect(matches[0]).not.toHaveProperty("symbol");
      expect(matches[0]?.hunk.startLine).toBe(4);
    });

    // The old side numbers the tree that went away, so reading its lines out
    // of the working file would name whatever now sits at those numbers.
    test("an edit's two sides are one row", async () => {
      const matches = await run({
        files: [
          {
            filePath: FILE,
            hunks: [
              { startLine: 5, endLine: 5 },
              { startLine: 5, endLine: 5, side: "old" },
            ],
          },
        ],
        includeUncovered: true,
      });

      expect(
        matches.map((match) => [match.hunk.startLine, match.symbol]),
      ).toEqual([[5, "listOrders"]]);
      expect(matches[0]?.hunk).not.toHaveProperty("side");
    });

    // A deletion is `-a,b +c,0`: the new-side point hunk is the survivor, and
    // the old-side hunk it comes with names nothing that still exists.
    test("a deletion comes back as its new-side point row", async () => {
      const matches = await run({
        files: [
          {
            filePath: FILE,
            hunks: [
              { startLine: 9, endLine: 9 },
              { startLine: 9, endLine: 12, side: "old" },
            ],
          },
        ],
        includeUncovered: true,
      });

      expect(
        matches.map((match) => [
          match.hunk.startLine,
          match.symbol,
          match.precision,
          match.records.length,
        ]),
      ).toEqual([[9, "cancel", "symbol", 0]]);
    });
  });
});
