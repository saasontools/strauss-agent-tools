import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { hashAnchorText, resolveAnchor } from "../../anchor-resolver/index.js";
import { composeRecord } from "../../compose.js";
import { pinBase } from "../../kb-pins/index.js";
import { KbWriteConflictError } from "../../kb-errors.js";
import { KbStore } from "../../kb-store.js";
import type { KbAnchor } from "../../kb-record.schema.js";
import { TreeSitterResolver } from "../../tree-sitter-resolver/index.js";
import { reassessCommand } from "../reassess.js";
import { anchorResolveCommand } from "./index.js";
import { planAnchors } from "./plan.js";

/** What a tree-sitter stamp now hashes: the span's normalised token stream. */
async function astHash(source: string): Promise<string> {
  const resolver = new TreeSitterResolver();
  await resolver.prepare([FILE]);
  const span = resolver.resolve(source, "totals", FILE);
  return hashAnchorText(resolver.normalize(span!.text, FILE) as string);
}

/** Counts the files the command actually opens, per run. */
const readerCalls: string[] = [];
vi.mock("../../anchor-resolver/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../anchor-resolver/index.js")>();
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
    hashKind?: string;
    diffSize?: number | null;
    reason?: string;
    outcome?: string;
    outcomeReason?: string;
    rebaselined?: boolean;
    repo?: string;
    remoteState?: string;
  }[];
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
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "totals-shape",
          title: "Totals counts orders",
          why: "A totals that sums amounts would double-charge refunds.",
        },
        generator,
        "2026-08-01T00:00:00Z",
      ),
    );
    // Stamped anchors arrive the way a real base gets them: a resolution pass
    // writes them, never the first write.
    if (anchors?.length) {
      await store.updateAnchors(bundle, ID, anchors, "agent:resolver");
    }
  }

  async function run(
    input: Record<string, unknown>,
    actor = "agent:resolver",
    store: KbStore = new KbStore(),
  ): Promise<Output> {
    const parsed = anchorResolveCommand.input.parse({
      bundlePath: bundle,
      conceptId: ID,
      repoRoot: repo,
      ...input,
    });
    return (await anchorResolveCommand.run(
      { store, actor, now: () => NOW },
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

  /** Every file under `dir` by relative path, to check a run wrote nothing. */
  function snapshot(dir: string): Record<string, string> {
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((path) => statSync(join(dir, path)).isFile())
      .sort();
    return Object.fromEntries(
      files.map((path) => [path, readFileSync(join(dir, path), "utf8")]),
    );
  }

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

  test("an unchanged fixture matches every anchor and writes nothing", async () => {
    writeSource(SOURCE);
    const anchor = stamped("totals", SOURCE);
    await seed([anchor]);
    const before = snapshot(bundle);

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
          hashKind: "raw",
          resolver: "tree-sitter",
        },
      ],
    });
    expect(fails(output)).toBe(false);
    expect(snapshot(bundle)).toEqual(before);
  });

  // The gate runs this on every Stop, where any write dirties the base.
  test("--check leaves the bundle byte-identical", async () => {
    writeSource([SOURCE, "export const LIMIT = 25;", ""].join("\n"));
    const { resolved_at: _dropped, ...undated } = stamped("totals", SOURCE);
    await seed([undated, { file: FILE, symbol: "LIMIT" }]);
    const before = snapshot(bundle);

    const output = await run({ check: true });

    expect(output.results).toMatchObject([
      { symbol: "totals", state: "match" },
      { symbol: "LIMIT", state: "unstamped" },
    ]);
    expect(snapshot(bundle)).toEqual(before);
  });

  test("--check still reports drift and fails the gate", async () => {
    await seed([stamped("totals", SOURCE)]);
    writeSource(SOURCE.replace("orders.length", "orders.length + 1"));
    const before = snapshot(bundle);

    const output = await run({ check: true });

    expect(output.results[0]?.state).toBe("drifted");
    expect(fails(output)).toBe(true);
    expect(snapshot(bundle)).toEqual(before);
  });

  test("--check refuses --rebaseline and --restamp", async () => {
    await seed([stamped("totals", SOURCE)]);

    for (const flag of ["rebaseline", "restamp"]) {
      await expect(run({ check: true, [flag]: true })).rejects.toMatchObject({
        name: "KbFlagConflictError",
      });
    }
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
      outcome: "applied",
      rebaselined: true,
    });
    // The write succeeded, so the run succeeded: a gate that saw 1 here would
    // stop a sequence whose next step has nothing left to do.
    expect(fails(output)).toBe(false);
    const record = await new KbStore().read(bundle, ID);
    // Rebaselining stamps the strongest hash available: over the parsed token
    // stream, not the raw text, so a later reformat of this span is not drift.
    expect(record?.frontmatter.strauss_anchors?.[0]).toMatchObject({
      hash: await astHash(edited),
      hash_kind: "ast",
      resolved_at: NOW,
    });
    expect(record?.frontmatter.strauss_anchors?.[0]?.hash).not.toBe(
      hashAnchorText(
        resolveAnchor(edited, { file: FILE, symbol: "totals" })!.text,
      ),
    );
    expect(record?.frontmatter.verified).toEqual([]);
  });

  // The sequence this exists for: rebaseline, then look again. The second run
  // matches, and `reassess` has nothing to hand a reader.
  test("a rebaselined anchor rechecks clean and leaves reassess nothing", async () => {
    await seed([stamped("totals", SOURCE)]);
    writeSource(SOURCE.replace("orders.length", "orders.length + 0"));

    await run({ rebaseline: true });
    const again = await run({});

    expect(again.results[0]).toMatchObject({ state: "match" });
    expect(fails(again)).toBe(false);

    const reassessed = (await reassessCommand.run(
      { store: new KbStore(), actor: "agent:resolver", now: () => NOW },
      reassessCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        repoRoot: repo,
      }),
    )) as { packet: unknown };
    expect(reassessed.packet).toBeNull();
  });

  // New, changed, and unchanged anchors in one record: the writes it owes are
  // the drifted one and the unstamped one, and both land in the same write.
  test("--rebaseline settles a mix of unstamped and drifted anchors", async () => {
    const source = [
      SOURCE,
      "export const LIMIT = 25;",
      "export const FLOOR = 1;",
      "",
    ].join("\n");
    const drifting = stamped("totals", source);
    const unchanged = stamped("FLOOR", source);
    await seed([drifting, { file: FILE, symbol: "LIMIT" }, unchanged]);
    writeSource(source.replace("orders.length", "orders.length + 0"));

    const output = await run({ rebaseline: true });

    expect(output.results).toMatchObject([
      { symbol: "totals", state: "drifted", outcome: "applied" },
      { symbol: "LIMIT", state: "stamped", outcome: "applied" },
      { symbol: "FLOOR", state: "match" },
    ]);
    expect(fails(output)).toBe(false);

    const anchors = (await new KbStore().read(bundle, ID))?.frontmatter
      .strauss_anchors;
    expect(anchors?.[0]?.hash).not.toBe(drifting.hash);
    expect(anchors?.[1]?.hash).toBeDefined();
    expect(anchors?.[2]?.hash).toBe(unchanged.hash);
  });

  // A refused write is not a rebaseline. The report names the refusal, the
  // stored baseline is exactly what it was, and the gate still fails.
  test("a store that refuses the write never reports a rebaseline", async () => {
    const anchor = stamped("totals", SOURCE);
    await seed([anchor]);
    writeSource(SOURCE.replace("orders.length", "orders.length + 0"));
    const store = new KbStore();
    vi.spyOn(store, "updateAnchors").mockRejectedValue(new Error("disk full"));

    const output = await run({ rebaseline: true }, "agent:resolver", store);

    expect(output.results[0]).toMatchObject({
      state: "drifted",
      outcome: "failed",
      outcomeReason: "write-failed",
    });
    expect(output.results[0]?.rebaselined).toBeUndefined();
    expect(output.note).toBe("nothing was written: disk full");
    expect(fails(output)).toBe(true);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]?.hash).toBe(anchor.hash);
  });

  // The only write a matching anchor ever earns is its date, and a refused one
  // used to leave the whole run silent: no outcome, and exit 0.
  test("a refused resolved_at refresh is still a failed write", async () => {
    writeSource(SOURCE);
    const { resolved_at: _dropped, ...undated } = stamped("totals", SOURCE);
    await seed([undated]);
    const store = new KbStore();
    vi.spyOn(store, "updateAnchors").mockRejectedValue(new Error("disk full"));

    const output = await run({}, "agent:resolver", store);

    expect(output.results[0]).toMatchObject({
      state: "match",
      outcome: "failed",
      outcomeReason: "write-failed",
    });
    expect(fails(output)).toBe(true);
  });

  // A schema error is this command building an anchor badly, not the
  // environment refusing one, so it reaches the caller as itself.
  test("a schema error from the write propagates", async () => {
    writeSource(SOURCE);
    await seed([{ file: FILE, symbol: "totals" }]);
    const store = new KbStore();
    vi.spyOn(store, "updateAnchors").mockImplementation(() => {
      throw new z.ZodError([]);
    });

    await expect(run({}, "agent:resolver", store)).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  // A typed store error is the caller's to act on, and MCP has no exit code to
  // read: it propagates rather than becoming one anchor's outcome.
  test("a typed store error propagates instead of becoming a finding", async () => {
    await seed([stamped("totals", SOURCE)]);
    writeSource(SOURCE.replace("orders.length", "orders.length + 0"));
    const store = new KbStore();
    vi.spyOn(store, "updateAnchors").mockRejectedValue(
      new KbWriteConflictError(ID),
    );

    await expect(
      run({ rebaseline: true }, "agent:resolver", store),
    ).rejects.toMatchObject({ name: "KbWriteConflictError" });
  });

  // The count and the refusal are two facts about one run, and `note` is one
  // key: the failure used to overwrite the count.
  test("the note keeps the anchor count beside the refusal, and stays short", async () => {
    writeSource(SOURCE);
    const local = stamped("totals", SOURCE);
    const { resolved_at: _dropped, ...undated } = local;
    await seed([
      undated,
      { ...local, file: "src/elsewhere.ts", repo: "org/somewhere-else" },
    ]);
    const store = new KbStore();
    vi.spyOn(store, "updateAnchors").mockRejectedValue(
      new Error("x".repeat(500)),
    );

    const output = await run({ offline: true }, "agent:resolver", store);

    expect(output.note).toContain("1/1 anchors match, 1 unreachable");
    expect(output.note).toContain("nothing was written:");
    expect(output.note?.length).toBeLessThan(300);
  });

  // `planAnchors` is exported, and `--check` means no write whatever else the
  // caller passed.
  test("planAnchors writes nothing under check, even asked to rebaseline", async () => {
    writeSource(SOURCE.replace("orders.length", "orders.length + 0"));
    const anchor = stamped("totals", SOURCE);

    const plans = await planAnchors([anchor], {
      root: repo,
      offline: true,
      rebaseline: true,
      restamp: true,
      check: true,
      now: () => NOW,
    });

    expect(plans[0]?.finding.state).toBe("drifted");
    expect(plans[0]?.write).toBeUndefined();
    expect(plans[0]?.anchor).toBe(anchor);
  });

  // Frozen skips the date this command fills in for itself, and keeps the one
  // `--restamp` asked for, so the outcome a refusal reports is always a
  // refusal of something the caller wanted.
  test("planAnchors keeps only the asked-for refresh on a frozen base", async () => {
    writeSource(SOURCE);
    const { resolved_at: _dropped, ...undated } = stamped("totals", SOURCE);
    const options = {
      root: repo,
      offline: true,
      rebaseline: false,
      check: false,
      frozen: true,
      now: () => NOW,
    };

    const backfill = await planAnchors([undated], {
      ...options,
      restamp: false,
    });
    const asked = await planAnchors([undated], { ...options, restamp: true });

    expect(backfill[0]?.write).toBeUndefined();
    expect(asked[0]?.write).toBe("refresh");
  });

  test("--rebaseline cannot settle a symbol that is gone", async () => {
    writeSource(SOURCE);
    await seed([
      {
        file: FILE,
        symbol: "MissingThing",
        hash: hashAnchorText("x"),
        lines: 1,
      },
    ]);

    const output = await run({ rebaseline: true });

    expect(output.results[0]).toMatchObject({
      state: "unresolved",
      reason: "symbol-not-found",
    });
    expect(output.results[0]?.outcome).toBeUndefined();
    expect(fails(output)).toBe(true);
  });

  // Nothing read it, so nothing rebaselined it — and an anchor the run could
  // not check still does not fail the gate.
  test("--rebaseline claims nothing for an unreachable foreign anchor", async () => {
    writeSource(SOURCE);
    const local = stamped("totals", SOURCE);
    await seed([
      local,
      { ...local, file: "src/elsewhere.ts", repo: "org/somewhere-else" },
    ]);

    const output = await run({ offline: true, rebaseline: true });

    expect(output.results[1]).toMatchObject({
      state: "unresolved",
      reason: "remote-unreachable",
    });
    expect(output.results[1]?.outcome).toBeUndefined();
    expect(output.results[1]?.rebaselined).toBeUndefined();
    expect(fails(output)).toBe(false);
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

  // An anchor nothing could reach never fails CI — the run did not check it,
  // so it cannot accuse it — and is counted apart: "could not look" is not
  // "matches".
  test("an unreachable foreign anchor does not fail the gate", async () => {
    writeSource(SOURCE);
    const local = stamped("totals", SOURCE);
    await seed([
      local,
      { ...local, file: "src/elsewhere.ts", repo: "org/somewhere-else" },
    ]);

    const output = await run({ offline: true });

    expect(output.results[1]).toMatchObject({
      state: "unresolved",
      reason: "remote-unreachable",
      repo: "org/somewhere-else",
    });
    expect(fails(output)).toBe(false);
    expect(output).toMatchObject({
      note: "1/1 anchors match, 1 unreachable",
    });

    const record = await new KbStore().read(bundle, ID);
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
        // The refusal is the anchor's own outcome: `stamped` here would name a
        // hash the base does not hold.
        results: [
          { state: "unstamped", outcome: "failed", outcomeReason: "frozen" },
        ],
      });
      expect(fails(output)).toBe(true);
      const record = await new KbStore().read(bundle, ID);
      expect(record?.frontmatter.strauss_anchors?.[0]?.hash).toBeUndefined();
    } finally {
      cwd.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  // The date backfill is the command's own idea, not the caller's. On a base
  // that can never take it, planning it would leave the run permanently red.
  test("a frozen base plans no date backfill, so a matching record stays green", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      writeSource(SOURCE);
      const { resolved_at: _dropped, ...undated } = stamped("totals", SOURCE);
      await seed([undated]);
      await pinBase(new KbStore(), workspace, bundle, NOW, {
        layer: "local",
        frozen: true,
      });

      const output = await run({});

      expect(output.results).toMatchObject([{ state: "match" }]);
      expect(output.results[0]?.outcome).toBeUndefined();
      expect(output.frozen).toBeUndefined();
      expect(fails(output)).toBe(false);
    } finally {
      cwd.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  // `--restamp` is a write the caller asked for, so a base that refuses it
  // says so.
  test("a frozen base fails the --restamp the caller asked for", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      writeSource(SOURCE);
      await seed([stamped("totals", SOURCE)]);
      await pinBase(new KbStore(), workspace, bundle, NOW, {
        layer: "local",
        frozen: true,
      });

      const output = await run({ restamp: true });

      expect(output.results[0]).toMatchObject({
        state: "match",
        outcome: "failed",
        outcomeReason: "frozen",
      });
      expect(fails(output)).toBe(true);
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

    const expectedHash = await astHash(SOURCE);
    expect(output.results).toEqual([
      {
        file: FILE,
        symbol: "totals",
        state: "stamped",
        currentHash: expectedHash,
        hashKind: "ast",
        resolver: "tree-sitter",
        outcome: "applied",
      },
    ]);
    expect(fails(output)).toBe(false);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.strauss_anchors?.[0]).toEqual({
      file: FILE,
      symbol: "totals",
      hash: expectedHash,
      hash_kind: "ast",
      lines: 3,
      resolved_at: NOW,
      resolver: "tree-sitter",
    });
  });

  // No tags query defines a constant, so the chain hands it to regex and the
  // stamp says so — the anchor that used to come back `symbol-not-found`.
  test("a const stamps through regex; a function beside it through tree-sitter", async () => {
    writeSource([SOURCE, "export const LIMIT = { max: 25 };", ""].join("\n"));
    await seed([
      { file: FILE, symbol: "LIMIT" },
      { file: FILE, symbol: "totals" },
    ]);

    const output = await run({});

    expect(output.results).toMatchObject([
      { symbol: "LIMIT", state: "stamped", resolver: "regex" },
      { symbol: "totals", state: "stamped", resolver: "tree-sitter" },
    ]);
  });

  // `claim.self-verified` reads refusals from the log; a resolve by the
  // record's generator must not leave one.
  test("the record's own generator gets the report and no refusal", async () => {
    writeSource(SOURCE);
    await seed([stamped("totals", SOURCE)], "agent:writer");
    const before = snapshot(bundle);

    const output = await run({}, "agent:writer");

    expect(output.results).toMatchObject([{ state: "match" }]);
    expect(snapshot(bundle)).toEqual(before);
  });

  test("a record without anchors resolves to an empty report", async () => {
    await seed(undefined);

    const output = await run({});

    expect(output).toEqual({
      conceptId: ID,
      results: [],
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
  });

  test("an unknown record is a not-found error", async () => {
    await expect(run({})).rejects.toMatchObject({
      name: "KbRecordNotFoundError",
    });
  });

  // The "remote" is a bare repository on disk: CI never touches the network.
  describe("an anchor in another repository", () => {
    const V2 = SOURCE.replace("orders.length", "orders.length + 1");
    let remotes: string;

    /** A two-commit bare mirror, reachable over file://. */
    function publish(): { url: string; first: string; head: string } {
      const source = join(remotes, "source");
      mkdirSync(join(source, "src"), { recursive: true });
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", source, ...args], { stdio: "pipe" })
          .toString()
          .trim();
      execFileSync("git", ["init", "-q", "-b", "main", source], {
        stdio: "pipe",
      });
      const shas: string[] = [];
      for (const [at, version] of [SOURCE, V2].entries()) {
        writeFileSync(join(source, FILE), version, "utf8");
        git("add", "-A");
        git(
          "-c",
          "user.email=t@t",
          "-c",
          "user.name=t",
          "commit",
          "-qm",
          `${at}`,
        );
        shas.push(git("rev-parse", "HEAD"));
      }
      const bare = `${source}.git`;
      execFileSync("git", ["clone", "-q", "--bare", source, bare], {
        stdio: "pipe",
      });
      return {
        url: pathToFileURL(bare).href,
        first: shas[0] as string,
        head: shas[1] as string,
      };
    }

    beforeEach(() => {
      remotes = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-remote-"));
      vi.stubEnv("STRAUSS_KB_REPO_CACHE", join(remotes, "cache"));
      execFileSync("git", ["-C", repo, "init", "-q"]);
      execFileSync("git", [
        "-C",
        repo,
        "remote",
        "add",
        "origin",
        "git@github.com:org/this-one.git",
      ]);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      rmSync(remotes, { recursive: true, force: true });
    });

    test("matches from the remote, and reads no local file at all", async () => {
      const remote = publish();
      await seed([
        { ...stamped("totals", V2), repo: remote.url, ref: remote.head },
      ]);

      const output = await run({});

      expect(output.results[0]).toMatchObject({
        state: "match",
        remoteState: "matches-ref",
        repo: remote.url,
      });
      expect(readerCalls).toEqual([]);
    });

    // The record is honest at its own commit and the branch has moved past it.
    // The repair is to move `ref`, which is the author's field, so the anchor
    // is reported and left exactly as it was.
    test("fails the gate when the default branch moved past the ref", async () => {
      const remote = publish();
      const anchor = {
        ...stamped("totals", SOURCE),
        repo: remote.url,
        ref: remote.first,
      };
      await seed([anchor]);

      const output = await run({ rebaseline: true });

      expect(output.results[0]).toMatchObject({
        state: "drifted",
        remoteState: "drifted-on-default",
        outcome: "skipped",
        outcomeReason: "pinned-ref",
      });
      expect(output.results[0]?.rebaselined).toBeUndefined();
      expect(fails(output)).toBe(true);
      const record = await new KbStore().read(bundle, ID);
      expect(record?.frontmatter.strauss_anchors?.[0]?.hash).toBe(anchor.hash);
    });
  });
});
