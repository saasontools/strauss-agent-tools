import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:net";
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
        severity: "error",
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

  // Its own base: this one is written to be mid-flight, with a link to a
  // record that does not exist yet, and the suite above shares one bundle.
  describe("typed causal links", () => {
    let links: string;

    const at = (args: string[], stdin = "") =>
      run(["--bundle", links, ...args], stdin);

    const write = (slug: string, extra: Record<string, unknown> = {}) =>
      at(
        ["write", "fact"],
        JSON.stringify({
          slug,
          title: `Fact ${slug}`,
          why: "Something observed.",
          sections: { Claim: "The claim." },
          ...extra,
        }),
      );

    beforeAll(() => {
      links = join(base, "kb-links");
      write("shared-key");
      write("router", {
        links: [{ target: "fact.shared-key", rel: "depends_on" }],
      });
      write("gateway", {
        links: [
          { target: "fact.router", rel: "depends_on" },
          // Written before its target exists — the ordinary case, and the one
          // that must not fail the check.
          { target: "fact.not-yet", rel: "related_to" },
        ],
      });
      // Target-dependant rel: the walk runs ALONG this edge, so changing
      // fact.shared-key reaches fact.downstream.
      write("downstream");
      write("advisory", {
        links: [{ target: "fact.downstream", rel: "informs" }],
      });
    });

    it("refuses a rel outside the closed vocabulary", () => {
      const { status, stderr } = write("bad", {
        links: [{ target: "fact.shared-key", rel: "causes" }],
      });

      expect(status).toBe(1);
      expect(stderr).toContain("strauss-kb: error:");
    });

    it("exits zero when the only findings are warnings", () => {
      const { status, stdout } = at(["validate"]);

      expect(status).toBe(0);
      expect(json(stdout)).toEqual([
        {
          check: "link_target",
          conceptId: "fact.gateway",
          note: "target fact.not-yet is not in the bundle",
          severity: "warning",
        },
      ]);
    });

    it("walks impact transitively, in each rel's direction of dependence", () => {
      const { status, stdout } = at(["impact", "fact.shared-key"]);

      expect(status).toBe(0);
      expect(json(stdout)).toMatchObject({
        root: "fact.shared-key",
        impacted: [
          { conceptId: "fact.router", depth: 1 },
          { conceptId: "fact.gateway", depth: 2 },
        ],
        stopped: [],
        truncated: false,
        unexpanded: [],
      });
    });

    // `advisory informs downstream` puts the dependant at the target, so the
    // walk runs along the edge rather than against it.
    it("follows a target-dependant rel along the edge", () => {
      expect(json(at(["impact", "fact.advisory"]).stdout)).toMatchObject({
        impacted: [{ conceptId: "fact.downstream", depth: 1 }],
      });
      expect(json(at(["impact", "fact.downstream"]).stdout)).toMatchObject({
        impacted: [],
      });
    });

    it("parses --depth and reports the cut", () => {
      expect(
        json(at(["impact", "fact.shared-key", "--depth", "1"]).stdout),
      ).toMatchObject({
        impacted: [{ conceptId: "fact.router", depth: 1 }],
        truncated: true,
        unexpanded: ["fact.router"],
      });
    });

    it("parses a comma-separated --rels", () => {
      expect(
        json(at(["impact", "fact.shared-key", "--rels", "depends_on"]).stdout),
      ).toMatchObject({
        impacted: [{ conceptId: "fact.router" }, { conceptId: "fact.gateway" }],
      });

      // satisfies is a real rel but nothing in this base uses it.
      expect(
        json(at(["impact", "fact.shared-key", "--rels", "satisfies"]).stdout),
      ).toMatchObject({ impacted: [] });
    });

    // Silently empty would be indistinguishable from "nothing breaks".
    it("refuses a --rels the walk cannot follow", () => {
      const unknown = at(["impact", "fact.shared-key", "--rels", "causes"]);
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain("strauss-kb: error:");

      const inert = at(["impact", "fact.shared-key", "--rels", "related_to"]);
      expect(inert.status).toBe(1);
    });

    it("lists backlinks one hop, with the rel and standing", () => {
      const { status, stdout } = at(["backlinks", "fact.router"]);

      expect(status).toBe(0);
      expect(json(stdout)).toMatchObject({
        target: "fact.router",
        backlinks: [
          { from: "fact.gateway", rel: "depends_on", standing: "current" },
        ],
      });
    });
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

// A collector that accepts the connection and never answers. Anything that
// refuses or resets would settle the POST for the wrong reason.
describe("a telemetry collector that never answers", () => {
  let blackHole: Server;
  let home: string;
  let empty: string;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "strauss-kb-telemetry-"));
    empty = mkdtempSync(join(tmpdir(), "strauss-kb-empty-"));
    blackHole = createServer(() => {});
    await new Promise<void>((done) => blackHole.listen(0, "127.0.0.1", done));
  });

  afterAll(() => {
    blackHole.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  });

  it("does not hold the process open", async () => {
    const port = (blackHole.address() as { port: number }).port;
    const started = Date.now();
    const status = await new Promise<number | null>((done, fail) => {
      const child = spawn(
        process.execPath,
        [entry, "--bundle", empty, "validate"],
        {
          env: {
            ...process.env,
            STRAUSS_TELEMETRY: "local",
            STRAUSS_TELEMETRY_DIR: home,
            STRAUSS_TELEMETRY_URL: `http://127.0.0.1:${port}/events`,
          },
          stdio: "ignore",
        },
      );
      child.on("error", fail);
      child.on("close", done);
    });

    expect(status).toBe(0);
    // The POST's own timeout is 2 s; the flush cap is what has to end this.
    expect(Date.now() - started).toBeLessThan(1_500);
  });
});
