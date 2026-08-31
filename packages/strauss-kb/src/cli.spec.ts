import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runKbCli } from "./cli.js";
import { composeRecord } from "./compose.js";
import { KbStore } from "./kb-store.js";

/**
 * The dispatcher, in process. `test/cli.spec.ts` spawns the built binary and so
 * covers packaging; this covers behaviour — the argv adapters, the exit codes,
 * and the paths that end in `process.exit`, which a spawn can only observe from
 * the outside.
 */
type Run = { stdout: string; stderr: string; exitCode: number | undefined };

const EXIT = Symbol("process.exit");

async function cli(args: string[]): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const out = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    });
  const err = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });
  // `die()` ends the process; in process that has to become a throw, or the
  // test runner is the thing that exits.
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw EXIT;
  });

  process.exitCode = undefined;
  let exitCode: number | undefined;
  try {
    await runKbCli(args);
  } catch (error) {
    if (error !== EXIT) throw error;
  } finally {
    exitCode = process.exitCode;
    // Left set, it would fail the whole vitest run at the end.
    process.exitCode = undefined;
    out.mockRestore();
    err.mockRestore();
    exit.mockRestore();
  }
  return { stdout, stderr, exitCode };
}

describe("runKbCli", () => {
  let bundle: string;

  beforeEach(async () => {
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-cli-unit-"));
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "cache-key-includes-region",
          title: "The cache key includes the region",
          why: "A region-less key serves the wrong region's data.",
          sections: { Claim: "Every key is prefixed with the region." },
          anchors: [{ file: "src/cache/order-cache.ts" }],
        },
        "seed",
        "2026-08-01T00:00:00Z",
      ),
    );
    await store.write(
      bundle,
      composeRecord(
        "open-question",
        {
          slug: "retry-scope",
          title: "Which failures should the client retry?",
          why: "Scope decides how much of the client needs a backoff.",
          anchors: [{ file: "src/cache/order-cache.ts" }],
        },
        "seed",
        "2026-08-01T01:00:00Z",
      ),
    );
  });

  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  const at = (args: string[]) => cli(["--bundle", bundle, ...args]);
  const parsed = (run: Run) => JSON.parse(run.stdout) as unknown;

  test("prints usage for no command, -h and --help", async () => {
    for (const args of [[], ["-h"], ["--help"]]) {
      const run = await cli(args);
      expect(run.stdout).toContain("Usage: strauss-kb [--bundle PATH]");
      expect(run.exitCode).toBeUndefined();
    }
  });

  // Descriptions are written for an MCP client and run to paragraphs. The
  // usage listing takes one sentence of each, capped, so a multi-line
  // description cannot spill into the column layout.
  test("reduces a paragraph-long description to one capped sentence", async () => {
    const { stdout } = await cli([]);
    const summaries = stdout
      .split("\n")
      .filter((line) => line.startsWith("  ") && line.includes("  ", 2))
      .map((line) => line.trimStart().replace(/^\S+(\s+\S+)*?\s{2,}/, ""));

    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.length).toBeLessThanOrEqual(78);
    }
    // `write` opens with a sentence far past the cap, so it is the one elided.
    expect(stdout).toContain("…");
  });

  test("rejects an unknown command", async () => {
    const run = await cli(["explain"]);

    expect(run.stderr).toContain("unknown command explain");
    expect(run.stdout).toBe("");
  });

  test("rejects --bundle with no path after it", async () => {
    const run = await cli(["--bundle"]);

    expect(run.stderr).toContain("--bundle requires a path");
  });

  test("reports which field failed validation", async () => {
    const run = await at(["status", "fact.cache-key-includes-region", "nope"]);

    expect(run.stderr).toContain("status:");
    expect(run.stderr).toContain("status");
  });

  test("verifies a record through --note", async () => {
    expect(
      parsed(
        await at([
          "verify",
          "fact.cache-key-includes-region",
          "--note",
          "Re-checked the claim against the cache module.",
        ]),
      ),
    ).toEqual({ conceptId: "fact.cache-key-includes-region", verified: 1 });
  });

  // A verification without findings is a rubber stamp; the note is required
  // and required to say something.
  test("rejects a verify with a missing, empty, or whitespace-only note", async () => {
    for (const args of [
      ["verify", "fact.cache-key-includes-region"],
      ["verify", "fact.cache-key-includes-region", "--note", ""],
      ["verify", "fact.cache-key-includes-region", "--note", "   "],
    ]) {
      const run = await at(args);
      expect(run.stderr).toContain("verify: note:");
      expect(run.stdout).toBe("");
    }
  });

  test("defaults the base to the working directory", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(join(bundle, ".."));
    try {
      // `.strauss/kb` under that directory holds nothing, which is the point:
      // the command resolves and answers rather than failing on the default.
      expect(parsed(await cli(["list"]))).toEqual([]);
    } finally {
      cwd.mockRestore();
    }
  });

  test("lists, indexes and logs the seeded base", async () => {
    expect(parsed(await at(["list"]))).toMatchObject([
      { conceptId: "fact.cache-key-includes-region", status: "accepted" },
      { conceptId: "open-question.retry-scope", status: "open" },
    ]);
    expect(parsed(await at(["list", "fact"]))).toHaveLength(1);

    const index = await at(["index"]);
    expect(index.stdout).toContain("# KB Index");

    expect(parsed(await at(["log"]))).toMatchObject({
      entries: [{ operation: "write" }, { operation: "write" }],
      malformed: [],
    });
  });

  test("queries with a text argument and flags standing", async () => {
    expect(
      parsed(await at(["query", "prefixed", "with", "the", "region"])),
    ).toMatchObject([
      { conceptId: "fact.cache-key-includes-region", standing: "current" },
    ]);
  });

  test("loads the whole base, and refuses past the budget", async () => {
    expect(parsed(await at(["load"]))).toMatchObject({
      loaded: true,
      recordCount: 2,
    });
    expect(parsed(await at(["load", "fact"]))).toMatchObject({
      recordCount: 1,
    });
    expect(parsed(await at(["load", "--budget", "1"]))).toMatchObject({
      loaded: false,
    });
  });

  test("--all loads regardless of budget, and is rejected alongside --budget", async () => {
    expect(parsed(await at(["load", "--all"]))).toMatchObject({
      loaded: true,
      recordCount: 2,
      budgetTokens: null,
    });

    const run = await at(["load", "--all", "--budget", "1"]);
    expect(run.stderr).toContain(
      "(root): all and budgetTokens are mutually exclusive",
    );
  });

  test("--all still resolves a positional type", async () => {
    expect(parsed(await at(["load", "fact", "--all"]))).toMatchObject({
      loaded: true,
      recordCount: 1,
    });
  });

  describe("pack", () => {
    const root = "fact.cache-key-includes-region";

    // Extends the seeded pair to three depths from the root: the question sits
    // one anchor hop out, and the decision that supersedes it one supersession
    // hop past that.
    async function seedDecisionRing(): Promise<void> {
      const store = new KbStore();
      await store.write(
        bundle,
        composeRecord(
          "decision",
          {
            slug: "retry-timeouts-only",
            title: "Retry timeouts only",
            why: "Retrying every failure repeats non-idempotent writes.",
          },
          "seed",
          "2026-08-02T00:00:00Z",
        ),
      );
      await store.supersede(
        bundle,
        "open-question.retry-scope",
        "decision.retry-timeouts-only",
        "seed",
      );
    }

    test("packs the neighbourhood with a header, ranked records, and stubs", async () => {
      await seedDecisionRing();

      const run = await at(["pack", root]);

      expect(run.exitCode).toBeUndefined();
      expect(run.stdout).toContain(`# KB Pack — ${root}`);
      expect(run.stdout).toContain(`bundle: ${bundle}`);
      expect(run.stdout).toMatch(/^budget: ~\d+ of 25000 tokens, 3 records$/m);
      expect(run.stdout).toMatch(
        /^packed: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/m,
      );
      expect(run.stdout).toContain("## Records (2)");
      expect(run.stdout).toContain("Every key is prefixed with the region.");
      // The superseded question is a stub pointing at its head, not a body.
      expect(run.stdout).toContain("## Superseded (1)");
      expect(run.stdout).toContain(
        "- open-question.retry-scope → decision.retry-timeouts-only",
      );
      expect(run.stdout).not.toContain(
        "Scope decides how much of the client needs a backoff.",
      );
    });

    test("keeps the timestamp in the header: the body is byte-identical across runs", async () => {
      await seedDecisionRing();
      const body = (stdout: string) =>
        stdout.slice(stdout.indexOf("\n", stdout.indexOf("\npacked: ") + 1));

      const first = await at(["pack", root]);
      const second = await at(["pack", root]);

      expect(body(first.stdout)).toContain("## Records");
      expect(body(second.stdout)).toBe(body(first.stdout));
      // The timestamp appears in the header and nowhere else.
      expect(body(first.stdout)).not.toContain("packed:");
    });

    test("--hops and --max-nodes cut the walk and name every cut id", async () => {
      await seedDecisionRing();

      // One hop keeps the question (as a stub — it is superseded) and cuts
      // the decision two hops out.
      const hopped = await at(["pack", root, "--hops", "1"]);
      expect(hopped.stdout).toContain("## Records (1)");
      expect(hopped.stdout).toContain("## Superseded (1)");
      expect(hopped.stdout).toContain("## Excluded (1)");
      expect(hopped.stdout).toContain("- decision.retry-timeouts-only");

      const capped = await at(["pack", root, "--max-nodes", "1"]);
      expect(capped.stdout).toContain("## Records (1)");
      expect(capped.stdout).toContain("## Excluded (2)");
      expect(capped.stdout).toContain("- open-question.retry-scope");
    });

    // The refusal reaches the caller as the typed error — count, tokens,
    // budget and every already-cut id in `details` — with no partial pack on
    // stdout for it to mistake for a complete one.
    test("refuses past the budget with the typed error and no partial output", async () => {
      await seedDecisionRing();
      let stdout = "";
      const out = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          stdout += String(chunk);
          return true;
        });

      try {
        await expect(
          runKbCli([
            "--bundle",
            bundle,
            "pack",
            root,
            "--max-nodes",
            "1",
            "--budget",
            "1",
          ]),
        ).rejects.toMatchObject({
          name: "KbPackBudgetExceededError",
          details: {
            budgetTokens: 1,
            excluded: [
              "decision.retry-timeouts-only",
              "open-question.retry-scope",
            ],
          },
        });
      } finally {
        out.mockRestore();
      }
      expect(stdout).toBe("");
    });

    test("rejects an unknown root", async () => {
      await expect(
        runKbCli(["--bundle", bundle, "pack", "fact.no-such-record"]),
      ).rejects.toMatchObject({ name: "KbRecordNotFoundError" });
    });
  });

  test("traces from a seed, narrowing to named edges", async () => {
    expect(
      parsed(await at(["trace", "fact.cache-key-includes-region", "anchor"])),
    ).toMatchObject([
      { conceptId: "fact.cache-key-includes-region", depth: 0, via: [] },
      { conceptId: "open-question.retry-scope", depth: 1, via: ["anchor"] },
    ]);
  });

  test("answers a question and moves a status", async () => {
    expect(
      parsed(
        await at(["answer", "open-question.retry-scope", "Timeouts", "only."]),
      ),
    ).toEqual({ conceptId: "open-question.retry-scope" });

    expect(
      parsed(await at(["status", "fact.cache-key-includes-region", "draft"])),
    ).toEqual({
      conceptId: "fact.cache-key-includes-region",
      status: "draft",
    });
  });

  test("supersedes one record with another, both ways", async () => {
    const store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "cache-key-includes-account-and-region",
          title: "The cache key includes both",
          why: "Region alone still collides between accounts.",
        },
        "seed",
        "2026-08-02T00:00:00Z",
      ),
    );

    expect(
      parsed(
        await at([
          "supersede",
          "fact.cache-key-includes-region",
          "fact.cache-key-includes-account-and-region",
        ]),
      ),
    ).toEqual({
      superseded: "fact.cache-key-includes-region",
      replacedBy: "fact.cache-key-includes-account-and-region",
    });
    expect(parsed(await at(["validate"]))).toEqual([]);
  });

  test("records the explicit no-decision claim, idempotently", async () => {
    const first = parsed(await at(["no-decision", "Nothing", "to", "decide."]));
    expect(first).toEqual({ conceptId: "decision.none" });
    // Restating it overwrites rather than colliding.
    expect(parsed(await at(["no-decision", "Still nothing."]))).toEqual(first);
  });

  // A check that reports a problem succeeded as a command and failed as a
  // check; only the exit code tells a shell caller which.
  test("exits non-zero when validate finds a problem", async () => {
    writeFileSync(
      join(bundle, "fact.orphan.md"),
      [
        "---",
        "type: fact",
        "strauss_status: superseded",
        "---",
        "Body.",
        "",
      ].join("\n"),
    );

    const run = await at(["validate"]);

    expect(run.exitCode).toBe(1);
    expect(parsed(run)).toMatchObject([{ check: "superseded_by" }]);
  });

  // The sweep prints for a person by default and for a program on request,
  // and the two have to be the same run: a table a caller cannot re-derive
  // from the JSON would be a second report to keep in step.
  describe("doctor", () => {
    const expiring = async (staleAfter: string) => {
      await new KbStore().write(
        bundle,
        composeRecord(
          "fact",
          {
            slug: "free-tier-cap",
            title: "The free tier caps at 1000 calls",
            why: "A wrong cap prices the plan wrong.",
            sections: { Claim: "1000 calls a month." },
            stale_after: staleAfter,
          },
          "seed",
          "2026-08-01T02:00:00Z",
        ),
      );
    };

    test("prints a table naming every check", async () => {
      const run = await at(["doctor"]);

      expect(run.stdout).toContain("# KB Doctor —");
      for (const check of [
        "expired",
        "expiring",
        "unverified",
        "aging",
        "orphaned",
        "broken-supersession",
        "superseded-but-cited",
      ]) {
        expect(run.stdout).toContain(check);
      }
      expect(run.exitCode).toBeUndefined();
    });

    test("prints the report object under --json", async () => {
      await expiring("2020-01-01");

      const report = parsed(await at(["doctor", "--json"])) as {
        counts: Record<string, number>;
        groups: { check: string; findings: { conceptId: string }[] }[];
        thresholds: Record<string, number>;
        healthy: boolean;
      };

      expect(report.thresholds).toEqual({
        expiringDays: 30,
        unverifiedDays: 90,
        agingDays: 90,
      });
      expect(report.groups).toHaveLength(7);
      expect(report.counts.expired).toBe(1);
      expect(report.healthy).toBe(false);
      expect(
        report.groups.find((group) => group.check === "expired")?.findings,
      ).toMatchObject([{ conceptId: "fact.free-tier-cap" }]);
    });

    test("takes its thresholds from the CLI flags", async () => {
      // Far enough out to be invisible at the default 30-day window.
      await expiring("2099-01-01");

      const wide = parsed(
        await at(["doctor", "--json", "--expiring-days", "40000"]),
      ) as { counts: Record<string, number> };
      const narrow = parsed(await at(["doctor", "--json"])) as {
        counts: Record<string, number>;
      };

      expect(wide.counts.expiring).toBe(1);
      expect(narrow.counts.expiring).toBe(0);
    });

    // Read-only, so the exit code is the only thing a pipeline can gate on —
    // and only expiry, which the base itself already said would stop holding.
    test("exits non-zero under --strict only when something has expired", async () => {
      expect((await at(["doctor", "--strict"])).exitCode).toBeUndefined();

      await expiring("2020-01-01");

      expect((await at(["doctor"])).exitCode).toBeUndefined();
      const strict = await at(["doctor", "--strict"]);
      expect(strict.exitCode).toBe(1);
      expect(strict.stdout).toContain("stale since 2020-01-01");
    });
  });

  test("answers schema and types without touching a base", async () => {
    expect(Object.keys(parsed(await cli(["schema"])) as object).sort()).toEqual(
      ["composeInput", "logEntry", "recordFrontmatter"],
    );
    expect(Object.keys(parsed(await cli(["types"])) as object)).toHaveLength(
      12,
    );
  });

  test("writes a record from stdin through the argv adapter", async () => {
    const stdin = JSON.stringify({
      slug: "log-is-primary",
      title: "The log is the only artifact nothing can rebuild",
      why: "Rewriting an append-only log destroys the only copy of what it holds.",
    });
    const read = () => Promise.resolve(stdin);

    const { KB_COMMANDS_BY_NAME } = await import("./commands/index.js");
    const write = KB_COMMANDS_BY_NAME.get("write")!;
    const input = write.input.parse(
      await write.fromArgv(["write", "fact"], bundle, read),
    );
    const result = await write.run(
      {
        store: new KbStore(),
        actor: "argv",
        now: () => "2026-08-03T00:00:00Z",
      },
      input,
    );

    expect(result).toEqual({
      conceptId: "fact.log-is-primary",
      action: "created",
      supersededIds: [],
    });
  });

  test("writes a decision from stdin, keeping the rejected alternative", async () => {
    const stdin = JSON.stringify({
      slug: "cas-not-lock",
      title: "Compare-and-swap rather than a lock",
      why: "A stale lock hold blocks every later writer.",
      alternative:
        "A lock file — closes the window, adds a stale-hold failure.",
      impact: "A losing writer re-reads and retries.",
    });

    const { KB_COMMANDS_BY_NAME } = await import("./commands/index.js");
    const command = KB_COMMANDS_BY_NAME.get("write-decision")!;
    const input = command.input.parse(
      await command.fromArgv(["write-decision"], bundle, () =>
        Promise.resolve(stdin),
      ),
    );
    await command.run(
      {
        store: new KbStore(),
        actor: "argv",
        now: () => "2026-08-03T00:00:00Z",
      },
      input,
    );

    const record = await new KbStore().read(bundle, "decision.cas-not-lock");
    expect(record?.body).toContain("## Rejected");
    expect(record?.body).toContain("## Impact");
  });
});
