import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "./compose.js";
import { GITATTRIBUTES_FILE } from "./kb-gitattributes.js";
import { GITIGNORE_FILE } from "./kb-gitignore.js";
import { INDEX_FILE } from "./kb-index.js";
import { pinBase, PINS_FILE, PINS_LOCAL_FILE } from "./kb-pins/index.js";
import { LOG_FILE } from "./kb-log.js";
import { KB_DIR, KbStore } from "./kb-store.js";
import { SEARCH_INDEX_FILE } from "./search-index.js";

/**
 * A real repository, because the question is what git does with the rules,
 * not what the rules say. `check-ignore` is git's own answer.
 */
describe("what git actually excludes", () => {
  let repo: string;
  const store = new KbStore();
  const at = "2026-09-15T00:00:00Z";

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

  /** Git's verdict on one path, by its exit status rather than its output. */
  const ignored = (path: string): boolean => {
    try {
      git("check-ignore", "-q", "--no-index", path);
      return true;
    } catch {
      return false;
    }
  };

  const seed = (bundle: string) =>
    store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "derived-files-are-not-committed",
          title: "Derived files are not committed",
          why: "The search index is rebuilt from the records beside it.",
        },
        "seed",
        at,
      ),
    );

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-check-ignore-"));
    git("init", "-q");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test("the search index and every SQLite sidecar, at the default base", async () => {
    await seed(join(repo, KB_DIR));

    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      expect(ignored(join(KB_DIR, `${SEARCH_INDEX_FILE}${suffix}`))).toBe(true);
    }
  });

  test("the same at a custom base, because the rule travels with it", async () => {
    await seed(join(repo, "docs", "adr"));

    expect(ignored(join("docs", "adr", SEARCH_INDEX_FILE))).toBe(true);
    expect(ignored(join("docs", "adr", `${SEARCH_INDEX_FILE}-wal`))).toBe(true);
    // Anchored, so it excludes its own base and nothing above it.
    expect(ignored(SEARCH_INDEX_FILE)).toBe(false);
  });

  test("everything a reader needs stays trackable", async () => {
    const bundle = join(repo, KB_DIR);
    await seed(bundle);

    for (const file of [
      "fact.derived-files-are-not-committed.md",
      LOG_FILE,
      GITATTRIBUTES_FILE,
      GITIGNORE_FILE,
    ]) {
      expect(ignored(join(KB_DIR, file))).toBe(false);
    }
    // `INDEX.md` is written on read, not on write; it is store-owned and
    // committed all the same.
    await store.list(bundle);
    expect(ignored(join(KB_DIR, INDEX_FILE))).toBe(false);
  });

  test("local pins are excluded and the shared manifest is not", async () => {
    const bundle = join(repo, KB_DIR);
    await seed(bundle);

    await pinBase(store, repo, bundle, at, { layer: "local" });
    await pinBase(store, repo, bundle, at);

    expect(ignored(PINS_LOCAL_FILE)).toBe(true);
    expect(ignored(PINS_FILE)).toBe(false);
  });

  test("a base created outside a repository is written all the same", async () => {
    const outside = mkdtempSync(join(tmpdir(), "strauss-kb-no-repo-"));
    try {
      const written = await seed(join(outside, KB_DIR));

      expect(written.conceptId).toBe("fact.derived-files-are-not-committed");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
