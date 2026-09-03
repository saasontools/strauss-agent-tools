import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  anchorFileReader,
  hashAnchorText,
  type AnchorFileReader,
} from "../anchor-resolver.js";
import type { KbAnchor } from "../kb-record.schema.js";
import { TreeSitterResolver } from "../tree-sitter-resolver.js";
import { movedSearch } from "./moved.js";

/** Counts the repository listings, so "shared across anchors" is checkable. */
const listings: string[] = [];
vi.mock("./git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./git.js")>();
  return {
    ...actual,
    listRepoFiles: (repoRoot: string) => {
      listings.push(repoRoot);
      return actual.listRepoFiles(repoRoot);
    },
  };
});

/**
 * The `moved` search is the one pass whose cost scales with the repository
 * rather than with the record, so what it *does not* read matters as much as
 * what it finds.
 */

const SPAN = [
  "export function totals(orders: Order[]): number {",
  "  return orders.length;",
  "}",
].join("\n");

describe("movedSearch", () => {
  let repo: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-moved-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
  });

  afterEach(() => {
    listings.length = 0;
    rmSync(repo, { recursive: true, force: true });
  });

  function write(file: string, contents: string): void {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), contents, "utf8");
  }

  /** The reader, plus the list of files it was actually asked for. */
  function countingReader(): {
    reader: AnchorFileReader;
    reads: string[];
  } {
    const inner = anchorFileReader(repo);
    const reads: string[] = [];
    return {
      reads,
      reader: (file) => {
        reads.push(file);
        return inner(file);
      },
    };
  }

  const rawAnchor = (extra: Partial<KbAnchor> = {}): KbAnchor => ({
    file: "src/orders.ts",
    symbol: "totals",
    hash: hashAnchorText(SPAN),
    lines: 3,
    ...extra,
  });

  test("stops reading once the hash is found, well short of the repository", async () => {
    // 300 same-language candidates; the match is the third of them. A search
    // that read every file to answer would read all 300.
    write("src/a002-hit.ts", `${SPAN}\n`);
    for (let at = 0; at < 320; at++) {
      if (at === 2) continue;
      write(
        `src/a${String(at).padStart(3, "0")}.ts`,
        `export function noise${at}(): number {\n  return ${at};\n}\n`,
      );
    }
    git("add", "-A");
    git("commit", "-qm", "seed");

    const { reader, reads } = countingReader();
    const started = Date.now();
    const found = await movedSearch(repo, { reader }).find(rawAnchor());
    const elapsed = Date.now() - started;

    expect(found).toMatchObject({ file: "src/a002-hit.ts", symbol: "totals" });
    // One batch, not the repository.
    expect(reads.length).toBeLessThanOrEqual(64);
    expect(reads).not.toContain("src/a300.ts");
    expect(elapsed).toBeLessThan(1_000);
  });

  test("a file too small to hold the span is never read", async () => {
    write("src/tiny.ts", "const a = 1;\n");
    write("src/hit.ts", `${SPAN}\n`);
    git("add", "-A");
    git("commit", "-qm", "seed");

    const { reader, reads } = countingReader();
    // Bigger than `src/tiny.ts`, smaller than the file that carries the span.
    const found = await movedSearch(repo, { reader }).find(
      rawAnchor({ lines: 40 }),
    );

    expect(found).toMatchObject({ file: "src/hit.ts" });
    expect(reads).not.toContain("src/tiny.ts");
  });

  test("one search lists the repository once, however many anchors ask", async () => {
    write("src/hit.ts", `${SPAN}\n`);
    for (let at = 0; at < 10; at++) {
      write(`src/n${at}.ts`, `export const n${at} = ${at};\n`);
    }
    git("add", "-A");
    git("commit", "-qm", "seed");

    const search = movedSearch(repo);
    await search.find(rawAnchor());
    await search.find(rawAnchor({ symbol: "other" }));

    // One `git ls-files`, one set of loaded grammars, one parse cache — which
    // is what makes a sweep over many drifted records affordable.
    expect(listings).toEqual([repo]);
  });

  test("a fresh search per record would list it again", async () => {
    write("src/hit.ts", `${SPAN}\n`);
    git("add", "-A");
    git("commit", "-qm", "seed");

    await movedSearch(repo).find(rawAnchor());
    await movedSearch(repo).find(rawAnchor());

    expect(listings).toEqual([repo, repo]);
  });

  test("an ast hash on a file with no grammar claims nothing", async () => {
    // A `.md` file has no grammar, so there is no token stream to compare an
    // `ast` hash against. Falling back to the raw window scan would compare
    // two different measurements and call the mismatch a move.
    write("notes/design.md", `${SPAN}\n`);
    git("add", "-A");
    git("commit", "-qm", "seed");

    const found = await movedSearch(repo).find(
      rawAnchor({ file: "notes/design.md", hash_kind: "ast" }),
    );

    expect(found).toBeUndefined();
  });

  test("an ast hash is compared against the token stream, never raw text", async () => {
    // The same program, reformatted, in another file: the raw bytes differ and
    // the token streams do not, so an `ast`-hashed anchor still finds it.
    const resolver = new TreeSitterResolver();
    await resolver.prepare(["src/orders.ts"]);
    const tokens = resolver.normalize(SPAN, "src/orders.ts") as string;
    write(
      "src/billing.ts",
      "export function totals(orders: Order[]): number {\n\n      return orders.length;\n}\n",
    );
    git("add", "-A");
    git("commit", "-qm", "seed");

    const found = await movedSearch(repo).find(
      rawAnchor({ hash: hashAnchorText(tokens), hash_kind: "ast" }),
    );

    expect(found).toMatchObject({ file: "src/billing.ts", symbol: "totals" });
  });
});
