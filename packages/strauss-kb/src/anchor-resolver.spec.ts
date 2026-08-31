/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import {
  anchorFilePath,
  detectAnchorDrift,
  hashAnchorText,
  looksLikeWrongRepoRoot,
  MAX_ANCHOR_FILE_BYTES,
  regexResolver,
  resolveAnchor,
} from "./anchor-resolver.js";
import { composeInputSchema } from "./compose.js";
import { kbAnchorSchema, type KbRecord } from "./kb-record.schema.js";

const SOURCE = [
  "import { thing } from './thing.js';",
  "",
  "export class OrderService {",
  "  cancel(id: string): void {",
  "    this.repo.drop(id);",
  "  }",
  "}",
  "",
  "export function totals(orders: Order[]): number {",
  "  return orders.length;",
  "}",
  "",
  "export const LIMIT = 25;",
  "",
].join("\n");

interface Ctx {
  repo: string;
}

const test = baseTest.extend<Ctx>({
  repo: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "strauss-kb-anchors-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
});

/**
 * Creating a symlink on Windows needs elevation the runner does not have, so
 * the containment cases that need one are POSIX-only — as the bin-symlink
 * cases in `codex-claude-agent` already are. The rule they cover is not
 * platform-specific; only the fixture is.
 */
const onPosix = test.skipIf(process.platform === "win32");

function record(
  conceptId: string,
  anchors: NonNullable<KbRecord["frontmatter"]["strauss_anchors"]>,
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      strauss_status: "accepted",
      strauss_anchors: anchors,
    },
    body: "The body.\n",
  };
}

describe("kbAnchorSchema", () => {
  test("existing anchors keep validating unchanged", () => {
    expect(kbAnchorSchema.parse({ file: "src/a.ts" })).toEqual({
      file: "src/a.ts",
    });
    expect(kbAnchorSchema.parse({ file: "src/a.ts", symbol: "A.b" })).toEqual({
      file: "src/a.ts",
      symbol: "A.b",
    });
  });

  test("accepts hash, resolved_at, and lines", () => {
    const anchor = {
      file: "src/a.ts",
      symbol: "A.b",
      hash: `sha256:${"ab".repeat(32)}`,
      resolved_at: "2026-08-26T10:00:00Z",
      lines: 12,
    };
    expect(kbAnchorSchema.parse(anchor)).toEqual(anchor);
  });

  test("rejects a hash without the algorithm prefix, and non-positive lines", () => {
    expect(
      kbAnchorSchema.safeParse({ file: "src/a.ts", hash: "ab".repeat(32) })
        .success,
    ).toBe(false);
    expect(
      kbAnchorSchema.safeParse({ file: "src/a.ts", lines: 0 }).success,
    ).toBe(false);
  });

  test("stays strict: unknown keys are rejected", () => {
    expect(
      kbAnchorSchema.safeParse({ file: "src/a.ts", line: 12 }).success,
    ).toBe(false);
  });
});

describe("composeInputSchema", () => {
  test("accepts an anchor carrying hash, resolved_at, and lines", () => {
    const parsed = composeInputSchema.parse({
      slug: "the-slug",
      title: "The title",
      why: "The consequence.",
      anchors: [
        {
          file: "src/a.ts",
          symbol: "A.b",
          hash: hashAnchorText("const b = 1;"),
          resolved_at: "2026-08-26T10:00:00Z",
          lines: 1,
        },
      ],
    });
    expect(parsed.anchors?.[0]?.lines).toBe(1);
  });
});

