import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  detectAnchorDrift,
  hashAnchorText,
  regexResolver,
  resolveAnchor,
  type KbAnchorDriftEntry,
} from "../anchor-resolver.js";
import { composeRecord } from "../compose.js";
import { KbStore } from "../kb-store.js";
import type { KbAnchor, KbRecord } from "../kb-record.schema.js";
import { TreeSitterResolver } from "../tree-sitter-resolver.js";
import {
  doctorCommand,
  type KbDoctorCommandResult,
} from "../commands/doctor.js";
import {
  reassessCommand,
  type KbReassessResult,
} from "../commands/reassess.js";
import { classifyDrift } from "./classify.js";

/**
 * A real repository with real history, because every question this module
 * answers is a question about history: what the file was at a rev, whether the
 * same code exists elsewhere, whether a commit before a timestamp can be found.
 * A mocked git would only be asserting that the mock was written to match.
 */

const FILE = "src/orders.ts";
const ID = "fact.totals-shape";
const NOW = "2026-09-04T12:00:00Z";
const STAMPED_AT = "2026-08-01T00:00:00Z";

const V1 = [
  "export function totals(orders: Order[]): number {",
  "  // one line per order",
  "  return orders.length;",
  "}",
  "",
].join("\n");

/**
 * Same program, different spelling: reindented, and the comment reworded. A
 * formatter's whole contribution, and a reviewer's — neither of which changes
 * what the code does, and neither of which the token stream can see.
 */
const REFORMATTED = [
  "export function totals(orders: Order[]): number {",
  "      // counts orders; it does not sum them",
  "      return orders.length;",
  "}",
  "",
].join("\n");

/** A different program. */
const REWRITTEN = [
  "export function totals(orders: Order[]): number {",
  "  return orders.reduce((sum, order) => sum + order.amount, 0);",
  "}",
  "",
].join("\n");

