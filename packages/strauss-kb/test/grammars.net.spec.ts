import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Language, Parser, Query } from "web-tree-sitter";
import {
  ensureGrammar,
  grammarManifest,
  resetGrammarState,
} from "../src/grammars/index.js";
import { TreeSitterResolver } from "../src/tree-sitter-resolver/index.js";

/**
 * The tests that reach the real CDN, so the pinned hashes are checked against
 * what the CDN actually serves rather than against the fixtures, and the
 * download path is exercised end to end.
 *
 * Every pack is also loaded together here, the way `pnpm grammars check`
 * does: a grammar built at an ABI the pinned web-tree-sitter does not accept,
 * or by a toolchain that corrupts the shared WASM heap, only shows up with the
 * others resident. Both run in the weekly `grammars-net.yml` workflow, which
 * is where a re-published or withdrawn release surfaces.
 *
 * Off by default and out of CI's way: `pnpm test` must pass unplugged.
 */
const enabled = process.env["STRAUSS_KB_NET_TESTS"] === "1";

describe.skipIf(!enabled)("the real CDN", () => {
  const manifest = grammarManifest();
  let cacheRoot: string;
  let url: string | undefined;

  beforeAll(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "strauss-grammars-net-"));
    // The suite's setup file points every other test at a local server.
    url = process.env["STRAUSS_KB_GRAMMARS_URL"];
    delete process.env["STRAUSS_KB_GRAMMARS_URL"];
    resetGrammarState();
  });

  afterAll(() => {
    if (url !== undefined) process.env["STRAUSS_KB_GRAMMARS_URL"] = url;
    rmSync(cacheRoot, { recursive: true, force: true });
    resetGrammarState();
  });

  test("serves a python pack hashing as the manifest says", async () => {
    const pack = await ensureGrammar("python", { cacheRoot });
    expect(pack).not.toBeNull();

    const bytes = readFileSync(pack?.wasm as string);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      manifest.packs["python"]?.wasm.sha256,
    );
    expect(pack?.query).toContain("@definition.function");
  });

  test("and that grammar parses", async () => {
    const resolver = new TreeSitterResolver({ cacheRoot });
    await resolver.prepare(["a.py"]);

    expect(
      resolver.attempt("def cancel(id):\n    return id\n", "cancel", "a.py"),
    ).toEqual({
      kind: "resolved",
      span: {
        text: "def cancel(id):\n    return id",
        startLine: 1,
        endLine: 2,
      },
    });
  });

  test("and every pinned grammar downloads and hashes as the lock says", async () => {
    const failures: string[] = [];
    for (const [language, entry] of Object.entries(manifest.packs)) {
      const pack = await ensureGrammar(language, { cacheRoot });
      if (pack === null) {
        failures.push(`${language}: not downloaded`);
        continue;
      }
      const digest = createHash("sha256")
        .update(readFileSync(pack.wasm))
        .digest("hex");
      if (digest !== entry.wasm.sha256)
        failures.push(`${language}: sha256 ${digest}`);
      if (Boolean(pack.query) !== entry.tags.length > 0)
        failures.push(`${language}: query ${pack.query ? "extra" : "missing"}`);
    }
    expect(failures).toEqual([]);
  }, 900_000);

  test("and every pinned grammar loads and parses in one process", async () => {
    await Parser.init();
    const parser = new Parser();
    const failures: string[] = [];
    for (const language of Object.keys(manifest.packs)) {
      const pack = await ensureGrammar(language, { cacheRoot });
      try {
        const grammar = await Language.load(pack?.wasm as string);
        if (pack?.query) new Query(grammar, pack.query);
        parser.setLanguage(grammar);
        if (!parser.parse("a b\n"))
          failures.push(`${language}: parsed to nothing`);
      } catch (error) {
        failures.push(`${language}: ${(error as Error).message || "rejected"}`);
      }
    }
    parser.delete();
    expect(failures).toEqual([]);
  }, 900_000);
});