describe("regexResolver", () => {
  test("captures a class block by brace balancing", () => {
    const resolved = regexResolver.resolve(SOURCE, "OrderService");
    expect(resolved).toEqual({
      text: [
        "export class OrderService {",
        "  cancel(id: string): void {",
        "    this.repo.drop(id);",
        "  }",
        "}",
      ].join("\n"),
      startLine: 3,
      endLine: 7,
    });
  });

  test("resolves a dotted symbol on its last segment", () => {
    const resolved = regexResolver.resolve(SOURCE, "OrderService.cancel");
    expect(resolved).toEqual({
      text: [
        "  cancel(id: string): void {",
        "    this.repo.drop(id);",
        "  }",
      ].join("\n"),
      startLine: 4,
      endLine: 6,
    });
  });

  test("captures a function block", () => {
    const resolved = regexResolver.resolve(SOURCE, "totals");
    expect(resolved?.startLine).toBe(9);
    expect(resolved?.endLine).toBe(11);
  });

  test("a braceless declaration is the single matched line", () => {
    const resolved = regexResolver.resolve(SOURCE, "LIMIT");
    expect(resolved).toEqual({
      text: "export const LIMIT = 25;",
      startLine: 13,
      endLine: 13,
    });
  });

  test("returns null for a symbol not in the source", () => {
    expect(regexResolver.resolve(SOURCE, "MissingThing")).toBeNull();
  });

  // A span that stops at the header hashes as stable over every edit to the
  // body — the failure mode that makes a stale anchor read as fresh evidence.
  test("a destructured signature does not end the span on its own braces", () => {
    const source = [
      "export function build({ a, b }: Options): number {",
      "  return a + b;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "build")).toEqual({
      text: source.trimEnd(),
      startLine: 1,
      endLine: 3,
    });
  });

  test("a multi-line signature keeps the span open to the real body", () => {
    const source = [
      "export function build(",
      "  a: number,",
      "  b: number,",
      "): number {",
      "  return a + b;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "build")?.endLine).toBe(6);
  });

  test("a closing brace inside a string or a comment does not end the span", () => {
    const source = [
      "export function render(): string {",
      '  const close = "}";',
      "  // the } here is prose",
      "  /* and the } here",
      "     is still prose } */",
      "  return close;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "render")?.endLine).toBe(7);
  });

  test("a brace inside a template literal does not open or close the span", () => {
    const source = [
      "export function greet(name: string): string {",
      "  return `hello ${name} }`;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "greet")?.endLine).toBe(3);
  });

  // False stability again: an unbalanced brace means the lexer lost the
  // thread, and any span it invents would hash as evidence.
  test("a block left open at end of file is unresolved, not a guess", () => {
    const source = ["export function broken(): void {", "  start();", ""].join(
      "\n",
    );

    expect(regexResolver.resolve(source, "broken")).toBeNull();
  });

  test("a name that is only a substring of another does not match", () => {
    const source = [
      "export function precancel(id: string): void {",
      "  queue(id);",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "cancel")).toBeNull();
  });

  // `findIndex` over one loose pattern used to land on whichever line came
  // first, which for a symbol used above its own definition is a call site.
  test("prefers the declaration over a call site that appears above it", () => {
    const source = [
      "export function boot(): void {",
      "  totals([]);",
      "}",
      "",
      "export function totals(orders: Order[]): number {",
      "  return orders.length;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "totals")?.startLine).toBe(5);
  });

  test("scopes a dotted symbol to the lines under its parent", () => {
    const source = [
      "class Orders {",
      "  cancel(id: string): void {",
      "    this.a(id);",
      "  }",
      "}",
      "",
      "class Invoices {",
      "  cancel(id: string): void {",
      "    this.b(id);",
      "  }",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "Invoices.cancel")?.startLine).toBe(8);
    expect(regexResolver.resolve(source, "Orders.cancel")?.startLine).toBe(2);
  });

  // Two lines of equally good shape mean the resolver cannot tell which one
  // the record meant, and a guessed anchor hashes as evidence.
  test("two declarations of the same name are ambiguous, not a coin flip", () => {
    const source = [
      "function handle(a: number): void {",
      "  a;",
      "}",
      "",
      "function handle(a: string): void {",
      "  a;",
      "}",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "handle")).toBeNull();
  });

  // Brace counting over Python captures the `def` line and nothing else — a
  // signature hash that never sees a body change.
  test("captures a Python block by indentation", () => {
    const source = [
      "import os",
      "",
      "def totals(orders):",
      "    # a comment",
      "    return len(orders)",
      "",
      "def other():",
      "    pass",
      "",
    ].join("\n");

    expect(regexResolver.resolve(source, "totals")).toEqual({
      text: [
        "def totals(orders):",
        "    # a comment",
        "    return len(orders)",
      ].join("\n"),
      startLine: 3,
      endLine: 5,
    });
  });

  test("a Python header with no body under it is unresolved", () => {
    const source = ["def totals(orders):", "", ""].join("\n");

    expect(regexResolver.resolve(source, "totals")).toBeNull();
  });
});

describe("hashAnchorText", () => {
  test("CRLF and LF hash identically", () => {
    expect(hashAnchorText("a\r\nb\r\n")).toBe(hashAnchorText("a\nb\n"));
  });

  test("different text hashes differently, with the algorithm prefix", () => {
    const hash = hashAnchorText("a\n");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash).not.toBe(hashAnchorText("b\n"));
  });
});

describe("resolveAnchor", () => {
  // The trailing newline terminates the last line rather than starting an
  // empty one — counting it would make every whole-file anchor's `lines` one
  // larger than the file, and every `diffSize` off by that much.
  test("an anchor without a symbol is the whole normalized file", () => {
    const resolved = resolveAnchor("a\r\nb\n", { file: "src/a.ts" });
    expect(resolved).toEqual({ text: "a\nb\n", startLine: 1, endLine: 2 });
    expect(resolveAnchor("a\nb", { file: "src/a.ts" })?.endLine).toBe(2);
    expect(resolveAnchor("", { file: "src/a.ts" })?.endLine).toBe(1);
  });

  test("an anchor with a symbol goes through the resolver", () => {
    const resolved = resolveAnchor(SOURCE, {
      file: "src/a.ts",
      symbol: "totals",
    });
    expect(resolved?.startLine).toBe(9);
  });
});

