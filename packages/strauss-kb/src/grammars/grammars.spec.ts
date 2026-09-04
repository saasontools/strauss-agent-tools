import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  GRAMMAR_FIXTURES,
  startGrammarsServer,
  type GrammarsServer,
} from "../../test/grammars-server.js";
import { TreeSitterResolver } from "../tree-sitter-resolver/index.js";
import {
  ensureGrammar,
  grammarCachePath,
  grammarHints,
  grammarManifest,
  resetGrammarState,
} from "./index.js";

const manifest = grammarManifest();
const SOURCE = "def cancel(id):\n    return id\n";

let cacheRoot: string;
let server: GrammarsServer;

beforeEach(async () => {
  cacheRoot = mkdtempSync(join(tmpdir(), "strauss-grammars-"));
  server = await startGrammarsServer();
  resetGrammarState();
});

afterEach(async () => {
  await server.close();
  rmSync(cacheRoot, { recursive: true, force: true });
  resetGrammarState();
});

/** The options a test's own server and cache are reached through. */
function options(extra: Record<string, unknown> = {}) {
  return { cacheRoot, baseUrl: server.url, ...extra };
}

function cached(language: string): string {
  return grammarCachePath(
    cacheRoot,
    language,
    manifest.packs[language]?.wasm.sha256 as string,
  );
}

describe("the shipped manifest", () => {
  test("pins a sha256 the fixtures still hash to", () => {
    const fixtures = readdirSync(GRAMMAR_FIXTURES).map((name) =>
      name.slice("tree-sitter-".length, -".wasm".length),
    );
    // Fixtures exist for the languages the suite parses; the lock carries
    // every pack, which is many more.
    expect(fixtures.length).toBeGreaterThan(0);
    for (const language of fixtures) {
      const entry = manifest.packs[language]?.wasm;
      const bytes = readFileSync(
        join(GRAMMAR_FIXTURES, `tree-sitter-${language}.wasm`),
      );
      expect(
        `${language}:${createHash("sha256").update(bytes).digest("hex")}`,
      ).toBe(`${language}:${entry?.sha256}`);
      expect(bytes.byteLength).toBe(entry?.bytes);
    }
  });
});

describe("ensureGrammar", () => {
  test("downloads once, then answers from the cache", async () => {
    expect(await ensureGrammar("python", options())).toBe(cached("python"));
    expect(server.requests).toHaveLength(1);

    resetGrammarState();
    expect(await ensureGrammar("python", options())).toBe(cached("python"));
    expect(server.requests).toHaveLength(1);
  });

  test("concurrent callers share one request", async () => {
    const paths = await Promise.all([
      ensureGrammar("go", options()),
      ensureGrammar("go", options()),
      ensureGrammar("go", options()),
    ]);

    expect(paths).toEqual([cached("go"), cached("go"), cached("go")]);
    expect(server.requests).toHaveLength(1);
  });

  test("bytes that do not match the pinned hash are never written", async () => {
    await server.close();
    server = await startGrammarsServer({ corrupt: true });

    expect(await ensureGrammar("python", options())).toBeNull();
    await expect(readdir(join(cacheRoot, "python"))).rejects.toThrow();
  });

  test("a server error leaves nothing behind", async () => {
    await server.close();
    server = await startGrammarsServer({ status: 500 });

    expect(await ensureGrammar("rust", options())).toBeNull();
    await expect(readdir(join(cacheRoot, "rust"))).rejects.toThrow();
  });

  test("a hanging server times out rather than hanging the run", async () => {
    await server.close();
    server = await startGrammarsServer({ hang: true });

    expect(
      await ensureGrammar("go", options({ fetchTimeoutMs: 50 })),
    ).toBeNull();
  });

  test("a tampered cached file is deleted and downloaded again", async () => {
    await ensureGrammar("go", options());
    writeFileSync(cached("go"), "tampered");
    resetGrammarState();

    expect(await ensureGrammar("go", options())).toBe(cached("go"));
    expect(server.requests).toHaveLength(2);
    expect(readFileSync(cached("go")).byteLength).toBe(
      manifest.packs["go"]?.wasm.bytes,
    );
  });

  test("a miss is not remembered: the next call in the process tries again", async () => {
    expect(await ensureGrammar("go", options({ offline: true }))).toBeNull();
    expect(grammarHints()).toHaveLength(1);

    expect(await ensureGrammar("go", options())).toBe(cached("go"));
    expect(server.requests).toHaveLength(1);
    expect(grammarHints()).toEqual([]);
  });

  test("a language the manifest does not carry is never fetched", async () => {
    expect(await ensureGrammar("haskell", options())).toBeNull();
    expect(server.requests).toHaveLength(0);
  });
});

