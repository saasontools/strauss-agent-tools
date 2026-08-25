import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spawns the *built* CLI against a temporary base and drives a real round
// trip. In-process unit tests cover the command implementations; what only a
// spawn can catch is the packaging around them — a missing shebang, a
// non-executable bit, an ESM specifier that does not resolve once compiled,
// and the exit codes a shell caller actually branches on.
const entry = resolve(process.env.CLI_ENTRY ?? "dist/cli-main.js");

let base: string;
let bundle: string;

function run(args: string[], stdin = "") {
  const result = spawnSync(process.execPath, [entry, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, STRAUSS_KB_ACTOR: "cli-round-trip" },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function kb(args: string[], stdin = "") {
  return run(["--bundle", bundle, ...args], stdin);
}

function json(stdout: string): unknown {
  return JSON.parse(stdout) as unknown;
}

const RECORD = {
  slug: "cache-key-includes-region",
  title: "The cache key includes the region",
  why: "A region-less key serves one region another region's data.",
  sections: {
    Claim: "Every cache key is prefixed with the region.",
    Evidence: "The fill path reads the region from the request context.",
  },
  anchors: [{ file: "src/cache/order-cache.ts", symbol: "OrderCache.get" }],
};

describe("built CLI round trip", () => {
  beforeAll(() => {
    if (!existsSync(entry)) {
      throw new Error(`CLI entry not found at ${entry} — run \`pnpm build\`.`);
    }
    base = mkdtempSync(join(tmpdir(), "strauss-kb-cli-"));
    // Deliberately absent: the first write is what brings a base into being,
    // so pointing at a directory that does not exist is the starting state.
    bundle = join(base, "kb");
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("prints usage and exits zero with no arguments", () => {
    const { status, stdout } = run([]);

    expect(status).toBe(0);
    expect(stdout).toContain("strauss-kb — knowledge base commands");
    expect(stdout).toContain("write <type> < record.json");
  });

  it("creates the base on first write and reports the concept id", () => {
    expect(existsSync(bundle)).toBe(false);

    const { status, stdout } = kb(["write", "fact"], JSON.stringify(RECORD));

    expect(status).toBe(0);
    expect(json(stdout)).toEqual({
      conceptId: "fact.cache-key-includes-region",
      action: "created",
      supersededIds: [],
    });
    expect(
      readFileSync(join(bundle, "fact.cache-key-includes-region.md"), "utf8"),
    ).toContain("type: fact");
  });

  it("queries the record back with its standing attached", () => {
    const { status, stdout } = kb(["query", "prefixed with the region"]);

    expect(status).toBe(0);
    expect(json(stdout)).toMatchObject([
      {
        conceptId: "fact.cache-key-includes-region",
        title: "The cache key includes the region",
        standing: "current",
        supersededBy: [],
      },
    ]);
  });

  it("lists the record and rebuilds the index from it", () => {
    expect(json(kb(["list"]).stdout)).toMatchObject([
      { conceptId: "fact.cache-key-includes-region", status: "accepted" },
    ]);

    const index = kb(["index"]);
    expect(index.status).toBe(0);
    expect(index.stdout).toContain("fact.cache-key-includes-region.md");
  });

  it("names the writer from the environment in the log", () => {
    const { entries } = json(kb(["log"]).stdout) as {
      entries: { by: string; operation: string; conceptId: string }[];
    };

    expect(entries).toEqual([
      {
        at: expect.any(String) as unknown as string,
        by: "cli-round-trip",
        operation: "write",
        conceptId: "fact.cache-key-includes-region",
      },
    ]);
  });

  it("validates a clean base with an empty report and exit zero", () => {
    const { status, stdout } = kb(["validate"]);

    expect(status).toBe(0);
    expect(json(stdout)).toEqual([]);
  });

  // A check that reports a problem has succeeded as a command and failed as a
  // check; a shell caller can only tell the two apart through the exit code.
  it("exits non-zero when validate finds a problem", () => {
    kb(["status", "fact.cache-key-includes-region", "superseded"]);

    const { status, stdout } = kb(["validate"]);

    expect(status).toBe(1);
    expect(json(stdout)).toEqual([
      {
        check: "superseded_by",
        conceptId: "fact.cache-key-includes-region",
        note: "superseded with no replacement",
      },
    ]);
  });

  it("rejects an unknown command on stderr with a non-zero exit", () => {
    const { status, stderr } = kb(["explain"]);

    expect(status).toBe(1);
    expect(stderr).toContain("unknown command explain");
  });

  it("reports a schema violation without a stack trace", () => {
    const { status, stderr } = kb(["write", "fact"], '{"slug":"no-title"}');

    expect(status).toBe(1);
    expect(stderr).toContain("strauss-kb: error:");
    expect(stderr).not.toContain("at Object.");
  });

  it("emits the JSON Schema for the format without touching a base", () => {
    const { status, stdout } = run(["schema"]);

    expect(status).toBe(0);
    expect(Object.keys(json(stdout) as object).sort()).toEqual([
      "composeInput",
      "logEntry",
      "recordFrontmatter",
    ]);
  });
});