describe("drift classification", () => {
  let repo: string;
  let bundle: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-drift-repo-"));
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-drift-bundle-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  function write(contents: string, file = FILE): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  function commit(message: string): string {
    git("add", "-A");
    git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  }

  /** A raw-hashed anchor: what every anchor stamped before this change is. */
  function rawAnchor(source: string, extra: Partial<KbAnchor> = {}): KbAnchor {
    const span = resolveAnchor(source, { file: FILE, symbol: "totals" });
    if (!span) throw new Error("fixture symbol did not resolve");
    return {
      file: FILE,
      symbol: "totals",
      hash: hashAnchorText(span.text),
      lines: span.endLine - span.startLine + 1,
      resolved_at: STAMPED_AT,
      ...extra,
    };
  }

  /** An `ast`-hashed anchor: what a tree-sitter resolution pass stamps now. */
  async function astAnchor(
    source: string,
    extra: Partial<KbAnchor> = {},
  ): Promise<KbAnchor> {
    const resolver = new TreeSitterResolver();
    await resolver.prepare([FILE]);
    const span = resolver.resolve(source, "totals", FILE);
    if (!span) throw new Error("fixture symbol did not resolve");
    return {
      file: FILE,
      symbol: "totals",
      hash: hashAnchorText(resolver.normalize(span.text, FILE) as string),
      hash_kind: "ast",
      resolver: "tree-sitter",
      lines: span.endLine - span.startLine + 1,
      resolved_at: STAMPED_AT,
      ...extra,
    };
  }

  /** The write input, for `store.write`. */
  function writeInput(anchors: KbAnchor[]) {
    return composeRecord(
      "fact",
      {
        slug: "totals-shape",
        title: "totals counts orders, it does not sum them",
        why: "A totals that summed amounts would double-count refunds.",
        sections: { Claim: "`totals` returns the order count." },
        anchors,
      },
      "agent:writer",
      STAMPED_AT,
    );
  }

  /** The same record as `list()` would hand it back, for the pure passes. */
  function record(anchors: KbAnchor[]): KbRecord {
    const input = writeInput(anchors);
    return {
      conceptId: `${input.type}.${input.slug}`,
      frontmatter: { ...input.frontmatter, type: input.type },
      body: input.body,
    } as KbRecord;
  }

  async function drift(entry: KbRecord): Promise<KbAnchorDriftEntry[]> {
    const found = await detectAnchorDrift([entry], { repoRoot: repo });
    return found.get(entry.conceptId) ?? [];
  }

  const classify = async (entry: KbRecord) =>
    classifyDrift(repo, entry, await drift(entry), {});

  /* ------------------------------------------------------------------ */

  test("a file rename is moved, and carries where the code went", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    git("mv", FILE, "src/billing.ts");
    commit("move totals into billing");

    const [found] = await classify(record([anchor]));

    expect(found?.class).toBe("moved");
    expect(found?.entry.movedTo).toMatchObject({
      file: "src/billing.ts",
      symbol: "totals",
    });
  });

  test("a formatting-only edit is not drift at all under tree-sitter", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    write(REFORMATTED);
    commit("reformat");

    const entries = await drift(record([anchor]));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.state).toBe("match");
    expect(entries[0]?.hashKind).toBe("ast");
  });

  test("the same edit under the regex resolver is drift, classed changed", async () => {
    write(V1);
    const anchor = rawAnchor(V1);
    commit("seed");
    write(REFORMATTED);
    commit("reformat");

    const entry = record([anchor]);
    const found = await detectAnchorDrift([entry], {
      repoRoot: repo,
      resolver: regexResolver,
    });

    expect(found.get(entry.conceptId)?.[0]).toMatchObject({
      state: "drifted",
      class: "changed",
      hashKind: "raw",
    });
  });

  test("a raw-hashed anchor reformatted is cosmetic, not something to read", async () => {
    // The anchor predates AST hashing, so the reformat does register as drift.
    // Classification is what closes it: the two spans are one token stream.
    write(V1);
    const anchor = rawAnchor(V1);
    const ref = commit("seed");
    write(REFORMATTED);
    commit("reformat");

    const [found] = await classify(record([{ ...anchor, ref }]));

    expect(found?.class).toBe("cosmetic");
  });

  test("a body change is changed, and the diff's old side is the committed span", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    const ref = commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");

    const entry = record([{ ...anchor, ref }]);
    const [found] = await classify(entry);

    expect(found?.class).toBe("changed");
    // The old side is exactly what `git show <ref>:<file>` resolves the anchor
    // to — not the whole file, and not the working tree.
    expect(found?.oldText).toBe(
      resolveAnchor(V1, { file: FILE, symbol: "totals" })?.text,
    );
    expect(found?.oldOrigin).toEqual({ kind: "ref", ref });
  });

  test("a deleted file is gone", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    git("rm", "-q", FILE);
    commit("drop orders");

    const [found] = await classify(record([anchor]));

    expect(found?.class).toBe("gone");
    expect(found?.entry.reason).toBe("file-missing");
  });

  test("no ref and no history before resolved_at leaves the diff unrecoverable", async () => {
    // The whole repository is committed after the anchor says it resolved, so
    // `--before` finds nothing and there is no `ref` to fall back from.
    write(REWRITTEN);
    const anchor = rawAnchor(V1, { resolved_at: "2020-01-01T00:00:00Z" });
    commit("seed");

    const packet = await reassess({ anchors: [anchor], withDiff: true });

    expect(packet?.anchors[0]?.diff).toEqual({ status: "unrecoverable" });
  });

  /* ---- the packet ---------------------------------------------------- */

  async function seed(anchors: KbAnchor[]): Promise<void> {
    const store = new KbStore();
    await store.write(bundle, writeInput(anchors));
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "bill-on-count",
          title: "Bill on order count",
          why: "Billing on amounts would need a refund story we do not have.",
          sections: { Decision: "Bill per order, not per amount." },
          links: [{ target: ID, rel: "depends_on" }],
        },
        "agent:writer",
        STAMPED_AT,
      ),
    );
  }

  async function run(
    input: Record<string, unknown> = {},
  ): Promise<KbReassessResult> {
    return (await reassessCommand.run(
      { store: new KbStore(), actor: "agent:reader", now: () => NOW },
      reassessCommand.input.parse({
        bundlePath: bundle,
        conceptId: ID,
        repoRoot: repo,
        ...input,
      }),
    )) as KbReassessResult;
  }

  async function reassess(options: {
    anchors: KbAnchor[];
    withDiff?: boolean;
  }): Promise<KbReassessResult["packet"]> {
    await seed(options.anchors);
    const result = await run(options.withDiff ? { withDiff: true } : {});
    return result.packet;
  }

  test("the packet carries the record's impact set", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    const ref = commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");

    const packet = await reassess({ anchors: [{ ...anchor, ref }] });

    expect(packet?.impact).toEqual([
      expect.objectContaining({
        conceptId: "decision.bill-on-count",
        depth: 1,
      }),
    ]);
    // A `fact` whose evidence changed leans one way; the note says which.
    expect(packet?.default).toBe("presumed-invalidated");
    expect(packet?.claim).toMatchObject({ section: "Claim" });
  });

  test("a moved anchor is rebaselined and produces no packet", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    git("mv", FILE, "src/billing.ts");
    commit("move totals into billing");
    await seed([anchor]);

    const result = await run();

    expect(result.packet).toBeNull();
    expect(result.rebaselined).toEqual([
      {
        file: FILE,
        symbol: "totals",
        toFile: "src/billing.ts",
        toSymbol: "totals",
      },
    ]);
    const after = await new KbStore().read(bundle, ID);
    expect(after?.frontmatter.strauss_anchors?.[0]).toMatchObject({
      file: "src/billing.ts",
      // The hash is the same bytes it always was; only the address moved.
      hash: anchor.hash,
    });
  });

  test("a record with no drift reassesses to nothing", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    await seed([anchor]);

    const result = await run();

    expect(result).toEqual({
      conceptId: ID,
      packet: null,
      rebaselined: [],
      cosmetic: 0,
    });
  });

  test("a diff's old side is rendered as a unified diff, capped", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    const ref = commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");

    const packet = await reassess({
      anchors: [{ ...anchor, ref }],
      withDiff: true,
    });
    const diff = packet?.anchors[0]?.diff;

    expect(diff?.status).toBe("ok");
    if (diff?.status !== "ok") return;
    expect(diff.source).toBe("ref");
    expect(diff.unified).toContain("-  return orders.length;");
    expect(diff.unified).toContain(
      "+  return orders.reduce((sum, order) => sum + order.amount, 0);",
    );
    expect(diff.unified.split("\n").length).toBeLessThanOrEqual(201);
  });

  test("doctor --drifted reports the packets and stays read-only", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    const ref = commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");
    await seed([{ ...anchor, ref }]);

    const report = (await doctorCommand.run(
      { store: new KbStore(), actor: "agent:reader", now: () => NOW },
      doctorCommand.input.parse({
        bundlePath: bundle,
        repoRoot: repo,
        drifted: true,
        withDiff: true,
      }),
    )) as KbDoctorCommandResult;

    expect(report.packets?.map((packet) => packet.conceptId)).toEqual([ID]);
    expect(report.packets?.[0]?.anchors[0]?.diff?.status).toBe("ok");
    const after = await new KbStore().read(bundle, ID);
    expect(after?.frontmatter.strauss_anchors?.[0]?.hash).toBe(anchor.hash);
  });

  test("stamp counts the records whose anchors drifted", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");
    await seed([anchor]);

    const stamp = await new KbStore().stamp(bundle, { repoRoot: repo });

    expect(stamp.drifted).toBe(1);
  });

  /**
   * The size ceiling, asserted rather than hoped for. A packet that has to be
   * paged through is a packet a reader skims, and skimming is the failure this
   * whole module exists to prevent. Ten anchors is the shape that tests it:
   * one diff each, sharing one budget.
   */
  test("a ten-anchor packet stays inside its budget", async () => {
    const symbols = Array.from({ length: 10 }, (_, at) => `totals${at}`);
    const before = symbols.map((name) => V1.replace("totals", name)).join("\n");
    const after = symbols
      .map((name) => REWRITTEN.replace("totals", name))
      .join("\n");
    write(before);
    const ref = commit("seed");
    write(after);
    commit("rewrite every one of them");

    const resolver = new TreeSitterResolver();
    await resolver.prepare([FILE]);
    const anchors = symbols.map((symbol) => {
      const span = resolver.resolve(before, symbol, FILE);
      if (!span) throw new Error(`fixture symbol ${symbol} did not resolve`);
      return {
        file: FILE,
        symbol,
        hash: hashAnchorText(resolver.normalize(span.text, FILE) as string),
        hash_kind: "ast" as const,
        resolver: "tree-sitter" as const,
        lines: span.endLine - span.startLine + 1,
        resolved_at: STAMPED_AT,
        ref,
      };
    });

    await seed(anchors);
    const result = await run({ withDiff: true });
    const rendered = reassessCommand.render?.(result) ?? "";

    expect(result.packet?.anchors).toHaveLength(10);
    // Four characters to the token is the conservative end of the usual
    // estimate, so 8k characters is the 2k-token ceiling.
    expect(rendered.length).toBeLessThan(8_000);
  });

  /* ---- the invariant ------------------------------------------------- */

  test("no drift path appends verified[] or changes standing", async () => {
    write(V1);
    const anchor = await astAnchor(V1);
    commit("seed");
    write(REWRITTEN);
    commit("sum amounts instead");
    await seed([anchor]);

    const before = await new KbStore().read(bundle, ID);
    await run({ withDiff: true });
    const after = await new KbStore().read(bundle, ID);

    expect(after?.frontmatter.verified ?? []).toEqual(
      before?.frontmatter.verified ?? [],
    );
    expect(after?.frontmatter.strauss_status).toBe(
      before?.frontmatter.strauss_status,
    );
    // And the baseline itself is untouched: accepting an edit nobody read is
    // exactly the write this command must never make.
    expect(after?.frontmatter.strauss_anchors?.[0]?.hash).toBe(anchor.hash);
  });
});
