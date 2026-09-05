import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KB_COMMANDS_BY_NAME } from "../commands/index.js";
import { KbStore } from "../kb-store.js";
import {
  actorClassOf,
  appendLocal,
  emit,
  emitKb,
  readEvents,
  repoSlug,
  resetRepoSlugs,
  resetTelemetryWarnings,
  summarise,
  telemetryEventSchema,
  telemetryIdle,
  telemetrySummary,
  EVENTS_FILE,
  MAX_ROTATIONS,
  ROTATE_AT_BYTES,
  type TelemetryEvent,
} from "./index.js";

// The rename half of a rotation is the one step two processes can race; a hook
// is the only way to land the loser's ENOENT deterministically.
const hooks = vi.hoisted(() => ({ renameFailsOnce: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (!hooks.renameFailsOnce) return actual.rename(from, to);
      hooks.renameFailsOnce = false;
      const error: NodeJS.ErrnoException = new Error("no such file");
      error.code = "ENOENT";
      throw error;
    },
  };
});

let root: string;
let stderr: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "strauss-telemetry-"));
  stderr = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  process.env.STRAUSS_TELEMETRY = "local";
  process.env.STRAUSS_TELEMETRY_DIR = root;
  resetRepoSlugs();
  resetTelemetryWarnings();
  hooks.renameFailsOnce = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  delete process.env.STRAUSS_TELEMETRY_DIR;
  delete process.env.STRAUSS_TELEMETRY_URL;
  delete process.env.GITHUB_STEP_SUMMARY;
  process.env.STRAUSS_TELEMETRY = "off";
});

/** Where the local sink lands for this working directory. */
async function sinkDir(): Promise<string> {
  return join(root, await repoSlug(process.cwd()));
}

