import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runKbCli } from "./cli.js";
import { KB_COMMANDS, KB_COMMANDS_BY_NAME } from "./commands/index.js";
import { actorOf, KB_ACTOR_PATTERN } from "./commands/model.js";
import { composeRecord } from "./compose.js";
import { KbStore } from "./kb-store.js";

/**
 * The surface every consumer of this package leans on: what a free-text verb
 * refuses, which verbs take `--json`, who a write is attributed to, and that a
 * read leaves the base byte-identical.
 */
const AT = "2026-08-01T00:00:00Z";
const EXIT = Symbol("process.exit");

type Run = { stdout: string; stderr: string; exitCode: number | undefined };

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
    process.exitCode = undefined;
    out.mockRestore();
    err.mockRestore();
    exit.mockRestore();
  }
  return { stdout, stderr, exitCode };
}

/** Every file in the base, by content — what a read must not move. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    files[name] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return files;
}

describe("the CLI surface", () => {
  let bundle: string;
  let store: KbStore;

  beforeEach(async () => {
    bundle = mkdtempSync(join(tmpdir(), "strauss-kb-surface-"));
    store = new KbStore();
    await store.write(
      bundle,
      composeRecord(
        "open-question",
        {
          slug: "retry-scope",
          title: "Which failures should the client retry?",
          why: "Scope decides how much of the client needs a backoff.",
          tags: ["review"],
          anchors: [{ file: "src/client.ts" }],
        },
        "agent:writer",
        AT,
      ),
      "agent:writer",
    );
  });

  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true });
  });

  const at = (args: string[]) => cli(["--bundle", bundle, ...args]);

  // The bug: `no-decision --help` wrote a record whose reason was `--help`.
  describe("a free-text positional is text, and `--help` is not", () => {
    test("--help after any verb prints that verb's usage and writes nothing", async () => {
      const before = snapshot(bundle);

      for (const verb of ["no-decision", "write-decision", "answer", "query"]) {
        const run = await at([verb, "--help"]);
        expect(run.stdout, verb).toContain(verb);
        expect(run.exitCode, verb).toBeUndefined();
      }

      expect(snapshot(bundle)).toEqual(before);
    });

    test("a leading -- in prose is refused, not recorded", async () => {
      const before = snapshot(bundle);

      const noDecision = await at(["no-decision", "--nope"]);
      expect(noDecision.stderr).toContain("reads as a flag");

      const answer = await at([
        "answer",
        "open-question.retry-scope",
        "--nope",
      ]);
      expect(answer.stderr).toContain("reads as a flag");

      const query = await at(["query", "--nope"]);
      expect(query.stderr).toContain("reads as a flag");

      expect(snapshot(bundle)).toEqual(before);
    });

    // Two mistakes, two messages: nothing passed, and a mistyped flag.
    test("an empty positional is named as missing, not as a flag", async () => {
      const run = await at(["no-decision", ""]);

      expect(run.stderr).toContain("reason: is required");
      expect(run.stderr).not.toContain("reads as a flag");
    });

    // Only the leading token: a flag-shaped word mid-sentence is prose.
    test("prose that mentions a flag later still records", async () => {
      const run = await at([
        "no-decision",
        "--",
        "we kept --offline as it was",
      ]);

      expect(run.exitCode).toBeUndefined();
      const record = await store.read(bundle, "decision.none");
      expect(record?.body).toContain("we kept --offline as it was");
    });
  });

  // A caller scripting the CLI should not have to know which verbs render, so
  // the refusing set is read off the table rather than restated here.
  describe("--json", () => {
    const refusers = KB_COMMANDS.filter((command) => command.jsonRefused);

    test("only the verbs whose result is markdown refuse it", () => {
      expect(refusers.map((command) => command.name).sort()).toEqual([
        "catalog",
        "index",
        "pack",
      ]);
    });

    test("a refuser says so rather than printing markdown", async () => {
      for (const command of refusers) {
        const run = await at([command.name, "--json"]);

        expect(run.stderr, command.name).toContain("takes no --json");
        expect(run.stdout, command.name).toBe("");
      }
    });

    test("every other verb hands back something JSON.parse takes", async () => {
      for (const args of [
        ["list"],
        ["load", "--all"],
        ["log"],
        ["validate"],
        ["trace", "open-question.retry-scope"],
        ["impact", "open-question.retry-scope"],
        ["backlinks", "open-question.retry-scope"],
        ["anchor-resolve", "open-question.retry-scope"],
      ]) {
        const name = args[0] as string;
        expect(
          KB_COMMANDS_BY_NAME.get(name)?.jsonRefused,
          name,
        ).toBeUndefined();

        const run = await at([...args, "--json"]);
        expect(run.stderr, name).not.toContain("takes no --json");
        expect(() => JSON.parse(run.stdout) as unknown, name).not.toThrow();
      }
    });
  });

  describe("who a write is attributed to", () => {
    test("--actor overrides the ambient actor on every writing verb", async () => {
      const writers = KB_COMMANDS.filter(
        (command) => "actor" in command.input.shape,
      ).map((command) => command.name);

      expect(writers.sort()).toEqual(
        [
          "anchor-resolve",
          "answer",
          "no-decision",
          "promote",
          "reassess",
          "status",
          "supersede",
          "sweep",
          "verify",
          "write",
          "write-decision",
        ].sort(),
      );

      await at(["no-decision", "--actor", "human:alice", "nothing to decide"]);
      const record = await store.read(bundle, "decision.none");
      expect(record?.frontmatter.generated?.by).toBe("human:alice");
    });

    test("an actor that is not kind:name is refused", async () => {
      const run = await at(["no-decision", "--actor", "alice", "no decision"]);

      expect(run.stderr).toContain("actor must be kind:name");
      expect(await store.read(bundle, "decision.none")).toBeNull();
    });

    test("actorOf falls back to the context actor", () => {
      const ctx = { store, actor: "agent:ambient", now: () => AT };
      expect(actorOf(ctx, {})).toBe("agent:ambient");
      expect(actorOf(ctx, { actor: "human:alice" })).toBe("human:alice");
      expect(KB_ACTOR_PATTERN.test("human:alice")).toBe(true);
      expect(KB_ACTOR_PATTERN.test("alice")).toBe(false);
    });
  });

  // A read that repairs the index or the merge driver turns `git status` into
  // noise on a checkout nobody wrote to.
  test("a read leaves a fresh base byte-identical", async () => {
    const before = snapshot(bundle);

    for (const args of [
      ["list"],
      ["load", "--all"],
      ["catalog"],
      ["log"],
      ["validate"],
      ["trace", "open-question.retry-scope"],
      ["impact", "open-question.retry-scope"],
      ["backlinks", "open-question.retry-scope"],
      ["stamp"],
    ]) {
      await at(args);
    }

    expect(snapshot(bundle)).toEqual(before);
  });

  // Every read hands back the same frontmatter, from one projection.
  test("the reads that return a record return its frontmatter", async () => {
    const list = JSON.parse((await at(["list", "--json"])).stdout) as Record<
      string,
      unknown
    >[];
    const loaded = JSON.parse(
      (await at(["load", "--all", "--json"])).stdout,
    ) as { records: Record<string, unknown>[] };

    for (const row of [list[0], loaded.records[0]]) {
      expect(row).toMatchObject({
        conceptId: "open-question.retry-scope",
        type: "open-question",
        status: "open",
        tags: ["review"],
        sources: [],
        verified: [],
        verify: [],
        strauss_links: [],
        anchors: [{ file: "src/client.ts" }],
      });
    }
  });
});
