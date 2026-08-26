/* eslint-disable no-empty-pattern -- vitest fixtures require object destructuring */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test as baseTest } from "vitest";
import {
  anchorFilePath,
  detectAnchorDrift,
  hashAnchorText,
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
  test("an anchor without a symbol is the whole normalized file", () => {
    const resolved = resolveAnchor("a\r\nb\n", { file: "src/a.ts" });
    expect(resolved).toEqual({ text: "a\nb\n", startLine: 1, endLine: 3 });
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