describe("anchorFilePath", () => {
  test("keeps repo-relative paths and strips a leading ./", () => {
    const expected = resolve("/repo", "src", "a.ts");
    expect(anchorFilePath("/repo", "./src/a.ts")).toBe(expected);
    expect(anchorFilePath("/repo", "src/a.ts")).toBe(expected);
  });

  test("rejects traversal, absolute paths, and the root itself", () => {
    expect(anchorFilePath("/repo", "../secret")).toBeNull();
    expect(anchorFilePath("/repo", "src/../../secret")).toBeNull();
    expect(anchorFilePath("/repo", "/etc/passwd")).toBeNull();
    expect(anchorFilePath("/repo", ".")).toBeNull();
  });
});

describe("detectAnchorDrift", () => {
  function stamp(file: string, symbol: string, source: string) {
    const resolved = resolveAnchor(source, { file, symbol });
    if (!resolved) throw new Error(`fixture symbol ${symbol} did not resolve`);
    return {
      file,
      symbol,
      hash: hashAnchorText(resolved.text),
      resolved_at: "2026-08-26T10:00:00Z",
      lines: resolved.endLine - resolved.startLine + 1,
    };
  }

  function write(repo: string, file: string, contents: string) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  test("an unchanged file reports match", async ({ repo }) => {
    write(repo, "src/orders.ts", SOURCE);
    const anchor = stamp("src/orders.ts", "OrderService.cancel", SOURCE);

    const drift = await detectAnchorDrift(
      [record("decision.cancel-path", [anchor])],
      { repoRoot: repo },
    );

    expect(drift.get("decision.cancel-path")).toEqual([
      {
        file: "src/orders.ts",
        symbol: "OrderService.cancel",
        state: "match",
        storedHash: anchor.hash,
        currentHash: anchor.hash,
        diffSize: 0,
      },
    ]);
  });

  test("an edited symbol body reports drifted with a diff size from lines", async ({
    repo,
  }) => {
    const anchor = stamp("src/orders.ts", "OrderService.cancel", SOURCE);
    const edited = SOURCE.replace(
      "    this.repo.drop(id);",
      ["    this.audit(id);", "    this.repo.drop(id);"].join("\n"),
    );
    write(repo, "src/orders.ts", edited);

    const drift = await detectAnchorDrift(
      [record("decision.cancel-path", [anchor])],
      { repoRoot: repo },
    );

    const entry = drift.get("decision.cancel-path")?.[0];
    expect(entry?.state).toBe("drifted");
    expect(entry?.currentHash).not.toBe(anchor.hash);
    expect(entry?.diffSize).toBe(1);
  });

  test("an anchor path escaping the repo root reports unresolved, unread", async ({
    repo,
  }) => {
    const anchor = {
      file: "../outside.ts",
      hash: hashAnchorText(SOURCE),
      resolved_at: "2026-08-26T10:00:00Z",
      lines: 3,
    };
    write(repo, "escape/inside.ts", SOURCE);
    write(repo, "outside.ts", SOURCE);

    const drift = await detectAnchorDrift([record("fact.escape", [anchor])], {
      repoRoot: join(repo, "escape"),
    });

    expect(drift.get("fact.escape")).toEqual([
      {
        file: "../outside.ts",
        state: "unresolved",
        storedHash: anchor.hash,
        diffSize: null,
        reason: "outside-repo",
      },
    ]);
  });

  test("a missing file reports unresolved, not a throw", async ({ repo }) => {
    const anchor = stamp("src/gone.ts", "totals", SOURCE);

    const drift = await detectAnchorDrift([record("fact.gone", [anchor])], {
      repoRoot: repo,
    });

    expect(drift.get("fact.gone")).toEqual([
      {
        file: "src/gone.ts",
        symbol: "totals",
        state: "unresolved",
        storedHash: anchor.hash,
        diffSize: null,
        reason: "file-missing",
      },
    ]);
  });

  test("a symbol no longer in the file reports unresolved", async ({
    repo,
  }) => {
    const anchor = stamp("src/orders.ts", "totals", SOURCE);
    write(repo, "src/orders.ts", "export const LIMIT = 25;\n");

    const drift = await detectAnchorDrift([record("fact.totals", [anchor])], {
      repoRoot: repo,
    });

    expect(drift.get("fact.totals")?.[0]).toMatchObject({
      state: "unresolved",
      reason: "symbol-not-found",
    });
  });

  test("anchors without a hash are not checked", async ({ repo }) => {
    write(repo, "src/orders.ts", SOURCE);

    const drift = await detectAnchorDrift(
      [record("fact.bare", [{ file: "src/orders.ts", symbol: "totals" }])],
      { repoRoot: repo },
    );

    expect(drift.size).toBe(0);
  });

  // Lexical containment passes and the read still escapes: a bundle is
  // untrusted data, and without the realpath re-check `kb_load` would follow
  // an in-repo symlink to probe any file the process can read.
  onPosix("a symlink out of the repo is refused, not followed", async ({
    repo,
  }) => {
    const outside = mkdtempSync(join(tmpdir(), "strauss-kb-outside-"));
    try {
      writeFileSync(join(outside, "secret.ts"), SOURCE, "utf8");
      mkdirSync(join(repo, "src"), { recursive: true });
      symlinkSync(join(outside, "secret.ts"), join(repo, "src", "link.ts"));

      const anchor = { ...stamp("src/link.ts", "totals", SOURCE) };
      const drift = await detectAnchorDrift([record("fact.link", [anchor])], {
        repoRoot: repo,
      });

      expect(drift.get("fact.link")?.[0]).toMatchObject({
        state: "unresolved",
        reason: "outside-repo",
      });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  onPosix("a symlink that stays inside the repo is followed", async ({
    repo,
  }) => {
    write(repo, "src/orders.ts", SOURCE);
    symlinkSync(join(repo, "src", "orders.ts"), join(repo, "src", "alias.ts"));
    const anchor = { ...stamp("src/orders.ts", "totals", SOURCE) };

    const drift = await detectAnchorDrift(
      [record("fact.alias", [{ ...anchor, file: "src/alias.ts" }])],
      { repoRoot: repo },
    );

    expect(drift.get("fact.alias")?.[0]?.state).toBe("match");
  });

  // A permission error or a directory where a file should be is not evidence
  // that code moved. Reporting it as `file-missing` would put a drift finding
  // on a record nothing is wrong with.
  test("a directory where a file should be is unreadable, not missing", async ({
    repo,
  }) => {
    mkdirSync(join(repo, "src", "orders.ts"), { recursive: true });
    const anchor = stamp("src/orders.ts", "totals", SOURCE);

    const drift = await detectAnchorDrift([record("fact.dir", [anchor])], {
      repoRoot: repo,
    });

    expect(drift.get("fact.dir")?.[0]).toMatchObject({
      state: "unresolved",
      reason: "file-unreadable",
    });
  });

  // Anchors point at source. Reading a checked-in artefact into memory on a
  // read path is a cost with no finding behind it.
  test("a file past the size cap is reported rather than read", async ({
    repo,
  }) => {
    write(repo, "src/huge.ts", "x".repeat(MAX_ANCHOR_FILE_BYTES + 1));
    const anchor = {
      file: "src/huge.ts",
      hash: hashAnchorText(SOURCE),
      lines: 3,
    };

    const drift = await detectAnchorDrift([record("fact.huge", [anchor])], {
      repoRoot: repo,
    });

    expect(drift.get("fact.huge")?.[0]).toMatchObject({
      state: "unresolved",
      reason: "file-too-large",
    });
  });

  test("a leading ./ on the anchor path still resolves", async ({ repo }) => {
    write(repo, "src/orders.ts", SOURCE);
    const anchor = {
      ...stamp("src/orders.ts", "totals", SOURCE),
      file: "./src/orders.ts",
    };

    const drift = await detectAnchorDrift([record("fact.dotted", [anchor])], {
      repoRoot: repo,
    });

    expect(drift.get("fact.dotted")?.[0]?.state).toBe("match");
  });
});

// A base read from somewhere other than the tree it describes misses every
// anchored file at once. Reported as drift it would flag the whole base, which
// teaches a reader to ignore the warning.
describe("looksLikeWrongRepoRoot", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    file: "src/a.ts",
    state: "unresolved" as const,
    storedHash: hashAnchorText("x"),
    diffSize: null,
    reason: "file-missing" as const,
    ...over,
  });

  test("is true only when every checked anchor missed its file", () => {
    expect(
      looksLikeWrongRepoRoot(new Map([["fact.a", [entry(), entry()]]])),
    ).toBe(true);
  });

  test("is false once any file was found, and on an empty map", () => {
    expect(
      looksLikeWrongRepoRoot(
        new Map([["fact.a", [entry(), entry({ state: "drifted" })]]]),
      ),
    ).toBe(false);
    expect(
      looksLikeWrongRepoRoot(
        new Map([["fact.a", [entry({ reason: "symbol-not-found" })]]]),
      ),
    ).toBe(false);
    expect(looksLikeWrongRepoRoot(new Map())).toBe(false);
  });
});
