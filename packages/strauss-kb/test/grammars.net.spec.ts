import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
 * Loading every grammar is `pnpm grammars check`, which proves each pack in a
 * worker of its own — web-tree-sitter's WASM heap does not survive 36 loads in
 * one thread. Both run in the weekly `grammars-net.yml` workflow, which is
 * where a re-published or withdrawn release surfaces.
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

  test("serves a python grammar hashing as the manifest says", async () => {
    const path = await ensureGrammar("python", { cacheRoot });
    expect(path).not.toBeNull();

    const bytes = readFileSync(path as string);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      manifest.packs["python"]?.wasm.sha256,
    );
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
    for (const [language, pack] of Object.entries(manifest.packs)) {
      const path = await ensureGrammar(language, { cacheRoot });
      if (path === null) {
        failures.push(`${language}: not downloaded`);
        continue;
      }
      const digest = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      if (digest !== pack.wasm.sha256)
        failures.push(`${language}: sha256 ${digest}`);
    }
    expect(failures).toEqual([]);
  }, 900_000);
});