describe("retrying a download", () => {
  /** The lines a run would have written to stderr. */
  function collect() {
    const lines: string[] = [];
    return { lines, log: (line: string) => void lines.push(line) };
  }

  test("a 5xx is tried three times, then given up on with the cause", async () => {
    await server.close();
    server = await startGrammarsServer({ status: 500 });
    const { lines, log } = collect();

    expect(await ensureGrammar("rust", options({ log }))).toBeNull();
    expect(server.requests).toHaveLength(3);
    expect(lines[0]).toMatch(
      /^strauss-kb: downloading tree-sitter-rust \([\d.]+ [KM]B from manifest\) from http/,
    );
    expect(lines.slice(1)).toEqual([
      "strauss-kb: tree-sitter-rust attempt 1/3 failed: HTTP 500\n",
      "strauss-kb: tree-sitter-rust attempt 2/3 failed: HTTP 500\n",
      "strauss-kb: tree-sitter-rust attempt 3/3 failed: HTTP 500\n",
      "strauss-kb: tree-sitter-rust not downloaded: HTTP 500\n",
    ]);
    expect(grammarHints()).toEqual([
      "grammar tree-sitter-rust not cached (HTTP 500); run online once, or set STRAUSS_KB_GRAMMARS_DIR",
    ]);
  });

  test("a 404 is the CDN's answer, not a hiccup: one request", async () => {
    await server.close();
    server = await startGrammarsServer({ status: 404 });
    const { lines, log } = collect();

    expect(await ensureGrammar("go", options({ log }))).toBeNull();
    expect(server.requests).toHaveLength(1);
    expect(lines.at(-1)).toBe(
      "strauss-kb: tree-sitter-go not downloaded: HTTP 404\n",
    );
  });

  test("bytes that do not hash are never retried", async () => {
    await server.close();
    server = await startGrammarsServer({ corrupt: true });
    const { lines, log } = collect();

    expect(await ensureGrammar("python", options({ log }))).toBeNull();
    expect(server.requests).toHaveLength(1);
    expect(lines.at(-1)).toBe(
      "strauss-kb: tree-sitter-python not downloaded: sha256 mismatch\n",
    );
  });

  test("a timeout is retried, and named as one", async () => {
    await server.close();
    server = await startGrammarsServer({ hang: true });
    const { lines, log } = collect();

    expect(
      await ensureGrammar("go", options({ fetchTimeoutMs: 50, log })),
    ).toBeNull();
    expect(server.requests).toHaveLength(3);
    expect(lines.at(-1)).toBe(
      "strauss-kb: tree-sitter-go not downloaded: timeout\n",
    );
  });

  test("a server that fails once still yields the grammar", async () => {
    await server.close();
    server = await startGrammarsServer({ failFirst: 1 });

    expect(await ensureGrammar("python", options())).toBe(cached("python"));
    expect(server.requests).toHaveLength(2);
    expect(grammarHints()).toEqual([]);
  });
});

describe("staying off the wire", () => {
  test("STRAUSS_KB_GRAMMARS=off with a cold cache asks for nothing", async () => {
    process.env["STRAUSS_KB_GRAMMARS"] = "off";
    try {
      expect(await ensureGrammar("python", options())).toBeNull();
      expect(server.requests).toHaveLength(0);
    } finally {
      delete process.env["STRAUSS_KB_GRAMMARS"];
    }
  });

  test("STRAUSS_KB_GRAMMARS=off with a warm cache still resolves", async () => {
    await ensureGrammar("python", options());
    resetGrammarState();

    process.env["STRAUSS_KB_GRAMMARS"] = "off";
    try {
      expect(await ensureGrammar("python", options())).toBe(cached("python"));
      expect(server.requests).toHaveLength(1);
    } finally {
      delete process.env["STRAUSS_KB_GRAMMARS"];
    }
  });

  test("--offline is the same answer without the env var", async () => {
    expect(
      await ensureGrammar("python", options({ offline: true })),
    ).toBeNull();
    expect(server.requests).toHaveLength(0);

    resetGrammarState();
    await ensureGrammar("python", options());
    resetGrammarState();
    expect(await ensureGrammar("python", options({ offline: true }))).toBe(
      cached("python"),
    );
  });

  test("the hint names the grammar and the repair, once", async () => {
    await ensureGrammar("python", options({ offline: true }));
    await ensureGrammar("python", options({ offline: true }));

    expect(grammarHints()).toEqual([
      "grammar tree-sitter-python not cached; run online once, or set STRAUSS_KB_GRAMMARS_DIR",
    ]);
  });
});

describe("the resolver over a downloaded grammar", () => {
  test("resolves once the grammar arrives", async () => {
    const resolver = new TreeSitterResolver(options());
    await resolver.prepare(["a.py"]);

    expect(resolver.attempt(SOURCE, "cancel", "a.py").kind).toBe("resolved");
    expect(server.requests).toHaveLength(1);
  });

  test("one request when two languages of the same file type prepare at once", async () => {
    const resolver = new TreeSitterResolver(options());
    await Promise.all([resolver.prepare(["a.py"]), resolver.prepare(["b.py"])]);

    expect(server.requests).toHaveLength(1);
  });

  test("offline with a cold cache is resolver-unavailable, not a regex guess", async () => {
    const resolver = new TreeSitterResolver(options({ offline: true }));
    await resolver.prepare(["a.py"]);

    expect(resolver.attempt(SOURCE, "cancel", "a.py")).toEqual({
      kind: "unresolved",
      reason: "resolver-unavailable",
    });
    expect(server.requests).toHaveLength(0);
  });
});
