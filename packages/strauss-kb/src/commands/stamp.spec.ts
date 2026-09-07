import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { composeRecord } from "../compose.js";
import { pinBase } from "../kb-pins/index.js";
import { KbStore } from "../kb-store.js";
import { stampCommand } from "./stamp.js";

type Report = {
  path: string;
  digest: string;
  recordCount: number;
  superseded: number;
  newestAt: string | null;
  records: { conceptId: string; digest: string }[];
  changed: string[] | null;
};

const AT = "2026-08-01T00:00:00Z";

describe("stampCommand", () => {
  let store: KbStore;
  let workspace: string;
  let bundle: string;

  beforeEach(() => {
    store = new KbStore();
    workspace = realpathSync(
      mkdtempSync(join(tmpdir(), "strauss-kb-stamp-ws-")),
    );
    bundle = realpathSync(mkdtempSync(join(tmpdir(), "strauss-kb-stamp-")));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  });

  const seed = (
    slug: string,
    why: string,
    options: { base?: string; overwrite?: boolean } = {},
  ) =>
    store.write(options.base ?? bundle, {
      ...composeRecord(
        "decision",
        { slug, title: `Decision ${slug}`, why },
        "agent:writer",
        AT,
      ),
      ...(options.overwrite ? { overwrite: true } : {}),
    });

  const run = async (input: Record<string, unknown> = {}) =>
    (await stampCommand.run(
      { store, actor: "agent:reader", now: () => AT },
      stampCommand.input.parse({ bundlePath: bundle, ...input }),
    )) as Report[];

  test("digest equals load's, and no body comes back", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    const loaded = await store.load(bundle);
    const report = (await run())[0]!;

    if (!loaded.loaded) throw new Error("fixture should fit the budget");
    expect(report.digest).toBe(loaded.digest);
    expect(report.recordCount).toBe(1);
    expect(report.superseded).toBe(0);
    expect(report.newestAt).toBe(AT);
    expect(JSON.stringify(report)).not.toContain("Offsets skip rows");
  });

  test("--since with the same digest reports nothing", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    const before = (await run())[0]!;

    expect(await run({ since: before.digest })).toEqual([]);
    expect(stampCommand.render?.(await run({ since: before.digest }))).toBe("");
  });

  test("--since a prior stamp names the records that changed", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    await seed("cache", "A shared cache would need invalidation we cannot do.");
    const baseline = join(workspace, "baseline.json");
    writeFileSync(baseline, JSON.stringify(await run()));

    await seed("cursor", "Rewritten: keyset pagination it is.", {
      overwrite: true,
    });
    const changed = await run({ since: baseline });

    expect(changed).toHaveLength(1);
    expect(changed[0]!.changed).toEqual(["decision.cursor"]);
    expect(stampCommand.render?.(changed)).toContain("decision.cursor");
  });

  test("a digest baseline answers equality without naming ids", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    const stale = "0".repeat(64);
    const report = (await run({ since: stale }))[0]!;

    expect(report.changed).toBeNull();
    expect(report.digest).not.toBe(stale);
  });

  test("a base absent from the baseline reads as never injected", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    const baseline = join(workspace, "empty.json");
    writeFileSync(baseline, JSON.stringify({ head: null, stamps: [] }));

    const changed = await run({ since: baseline });
    expect(changed[0]!.changed).toEqual(["decision.cursor"]);
  });

  test("an unreadable baseline is an error, not a silent all-clear", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    await expect(
      run({ since: join(workspace, "missing.json") }),
    ).rejects.toThrow(
      /neither a 64-character digest nor a readable stamp file/,
    );
  });

  test("with no bundle it stamps every pinned base, one line each", async () => {
    const second = realpathSync(
      mkdtempSync(join(tmpdir(), "strauss-kb-stamp-two-")),
    );
    try {
      await seed("cursor", "Offsets skip rows under concurrent writes.");
      await seed("cache", "No invalidation story.", { base: second });
      await pinBase(store, workspace, bundle, AT);
      await pinBase(store, workspace, second, AT);

      const cwd = process.cwd();
      process.chdir(workspace);
      try {
        const reports = (await stampCommand.run(
          { store, actor: "agent:reader", now: () => AT },
          stampCommand.input.parse({}),
        )) as Report[];

        expect(reports.map((report) => report.path).sort()).toEqual(
          [bundle, second].sort(),
        );
        expect(stampCommand.render?.(reports).split("\n")).toHaveLength(2);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });

  test("superseded records count and still move the digest", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    await seed("keyset", "Keyset pagination is stable under writes.");
    const before = (await run())[0]!;
    await store.supersede(bundle, "decision.cursor", "decision.keyset");
    const after = (await run())[0]!;

    expect(after.digest).not.toBe(before.digest);
  });

  test("a digest baseline over more than one base is an error, naming --bundle", async () => {
    const second = realpathSync(
      mkdtempSync(join(tmpdir(), "strauss-kb-stamp-digest-two-")),
    );
    try {
      await seed("cursor", "Offsets skip rows under concurrent writes.");
      await seed("cache", "No invalidation story.", { base: second });
      await pinBase(store, workspace, bundle, AT);
      await pinBase(store, workspace, second, AT);
      const stale = "0".repeat(64);

      const cwd = process.cwd();
      process.chdir(workspace);
      try {
        await expect(
          stampCommand.run(
            { store, actor: "agent:reader", now: () => AT },
            stampCommand.input.parse({ since: stale }),
          ),
        ).rejects.toThrow(/needs --bundle \(one base\)/);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });

  test("a digest baseline over one base (via --bundle) is not an error", async () => {
    await seed("cursor", "Offsets skip rows under concurrent writes.");
    const stale = "0".repeat(64);

    await expect(run({ since: stale })).resolves.toEqual([
      expect.objectContaining({ changed: null }),
    ]);
  });

  test("the `since` describe stays terse", () => {
    const since = stampCommand.input.shape.since as z.ZodType;
    const description = since.description ?? "";
    // Cut from the prior 34-word describe; some slack around the target
    // (whitespace word-splitting counts `stamp --json`; and similar as more
    // tokens than a human count would) rather than an exact-match brittle to
    // wording tweaks.
    expect(description.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(
      25,
    );
  });

  // `stamp` runs from a reload hook on every turn, so its cost is paid by a
  // person waiting. The headroom is generous — this guards a regression in
  // kind (a per-record read, a grammar load per anchor), not a few milliseconds.
  test("a 200-record base stamps well inside the hook's budget", async () => {
    const repoRoot = workspace;
    const source = `export const value = ${"1 + ".repeat(50)}1;\n`;
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src/a.ts"), source, "utf8");
    const hash = `sha256:${createHash("sha256").update(source).digest("hex")}`;

    for (let at = 0; at < 200; at += 1) {
      await store.write(bundle, {
        ...composeRecord(
          "decision",
          {
            slug: `rec-${at}`,
            title: `Decision ${at}`,
            why: "Offsets skip rows under concurrent writes.",
            anchors: [{ file: "src/a.ts", hash }],
          },
          "agent:writer",
          AT,
        ),
      });
    }

    // One warm-up: the first call pays module and JIT costs a hook's second
    // call never sees, and it is the steady state a turn is charged for.
    await store.stamp(bundle, { repoRoot });
    const started = performance.now();
    const stamped = await store.stamp(bundle, { repoRoot });
    const elapsed = performance.now() - started;

    expect(stamped.recordCount).toBe(200);
    expect(stamped.drifted).toBe(0);
    // A smoke bound: ~15 ms measured, held wide for coverage runs on a loaded host.
    expect(elapsed).toBeLessThan(1500);
  });

  test("--bundle is only passed on when the flag was given", () => {
    const noStdin = () => Promise.resolve("");
    expect(
      stampCommand.fromArgv(["stamp"], "/default", noStdin, false),
    ).toEqual({});
    expect(
      stampCommand.fromArgv(
        ["stamp", "--since", "abc"],
        "/base",
        noStdin,
        true,
      ),
    ).toEqual({ bundlePath: "/base", since: "abc" });
  });
});