function lines(dir: string, file = EVENTS_FILE): TelemetryEvent[] {
  return readFileSync(join(dir, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TelemetryEvent);
}

function fixtureFile(dir: string, name: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
}

describe("event schema", () => {
  const base = {
    ts: new Date().toISOString(),
    component: "strauss-kb",
    event: "write",
  };

  test("rejects code content in data", () => {
    const parsed = telemetryEventSchema.safeParse({
      ...base,
      data: { body: "x".repeat(600) },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("facts, not bodies");
  });

  test("rejects a long string nested inside data", () => {
    expect(
      telemetryEventSchema.safeParse({
        ...base,
        data: { anchors: [{ file: "a.ts", symbol: "y".repeat(600) }] },
      }).success,
    ).toBe(false);
  });

  test("rejects a long key in data", () => {
    expect(
      telemetryEventSchema.safeParse({
        ...base,
        data: { ["k".repeat(600)]: 1 },
      }).success,
    ).toBe(false);
  });

  test("keeps a field a later component added", () => {
    const parsed = telemetryEventSchema.safeParse({ ...base, route: "gate" });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ route: "gate" });
  });

  test("accepts ids, anchors, counts and SHAs", () => {
    expect(
      telemetryEventSchema.safeParse({
        ...base,
        event: "anchor-resolve",
        sha: "0".repeat(40),
        actorClass: "agent",
        durationMs: 12,
        data: {
          conceptId: "decision.cursor-v2",
          anchors: [{ file: "src/a.ts", symbol: "run" }],
          states: { match: 2, drifted: 1 },
        },
      }).success,
    ).toBe(true);
  });
});

describe("actor class", () => {
  test("a prefix names the class, and only the CLI default is cli", () => {
    expect(actorClassOf("human:ada")).toBe("human");
    expect(actorClassOf("MCP:client")).toBe("mcp");
    expect(actorClassOf("unknown")).toBe("cli");
  });

  test("an unrecognised actor is unknown, not cli", () => {
    expect(actorClassOf("bot:nightly")).toBe("unknown");
    expect(actorClassOf("ada")).toBe("unknown");
  });
});

describe("sinks", () => {
  test("the local sink appends one JSON line per event", async () => {
    await emitKb("validate", { data: { findings: 0 } });
    await emitKb("doctor", { data: { strict: true } });

    const dir = await sinkDir();
    expect(lines(dir).map((event) => event.event)).toEqual([
      "validate",
      "doctor",
    ]);
    expect(lines(dir)[0]?.component).toBe("strauss-kb");
  });

  test("the local sink rotates at the size cap", async () => {
    const dir = await sinkDir();
    await appendLocal(dir, `${"x".repeat(ROTATE_AT_BYTES)}\n`);

    await emitKb("validate", { data: {} });

    expect(readFileSync(join(dir, "events.1.jsonl"), "utf8")).toHaveLength(
      ROTATE_AT_BYTES + 1,
    );
    expect(lines(dir)).toHaveLength(1);
  });

  test("a lost rotation race costs no line", async () => {
    const dir = await sinkDir();
    await appendLocal(dir, `${"x".repeat(ROTATE_AT_BYTES)}\n`);
    hooks.renameFailsOnce = true;

    await emitKb("validate", { data: {} });

    // The winner took the file; the loser appends to the one it recreates.
    expect(existsSync(join(dir, "events.1.jsonl"))).toBe(false);
    const body = readFileSync(join(dir, EVENTS_FILE), "utf8");
    expect(
      (JSON.parse(body.trimEnd().split("\n").at(-1) ?? "") as TelemetryEvent)
        .event,
    ).toBe("validate");
    expect(stderr).toEqual([]);
  });

  test("rotation prunes the oldest file past the cap", async () => {
    const dir = await sinkDir();
    for (let n = 1; n <= MAX_ROTATIONS; n += 1) {
      fixtureFile(dir, `events.${n}.jsonl`, "");
    }
    await appendLocal(dir, `${"x".repeat(ROTATE_AT_BYTES)}\n`);

    await emitKb("validate", { data: {} });

    expect(existsSync(join(dir, "events.1.jsonl"))).toBe(false);
    expect(existsSync(join(dir, "events.2.jsonl"))).toBe(true);
    expect(
      readFileSync(join(dir, `events.${MAX_ROTATIONS + 1}.jsonl`), "utf8"),
    ).toHaveLength(ROTATE_AT_BYTES + 1);
  });

  test("off drops the event", async () => {
    process.env.STRAUSS_TELEMETRY = "off";
    await emitKb("validate", { data: {} });

    expect(() => lines(join(root, "unwritten"))).toThrow();
    expect(stderr).toEqual([]);
  });

  test("stdout writes to stderr, never to the MCP channel", async () => {
    process.env.STRAUSS_TELEMETRY = "stdout";
    await emitKb("validate", { data: { findings: 2 } });

    expect(JSON.parse(stderr[0] as string)).toMatchObject({
      event: "validate",
      data: { findings: 2 },
    });
  });

  test("a step summary gets one markdown line per event", async () => {
    const summary = join(root, "step-summary.md");
    writeFileSync(summary, "");
    process.env.GITHUB_STEP_SUMMARY = summary;

    await emitKb("doctor", { durationMs: 7, data: { expired: 1 } });

    expect(readFileSync(summary, "utf8")).toBe(
      "- `strauss-kb` doctor — 7ms, expired=1\n",
    );
  });

  test("a failing URL sink is swallowed, with one warning per process", async () => {
    process.env.STRAUSS_TELEMETRY_URL =
      "http://token:secret@127.0.0.1:1/telemetry?key=s3cret";

    await emitKb("validate", { data: {} });
    await emitKb("doctor", { data: {} });
    await telemetryIdle();

    expect(lines(await sinkDir())).toHaveLength(2);
    const warnings = stderr.filter((line) => line.includes("POST to"));
    expect(warnings).toHaveLength(1);
    // The URL may carry a collector token; only the origin reaches a CI log.
    expect(warnings[0]).toContain("http://127.0.0.1:1 failed");
    expect(stderr.join("")).not.toContain("s3cret");
  });

  test("a step summary line cannot break out of its own markdown", async () => {
    const summary = join(root, "step-summary.md");
    writeFileSync(summary, "");
    process.env.GITHUB_STEP_SUMMARY = summary;

    await emitKb("validate", { data: { note: "a`b|c\nd" } });

    expect(readFileSync(summary, "utf8")).toBe(
      "- `strauss-kb` validate — note=a\\`b\\|c\\nd\n",
    );
  });

  test("an invalid event is dropped rather than thrown", async () => {
    await expect(
      emit({ component: "", event: "", data: {} }),
    ).resolves.toBeUndefined();

    expect(stderr.join("")).toContain("telemetry:");
  });
});

describe("summary", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();
  const fixture: TelemetryEvent[] = [
    {
      ts: at(1),
      component: "strauss-kb",
      event: "validate",
      data: { errors: { backlink: 2, supersedes: 1 } },
    },
    {
      ts: at(2),
      component: "strauss-kb",
      event: "doctor",
      data: { findings: { expired: 1, drifted: 3 }, strict: true },
    },
    {
      ts: at(3),
      component: "strauss-kb",
      event: "anchor-resolve",
      data: { states: { drifted: 4, match: 1 }, rebaselined: 1 },
    },
    {
      ts: at(4),
      component: "strauss-kb",
      event: "stamp",
      data: { bases: 2, moved: 1, drifted: 6 },
    },
    {
      ts: at(5),
      component: "strauss-kb",
      event: "verify",
      actorClass: "human",
      data: { conceptId: "decision.a" },
    },
    {
      ts: at(6),
      component: "strauss-kb",
      event: "verify",
      actorClass: "agent",
      data: { conceptId: "decision.b" },
    },
    {
      ts: at(7),
      component: "strauss-kb",
      event: "write",
      data: { type: "fact", tags: ["cache", "auth"] },
    },
    {
      ts: at(8),
      component: "strauss-gate",
      event: "run",
      data: { blocked: true },
    },
  ];
  const jsonl = fixture.map((event) => `${JSON.stringify(event)}\n`);

  test("aggregates a fixture stream", () => {
    const summary = summarise(fixture);

    expect(summary.events).toBe(8);
    expect(summary.byComponent).toEqual({ "strauss-kb": 7, "strauss-gate": 1 });
    expect(summary.validateErrors).toEqual({ backlink: 2, supersedes: 1 });
    expect(summary.doctorFindings).toEqual({ expired: 1, drifted: 3 });
    expect(summary.drift).toEqual({
      drifted: 6,
      rebaselined: 1,
      unexpected: 3,
      unknownRuns: 0,
    });
    expect(summary.verifiesByActor).toEqual({ human: 1, agent: 1 });
    expect(summary.writesByType).toEqual({ fact: 1 });
    expect(summary.writesByTag).toEqual({ cache: 1, auth: 1 });
    expect(summary.pending).toContain("coverage");
  });

  test("a stamp that could not count drift is unknown, not zero", () => {
    const summary = summarise([
      {
        ts: at(9),
        component: "strauss-kb",
        event: "stamp",
        data: { bases: 1, moved: 0, driftUnknown: true },
      },
    ]);

    expect(summary.drift).toMatchObject({ drifted: 0, unknownRuns: 1 });
  });

  test("a verify with no actor class is unknown, not cli", () => {
    const summary = summarise([
      { ts: at(9), component: "strauss-kb", event: "verify", data: {} },
    ]);

    expect(summary.verifiesByActor).toEqual({ unknown: 1 });
  });

  test("reads every rotated file and cuts the stream at --since", async () => {
    const dir = join(root, "acme-widgets");
    fixtureFile(dir, "events.1.jsonl", jsonl.slice(0, 4).join(""));
    fixtureFile(dir, EVENTS_FILE, jsonl.slice(4).join(""));
    fixtureFile(dir, "notes.txt", "ignored");

    expect((await readEvents(dir)).events).toHaveLength(8);
    expect(
      (await readEvents(dir, at(5))).events.map((event) => event.event),
    ).toEqual(["verify", "verify", "write", "run"]);
  });

  test("reads only the newest files", async () => {
    const dir = join(root, "acme-widgets");
    for (let n = 1; n <= 12; n += 1) {
      fixtureFile(
        dir,
        `events.${n}.jsonl`,
        `${JSON.stringify({ ...(fixture[0] as TelemetryEvent), event: `e${n}` })}\n`,
      );
    }
    fixtureFile(dir, EVENTS_FILE, jsonl[0] as string);

    const { events } = await readEvents(dir);

    expect(events).toHaveLength(10);
    expect(events.map((event) => event.event)).not.toContain("e3");
    expect(events.map((event) => event.event)).toContain("e12");
  });

  test("an unparseable line is counted, not fatal", async () => {
    const dir = join(root, "acme-widgets");
    fixtureFile(dir, EVENTS_FILE, 'not json\n{"ts":"nope"}\n');

    expect(await readEvents(dir)).toEqual({ events: [], unreadable: 2 });
  });

  test("an unparseable --since is refused rather than floored at NaN", async () => {
    await expect(
      readEvents(join(root, "acme-widgets"), "last week"),
    ).rejects.toThrow("since is not a date");
  });

  test("telemetrySummary reads the named repo's directory", async () => {
    fixtureFile(join(root, "acme-widgets"), EVENTS_FILE, jsonl.join(""));

    const summary = await telemetrySummary({ repo: "acme-widgets" });

    expect(summary.repo).toBe("acme-widgets");
    expect(summary.events).toBe(8);
    expect(summary.unreadable).toBe(0);
  });
});

