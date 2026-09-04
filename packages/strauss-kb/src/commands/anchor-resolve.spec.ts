import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashAnchorText, resolveAnchor } from "../anchor-resolver.js";
import { composeRecord } from "../compose.js";
import { pinBase } from "../kb-pins/index.js";
import { KbStore } from "../kb-store.js";
import type { KbAnchor } from "../kb-record.schema.js";
import { anchorResolveCommand } from "./anchor-resolve.js";

/** Counts the files the command actually opens, per run. */
const readerCalls: string[] = [];
vi.mock("../anchor-resolver.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../anchor-resolver.js")>();
  return {
    ...actual,
    anchorFileReader: (repoRoot: string) => {
      const read = actual.anchorFileReader(repoRoot);
      return (file: string) => {
        readerCalls.push(file);
        return read(file);
      };
    },
  };
});

const SOURCE = [
  "export function totals(orders: Order[]): number {",
  "  return orders.length;",
  "}",
  "",
].join("\n");

const FILE = "src/orders.ts";
const ID = "decision.totals-shape";
const NOW = "2026-08-26T12:00:00Z";

type Output = {
  conceptId: string;
  results: {
    file: string;
    symbol?: string;
    state: string;
    storedHash?: string;
    currentHash?: string;
    diffSize?: number | null;
    reason?: string;
    rebaselined?: boolean;
  }[];
  verified: boolean;
  verifyRefused?: string;
  note?: string;
  frozen?: boolean;
};

