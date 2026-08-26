import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { hashAnchorText, resolveAnchor } from "../anchor-resolver.js";
import { composeRecord } from "../compose.js";
import { KbStore } from "../kb-store.js";
import type { KbAnchor } from "../kb-record.schema.js";
import { anchorResolveCommand } from "./anchor-resolve.js";

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
};

describe("anchorResolveCommand", () => {
  let repo: string;
  let bundle: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-resolve-bundle-"));
  });

  afterEach(() => {
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
    expect(anchorResolveCommand.failsWhen?.(output)).toBe(false);

    const record = await new KbStore().read(bundle, ID);
    expect(record?.frontmatter.verified).toEqual([
      {
        by: "agent:resolver",
        at: NOW,
        note: "anchor-resolve: 1/1 anchors match (regex resolver)",
      },
    ]);
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
    expect(anchorResolveCommand.failsWhen?.(output)).toBe(true);

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

  test("a bogus symbol is an unresolved finding, not a throw", async () => {
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
    expect(anchorResolveCommand.failsWhen?.(output)).toBe(false);
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

  test("an unknown record is a not-found error", async () => {
    await expect(run({})).rejects.toMatchObject({
      name: "KbRecordNotFoundError",
    });
  });
});