describe("instrumented commands", () => {
  test("anchor-resolve emits for a record with no anchors", async () => {
    const base = mkdtempSync(join(tmpdir(), "strauss-kb-base-"));
    const store = new KbStore();
    const ctx = {
      store,
      actor: "human:ada",
      now: () => new Date().toISOString(),
    };
    await KB_COMMANDS_BY_NAME.get("write")?.run(ctx, {
      bundlePath: base,
      type: "fact",
      input: {
        slug: "no-anchors",
        title: "A record with no anchors",
        why: "So the resolve path has something to say nothing about.",
        sections: { Claim: "There is nothing to resolve." },
      },
    } as never);
    await KB_COMMANDS_BY_NAME.get("anchor-resolve")?.run(ctx, {
      bundlePath: base,
      conceptId: "fact.no-anchors",
    } as never);

    expect(lines(await sinkDir()).map((event) => event.event)).toContain(
      "anchor-resolve",
    );
    expect(
      lines(await sinkDir()).find((event) => event.event === "anchor-resolve")
        ?.data,
    ).toMatchObject({ anchors: 0 });
    rmSync(base, { recursive: true, force: true });
  });

  test("validate emits its error count by check", async () => {
    const base = mkdtempSync(join(tmpdir(), "strauss-kb-base-"));

    await KB_COMMANDS_BY_NAME.get("validate")?.run(
      {
        store: new KbStore(),
        actor: "human:ada",
        now: () => new Date().toISOString(),
      },
      { bundlePath: base },
    );

    expect(lines(await sinkDir())[0]).toMatchObject({
      component: "strauss-kb",
      event: "validate",
      bundle: base,
      data: { errors: {}, findings: 0 },
    });
    rmSync(base, { recursive: true, force: true });
  });
});