describe("anchorResolveCommand", () => {
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-bundle-"));
  });

  afterEach(() => {
    readerCalls.length = 0;
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  function writeSource(contents: string, file = FILE): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  function stamped(symbol: string, source: string): KbAnchor {
    const resolved = resolveAnchor(source, { file: FILE, symbol });
    if (!resolved) throw new Error(`fixture symbol ${symbol} did not resolve`);
    return {
      file: FILE,
      symbol,
      hash: hashAnchorText(resolved.text),
      resolved_at: "2026-08-01T00:00:00Z",
      lines: resolved.endLine - resolved.startLine + 1,
    };
  }

  async function seed(
    anchors: KbAnchor[] | undefined,
    generator = "agent:writer",
  ): Promise<void> {
    await new KbStore().write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "totals-shape",
          title: "Totals counts orders",
          why: "A totals that sums amounts would double-charge refunds.",
          ...(anchors ? { anchors } : {}),
        },
        generator,
        "2026-08-01T00:00:00Z",
      ),
    );
  }

  async function run(
    input: Record<string, unknown>,
    actor = "agent:resolver",
  ): Promise<Output> {
    const parsed = anchorResolveCommand.input.parse({
      bundlePath: bundle,
      conceptId: ID,
      repoRoot: repo,
      ...input,
    });
    return (await anchorResolveCommand.run(
      { store: new KbStore(), actor, now: () => NOW },
      parsed,
    )) as Output;
  }

  /** The exit-code gate reads the result only; the input is along for the ride. */
  const fails = (output: Output) =>
    anchorResolveCommand.failsWhen?.(
      output,
      anchorResolveCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        repoRoot: repo,
      }),
    );

  // Six anchors over three files used to be six reads; the prefetch pass
  // collapses them to one per file.
  test("reads each distinct anchor file once", async () => {
    const source = [SOURCE, "export const LIMIT = 25;", ""].join("\n");
    const files = ["src/a.ts", "src/b.ts", "src/c.ts"];
    for (const file of files) writeSource(source, file);
    const anchors = files.flatMap((file) => [
      { ...stamped("totals", source), file },
      { ...stamped("LIMIT", source), file },
    ]);
    await seed(anchors);

    const output = await run({});

    expect(output.results).toHaveLength(6);
    expect(readerCalls).toEqual(files);
  });

  test("an unchanged fixture matches every anchor and appends one verified event", async () => {
    writeSource(SOURCE);
    const anchor = stamped("totals", SOURCE);
    await seed([anchor]);

    const output = await run({});

    expect(output).toEqual({
      conceptId: ID,
      results: [
        {
          file: FILE,
          symbol: "totals",
          state: "match",
          storedHash: anchor.hash,
          currentHash: anchor.hash,
        },
      ],
      verified: true,
    });
    expect(fails(output)).toBe(false);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.verified).toEqual([
      {
        by: "agent:resolver",
        at: NOW,
        note: "anchor-resolve: 1/1 anchors match (regex resolver)",
      },
    ]);
    // Left exactly as it was: a matching anchor is unchanged, and re-dating it
    // on every green run would write a record, a log line, and a git diff
    // saying only that a check ran.
    expect(record?.frontmatter.strauss_anchors?.[0]?.resolved_at).toBe(
      anchor.resolved_at,
    );
  });

  test("--restamp is what refreshes resolved_at on a match", async () => {
    writeSource(SOURCE);
    await seed([stamped("totals", SOURCE)]);

    await run({ restamp: true });

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]?.resolved_at).toBe(NOW);
  });

  // The anchor predates hashing, so there is a transition to record even
  // though the hash itself did not move.
  test("a match on an anchor with no resolved_at stamps the date once", async () => {
    writeSource(SOURCE);
    const { resolved_at: _dropped, ...undated } = stamped("totals", SOURCE);
    await seed([undated]);

    await run({});

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]?.resolved_at).toBe(NOW);
  });

  test("an edited symbol body reports drift, fails as a check, and verifies nothing", async () => {
    const anchor = stamped("totals", SOURCE);
    await seed([anchor]);
    writeSource(
      SOURCE.replace(
        "  return orders.length;",
        ["  audit(orders);", "  return orders.length;"].join("\n"),
      ),
    );

    const output = await run({});

    expect(output.verified).toBe(false);
    expect(output.results[0]).toMatchObject({
      state: "drifted",
      storedHash: anchor.hash,
      diffSize: 1,
    });
    expect(output.results[0]?.currentHash).not.toBe(anchor.hash);
    expect(fails(output)).toBe(true);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.verified).toEqual([]);
    expect(record?.frontmatter.strauss_anchors?.[0]?.hash).toBe(anchor.hash);
  });

  test("--rebaseline accepts drifted code as the new baseline", async () => {
    await seed([stamped("totals", SOURCE)]);
    const edited = SOURCE.replace("orders.length", "orders.length + 0");
    writeSource(edited);

    const output = await run({ rebaseline: true });

    expect(output.results[0]).toMatchObject({
      state: "drifted",
      rebaselined: true,
    });
    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]).toMatchObject({
      hash: hashAnchorText(
        resolveAnchor(edited, { file: FILE, symbol: "totals" })!.text,
      ),
      resolved_at: NOW,
    });
  });

  // A stored hash that no longer resolves is a broken anchor, not an absence:
  // the symbol was renamed or the file deleted, and exiting zero on it would
  // let the one edit that destroys an anchor pass the gate meant to catch it.
  test("a stamped symbol that vanished is an unresolved finding that still fails the gate", async () => {
    writeSource(SOURCE);
    await seed([
      {
        file: FILE,
        symbol: "MissingThing",
        hash: hashAnchorText("x"),
        lines: 1,
      },
    ]);

    const output = await run({});

    expect(output).toMatchObject({
      verified: false,
      results: [
        {
          state: "unresolved",
          reason: "symbol-not-found",
          symbol: "MissingThing",
        },
      ],
    });
    expect(fails(output)).toBe(true);
  });

  // Nothing was ever stamped, so nothing broke: an unstamped anchor is a
  // backlog item, and failing CI on it would gate on work not yet done.
  // `repo` and `ref` are author-owned identity: they say which code the record
  // meant, which is a claim only the author can make. The resolver stamps what
  // it measured — hash, lines, resolved_at — and nothing else.
  test("stamping leaves repo and ref exactly as the author wrote them", async () => {
    execFileSync("git", ["-C", repo, "init", "-q"]);
    execFileSync("git", [
      "-C",
      repo,
      "remote",
      "add",
      "origin",
      "git@github.com:org/this-one.git",
    ]);
    writeSource(SOURCE);
    await seed([
      {
        file: FILE,
        symbol: "totals",
        repo: "org/this-one",
        ref: "9f2c1ab3d4e5f60718293a4b5c6d7e8f90a1b2c3",
      },
    ]);

    const output = await run({});

    expect(output.results[0]?.state).toBe("stamped");
    const anchor = (await new KbStore().read(bundle, ID))?.frontmatter
      .strauss_anchors?.[0];
    expect(anchor).toMatchObject({
      repo: "org/this-one",
      ref: "9f2c1ab3d4e5f60718293a4b5c6d7e8f90a1b2c3",
      resolved_at: NOW,
    });
    expect(anchor?.hash).toBeDefined();
  });

  // Another repository's anchor is expected, not broken: never read, never
  // stamped, and never a reason to fail CI. SAA-709 resolves them properly.
  test("an anchor for another repo is skipped and does not fail the gate", async () => {
    writeSource(SOURCE);
    const local = stamped("totals", SOURCE);
    await seed([
      local,
      { ...local, file: "src/elsewhere.ts", repo: "org/somewhere-else" },
    ]);

    const output = await run({});

    expect(output.results[1]).toMatchObject({
      state: "unresolved",
      reason: "foreign-repo",
    });
    expect(fails(output)).toBe(false);

    // Outside the denominator rather than against it, and the note says so —
    // otherwise a cross-repo record could never be verified until SAA-709.
    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.verified?.[0]?.note).toBe(
      "anchor-resolve: 1/1 anchors match, 1 in another repo (regex resolver)",
    );
    expect(record?.frontmatter.strauss_anchors?.[1]?.repo).toBe(
      "org/somewhere-else",
    );
  });

  // Frozen refuses writes, not reads. A concluded base is exactly where a
  // caller most wants to ask whether the code moved, and throwing would deny
  // the report along with the stamp.
  test("a frozen base still gets its report, with nothing stamped", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      writeSource(SOURCE);
      await seed([{ file: FILE, symbol: "totals" }]);
      await pinBase(new KbStore(), workspace, bundle, NOW, {
        layer: "local",
        frozen: true,
      });

      const output = await run({});

      expect(output).toMatchObject({
        frozen: true,
        note: "base is frozen: nothing was stamped",
        results: [{ state: "stamped" }],
      });
      const record = await new KbStore().read(bundle, ID);
      expect(record?.frontmatter.strauss_anchors?.[0]?.hash).toBeUndefined();
    } finally {
      cwd.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("an unstamped symbol that does not resolve does not fail the gate", async () => {
    writeSource(SOURCE);
    await seed([{ file: FILE, symbol: "MissingThing" }]);

    const output = await run({});

    expect(output.results[0]).toMatchObject({
      state: "unresolved",
      reason: "symbol-not-found",
    });
    expect(output.results[0]?.storedHash).toBeUndefined();
    expect(fails(output)).toBe(false);
  });

  test("an anchor without a hash is stamped, and the record now carries it", async () => {
    writeSource(SOURCE);
    await seed([{ file: FILE, symbol: "totals" }]);

    const output = await run({});

    const expectedHash = hashAnchorText(
      resolveAnchor(SOURCE, { file: FILE, symbol: "totals" })!.text,
    );
    expect(output.results).toEqual([
      {
        file: FILE,
        symbol: "totals",
        state: "stamped",
        currentHash: expectedHash,
      },
    ]);
    // A stamping run has no prior hash to confirm, so it verifies nothing.
    expect(output.verified).toBe(false);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]).toEqual({
      file: FILE,
      symbol: "totals",
      hash: expectedHash,
      lines: 3,
      resolved_at: NOW,
    });
  });

  test("the record's own generator gets the drift report but a refused verify", async () => {
    writeSource(SOURCE);
    await seed([stamped("totals", SOURCE)], "agent:writer");

    const output = await run({}, "agent:writer");

    expect(output).toMatchObject({
      verified: false,
      verifyRefused: "self-verification",
      results: [{ state: "match" }],
    });
  });

  test("a record without anchors resolves to an empty report", async () => {
    await seed(undefined);

    const output = await run({});

    expect(output).toEqual({
      conceptId: ID,
      results: [],
      verified: false,
      note: "record has no anchors",
    });
  });

  test("a missing anchored file is an unresolved finding", async () => {
    await seed([stamped("totals", SOURCE)]);

    const output = await run({});

    expect(output.results[0]).toMatchObject({
      state: "unresolved",
      reason: "file-missing",
    });
  });

  test("an anchor path escaping the repo root is unresolved and never read", async () => {
    writeSource(SOURCE, "secret.ts");
    await seed([{ file: "../secret.ts", symbol: "totals" }]);

    const output = await run({ repoRoot: join(repo, "src") });

    expect(output.results[0]).toMatchObject({
      file: "../secret.ts",
      state: "unresolved",
      reason: "outside-repo",
    });
    expect(output.verified).toBe(false);
  });

  test("an unknown record is a not-found error", async () => {
    await expect(run({})).rejects.toMatchObject({
      name: "KbRecordNotFoundError",
    });
  });
});
