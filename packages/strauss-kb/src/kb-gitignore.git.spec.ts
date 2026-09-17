import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "./compose.js";
import { GITATTRIBUTES_FILE } from "./kb-gitattributes.js";
import { GITIGNORE_FILE, SEARCH_INDEX_RULE } from "./kb-gitignore.js";
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
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      // A synchronous spawn cannot be interrupted by vitest's own timeout, so
      // a stuck git would hang the worker rather than fail the test.
      timeout: 30_000,
    });

  /**
   * Git's verdict on each path, in one spawn. `--non-matching -v` answers for
   * every path, so exit 1 (nothing matched) is an answer and anything else is
   * a git failure this suite must not read as "not ignored".
   */
  const ignored = (...paths: string[]): boolean[] => {
    let out: string;
    try {
      out = git("check-ignore", "--no-index", "-v", "--non-matching", ...paths);
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      if (failure.status !== 1) throw error;
      out = failure.stdout ?? "";
    }
    const verdicts = new Map(
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [source, path] = line.split("\t");
          return [path, source !== "::"] as const;
        }),
    );
    return paths.map((path) => {
      const verdict = verdicts.get(path);
      if (verdict === undefined)
        throw new Error(`git said nothing about ${path}`);
      return verdict;
    });
  };

  /** Forward slashes: git echoes the path back, and the parse must match. */
  const rel = (...segments: string[]) => segments.join("/");

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

    const base = KB_DIR.split(sep).join("/");
    expect(
      ignored(
        ...["", "-wal", "-shm", "-journal"].map((suffix) =>
          rel(base, `${SEARCH_INDEX_FILE}${suffix}`),
        ),
      ),
    ).toEqual([true, true, true, true]);
  });

  test("the same at a custom base, because the rule travels with it", async () => {
    await seed(join(repo, "docs", "adr"));

    expect(
      ignored(
        rel("docs", "adr", SEARCH_INDEX_FILE),
        rel("docs", "adr", `${SEARCH_INDEX_FILE}-wal`),
        // Anchored, so it excludes its own base and nothing above it.
        SEARCH_INDEX_FILE,
      ),
    ).toEqual([true, true, false]);
  });

  test("everything a reader needs stays trackable", async () => {
    const bundle = join(repo, KB_DIR);
    await seed(bundle);
    // `INDEX.md` is written on read, not on write; it is store-owned and
    // committed all the same.
    await store.list(bundle);

    const base = KB_DIR.split(sep).join("/");
    expect(
      ignored(
        ...[
          "fact.derived-files-are-not-committed.md",
          LOG_FILE,
          GITATTRIBUTES_FILE,
          GITIGNORE_FILE,
          INDEX_FILE,
        ].map((file) => rel(base, file)),
      ),
    ).toEqual([false, false, false, false, false]);
  });

  test("local pins are excluded and the shared manifest is not", async () => {
    const bundle = join(repo, KB_DIR);
    await seed(bundle);

    await pinBase(store, repo, bundle, at, { layer: "local" });
    await pinBase(store, repo, bundle, at);

    expect(
      ignored(
        PINS_LOCAL_FILE.split(sep).join("/"),
        PINS_FILE.split(sep).join("/"),
      ),
    ).toEqual([true, false]);
  });

  // The reader and git must agree on what an existing line already covers, or
  // the rule is skipped over a pattern git gives no meaning to.
  test("a leading-whitespace pattern settles nothing, for git or for us", async () => {
    const bundle = join(repo, KB_DIR);
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, GITIGNORE_FILE), `  *${SEARCH_INDEX_FILE}*\n`);

    await seed(bundle);

    const base = KB_DIR.split(sep).join("/");
    expect(ignored(rel(base, SEARCH_INDEX_FILE))).toEqual([true]);
    expect(readFileSync(join(bundle, GITIGNORE_FILE), "utf8")).toContain(
      SEARCH_INDEX_RULE.pattern,
    );
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