// The consumers of this package — a gate, a reviewer, a walkthrough — record
// their own runs, and each was writing its own JSONL beside this one.
describe("telemetry emit", () => {
  const emitEvent = (input: Record<string, unknown>) =>
    KB_COMMANDS_BY_NAME.get("telemetry")?.run(
      {
        store: new KbStore(),
        actor: "human:ada",
        now: () => new Date().toISOString(),
      },
      { action: "emit", ...input },
    );

  test("a consumer's event lands in the same local sink", async () => {
    await emitEvent({
      component: "kb-review-gate",
      event: "gate.run",
      data: JSON.stringify({ route: "human", families: ["A"] }),
      pr: 59,
      durationMs: 120,
    });

    expect(lines(await sinkDir())[0]).toMatchObject({
      component: "kb-review-gate",
      event: "gate.run",
      pr: 59,
      durationMs: 120,
      data: { route: "human", families: ["A"] },
    });
  });

  // The cap is what keeps a body out of the stream, and a caller told nothing
  // would go on sending code.
  test("data carrying code content is refused, not dropped", async () => {
    await expect(
      emitEvent({
        component: "kb-review-gate",
        event: "gate.run",
        data: JSON.stringify({ diff: "x".repeat(513) }),
      }),
    ).rejects.toThrow(/no string over 512 characters/);

    expect(existsSync(await sinkDir())).toBe(false);
  });

  test("--data that is not JSON is refused", async () => {
    await expect(
      emitEvent({
        component: "kb-review-gate",
        event: "gate.run",
        data: "route=human",
      }),
    ).rejects.toThrow(/--data is not JSON/);
  });

  test("emit needs both a component and an event", async () => {
    await expect(emitEvent({ component: "kb-review-gate" })).rejects.toThrow(
      /needs --component and --event/,
    );
  });

  // Off drops the event, and a caller handed `emitted: true` would go looking
  // for a line nothing ever wrote.
  test("with the sink off the caller is told the event went nowhere", async () => {
    process.env.STRAUSS_TELEMETRY = "off";

    await expect(
      emitEvent({ component: "kb-review-gate", event: "gate.run" }),
    ).resolves.toEqual({ emitted: false, mode: "off" });
    expect(existsSync(await sinkDir())).toBe(false);
  });
});
