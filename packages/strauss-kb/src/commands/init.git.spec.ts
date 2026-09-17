import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "../compose.js";
import { GITATTRIBUTES_FILE } from "../kb-gitattributes.js";
import { GITIGNORE_FILE } from "../kb-files.js";
import { initCommand } from "./init.js";
import { LOG_FILE } from "../kb-log.js";
import { KB_DIR, KbStore } from "../kb-store.js";
import { SEARCH_INDEX_FILE } from "../search-index.js";

/**
 * The block is a guess about what git does with a pattern until git is asked.
 * That is the whole job here — not the store's write path, which the unit
 * suites cover.
 */
describe("what git actually excludes", () => {
  let repo: string;
  let emptyConfig: string;
  const store = new KbStore();

  /**
   * Scoped config: check-ignore reads `core.excludesFile` like any other git
   * command, so a contributor whose personal excludes hold `*.sqlite*` would
   * run this green with nothing written. Not the null device — git rejects it
   * as a config path on Windows, where this suite also runs.
   */
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: emptyConfig,
        GIT_CONFIG_SYSTEM: emptyConfig,
      },
    });

  /** Git's verdict on each path, in one spawn. */
  const ignored = (...paths: string[]): boolean[] => {
    let out: string;
    try {
      out = git("check-ignore", "--no-index", "-v", "--non-matching", ...paths);
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      // 1 is "nothing matched" — an answer. Anything else is a git failure,
      // which must not read as "not ignored".
      if (failure.status !== 1) throw error;
      out = failure.stdout ?? "";
    }
    const verdicts = new Map(
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [match, path] = line.split("\t");
          const pattern = /^.*:\d+:(.*)$/.exec(match ?? "")?.[1];
          return [path, pattern !== undefined && !pattern.startsWith("!")];
        }),
    );
    return paths.map((path) => {
      const verdict = verdicts.get(path);
      if (verdict === undefined)
        throw new Error(`git said nothing about ${path}`);
      return verdict;
    });
  };

  const rel = (...segments: string[]) => segments.join("/");
  const base = KB_DIR.split(sep).join("/");
  const at = "2026-09-15T00:00:00Z";

  /** `init` writes the block; the record is what a base is otherwise for. */
  const seed = async (bundle: string) => {
    await initCommand.run(
      { store, actor: "agent:tester", now: () => at },
      initCommand.input.parse({ bundlePath: bundle }),
    );
    return store.write(
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
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-check-ignore-"));
    emptyConfig = join(repo, "empty.gitconfig");
    writeFileSync(emptyConfig, "");
    git("init", "-q");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test("the index and every SQLite sidecar, and nothing a reader needs", async () => {
    const bundle = join(repo, KB_DIR);
    await seed(bundle);
    // `INDEX.md` is written on read, not on write.
    await store.list(bundle);

    expect(
      ignored(
        ...["", "-wal", "-shm", "-journal"].map((suffix) =>
          rel(base, `${SEARCH_INDEX_FILE}${suffix}`),
        ),
        rel(base, "fact.derived-files-are-not-committed.md"),
        rel(base, LOG_FILE),
        rel(base, GITATTRIBUTES_FILE),
        rel(base, GITIGNORE_FILE),
      ),
    ).toEqual([true, true, true, true, false, false, false, false]);
  });

  test("a custom base excludes its own, and nothing above it", async () => {
    await seed(join(repo, "docs", "adr"));

    expect(
      ignored(rel("docs", "adr", SEARCH_INDEX_FILE), SEARCH_INDEX_FILE),
    ).toEqual([true, false]);
  });
});
