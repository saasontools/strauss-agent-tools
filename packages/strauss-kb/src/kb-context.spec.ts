import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { composeRecord } from "./compose.js";
import {
  CONTEXT_BEGIN,
  CONTEXT_END,
  buildContext,
  syncInstructions,
  toHookJson,
} from "./kb-context.js";
import { PINS_FILE, pinBase } from "./kb-pins.js";
import { KbStore } from "./kb-store.js";
import { KB_COMMANDS_BY_NAME } from "./commands.js";

describe("buildContext", () => {
  let workspace: string;
  let bundle: string;
  const store = new KbStore();
  const at = "2026-08-19T00:00:00Z";

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), "strauss-kb-context-"));
    bundle = join(workspace, "docs", "kb");
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "cursor-v1",
          title: "Offset pagination",
          why: "Simple to start with.",
        },
        "seed",
        at,
      ),
    );
    await store.write(
      bundle,
      composeRecord(
        "decision",
        {
          slug: "cursor-v2",
          title: "Keyset pagination",
          why: "Offsets skip rows under concurrent writes.",
          sections: { Decision: "Paginate by keyset everywhere." },
        },
        "seed",
        at,
      ),
    );
    await store.supersede(bundle, "decision.cursor-v1", "decision.cursor-v2");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("is silent when there is no manifest and when nothing is pinned", async () => {
    expect((await buildContext(store, workspace)).block).toBe("");

    mkdirSync(join(workspace, ".strauss"), { recursive: true });
    writeFileSync(join(workspace, PINS_FILE), JSON.stringify({ pins: [] }));
    expect((await buildContext(store, workspace)).block).toBe("");
  });

  // Run from hooks at every session start: a manifest someone broke by hand
  // must degrade to silence there, not to a stack trace in a fresh context.
  test("is silent over a malformed manifest", async () => {
    mkdirSync(join(workspace, ".strauss"), { recursive: true });
    writeFileSync(join(workspace, PINS_FILE), "{ not json");

    expect((await buildContext(store, workspace)).block).toBe("");
  });

  test("emits preamble, index lines, and superseded stubs under budget", async () => {
    await pinBase(store, workspace, bundle, at);

    const result = await buildContext(store, workspace);

    expect(result.refused).toBe(false);
    expect(result.block).toContain("## Knowledge bases (pinned)");
    // The routing and the why, not just the don't.
    expect(result.block).toContain("kb_load");
    expect(result.block).toContain("bypasses supersession resolution");
    expect(result.block).toContain("compacted");
    // The current record as an index line, the superseded one as id →
    // replacement only — the same shape load hands back.
    expect(result.block).toContain("### docs/kb (index only");
    expect(result.block).toContain(`bundlePath: \`${bundle}\``);
    expect(result.block).toContain("[Keyset pagination]");
    expect(result.block).toContain(
      "`decision.cursor-v1` → superseded by `decision.cursor-v2`",
    );
    // Index only: descriptions travel on the index line, bodies do not.
    expect(result.block).not.toContain("Paginate by keyset everywhere.");
  });

  test("names an unpopulated pinned base rather than failing", async () => {
    await pinBase(store, workspace, join(workspace, "later"), at);

    const { block } = await buildContext(store, workspace);

    expect(block).toContain("### later (empty)");
    expect(block).toContain("pinned ahead of being populated");
  });

  test("refuses past the budget, listing each base and its size", async () => {
    await pinBase(store, workspace, bundle, at);

    const result = await buildContext(store, workspace, { budgetTokens: 50 });

    expect(result.refused).toBe(true);
    expect(result.block).toContain("was not emitted");
    expect(result.block).toContain("- docs/kb — ~");
    expect(result.block).toContain(`bundlePath: \`${bundle}\``);
    // The refusal is itself a small block, never the oversized index.
    expect(result.block).not.toContain("[Keyset pagination]");
    // A refusal, not a lock: it says what to read now, and how to shrink the
    // recurring block so the next session does not land here.
    expect(result.block).toContain("read what you need now");
    expect(result.block).toContain("--mode index");
    expect(result.block).toContain("unpin what no session actually needs");
  });

  test("surfaces local-layer pins and labels frozen bases read-only", async () => {
    await pinBase(store, workspace, bundle, at, {
      layer: "local",
      frozen: true,
    });

    const { block } = await buildContext(store, workspace);

    expect(block).toContain("### docs/kb (index only");
    expect(block).toContain("frozen, read-only");
  });

  test("emits a base whole when it fits under --full-under", async () => {
    await pinBase(store, workspace, bundle, at);
    const big = join(workspace, "big");
    for (let i = 0; i < 8; i++) {
      await store.write(
        big,
        composeRecord(
          "fact",
          {
            slug: `filler-${i}`,
            title: `Filler ${i}`,
            why: "Bulk that keeps this base over the full-under line.",
            sections: { Claim: "x".repeat(2_000) },
          },
          "seed",
          at,
        ),
      );
    }
    await pinBase(store, workspace, big, at);

    const { block } = await buildContext(store, workspace, {
      budgetTokens: 50_000,
      fullUnderTokens: 2_000,
    });

    // The small base arrives whole, labelled as such; the big one stays an
    // index; the preamble's per-base labels are what says which is which.
    expect(block).toContain(
      "### docs/kb (full records — this base arrives whole)",
    );
    expect(block).toContain("Paginate by keyset everywhere.");
    expect(block).toContain("### big (index only");
    expect(block).not.toContain("xxxx");
  });

  test("resolves budgets by profile: flags over manifest over built-ins", async () => {
    await pinBase(store, workspace, bundle, at);

    // Built-in profile: compact carries a 2500 budget; the seeded base fits.
    const builtin = await buildContext(store, workspace, {
      profile: "compact",
    });
    expect(builtin.budgetTokens).toBe(2_500);
    expect(builtin.refused).toBe(false);

    // The repo's manifest overrides the built-in — per profile, over its
    // `default` — without touching hook commands. Invalid values are
    // ignored, not errors: a typo must not silence the index.
    const file = join(workspace, PINS_FILE);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      file,
      JSON.stringify({
        ...manifest,
        context: {
          default: { fullUnderTokens: 5_000 },
          compact: { budgetTokens: 60, fullUnderTokens: "lots" },
        },
      }),
    );

    const fromManifest = await buildContext(store, workspace, {
      profile: "compact",
    });
    expect(fromManifest.budgetTokens).toBe(60);
    expect(fromManifest.refused).toBe(true);
    // fullUnderTokens "lots" ignored; default's 5000 applies underneath —
    // visible through a profile that doesn't set it.
    const sessionStart = await buildContext(store, workspace, {
      profile: "session-start",
    });
    expect(sessionStart.block).toContain("full records");

    // Explicit flags beat everything.
    const explicit = await buildContext(store, workspace, {
      profile: "compact",
      budgetTokens: 50_000,
    });
    expect(explicit.refused).toBe(false);

    // An unknown profile falls through to package defaults rather than
    // failing — hooks must never break over a name.
    const unknown = await buildContext(store, workspace, {
      profile: "no-such-profile",
    });
    expect(unknown.budgetTokens).toBe(4_000);
  });

  test("a mode:full pin arrives whole regardless of the threshold", async () => {
    await pinBase(store, workspace, bundle, at, { mode: "full" });

    // No full-under at all — the pin's own mode is what upgrades it.
    const { block } = await buildContext(store, workspace);
    expect(block).toContain(
      "### docs/kb (full records — this base arrives whole)",
    );
    expect(block).toContain("Paginate by keyset everywhere.");

    // And mode:index pins never upgrade, whatever the threshold says.
    await pinBase(store, workspace, bundle, at, { mode: "index" });
    const indexOnly = await buildContext(store, workspace, {
      fullUnderTokens: 50_000,
    });
    expect(indexOnly.block).toContain("### docs/kb (index only");
    expect(indexOnly.block).not.toContain("Paginate by keyset everywhere.");
  });

  test("a mode:full pin that cannot fit degrades to an index, labelled", async () => {
    const big = join(workspace, "big");
    for (let i = 0; i < 8; i++) {
      await store.write(
        big,
        composeRecord(
          "fact",
          {
            slug: `filler-${i}`,
            title: `Filler ${i}`,
            why: "Bulk that keeps the full load past the block budget.",
            sections: { Claim: "y".repeat(2_000) },
          },
          "seed",
          at,
        ),
      );
    }
    await pinBase(store, workspace, big, at, { mode: "full" });

    // The bodies exceed the block budget but the index lines fit — the
    // forced-full pin falls back to index rather than blowing the block.
    const result = await buildContext(store, workspace);

    expect(result.refused).toBe(false);
    expect(result.block).toContain("### big (index only");
    expect(result.block).not.toContain("yyyy");
  });

  test("profile-scoped pins surface only in their profiles", async () => {
    await pinBase(store, workspace, bundle, at, {
      profiles: ["session-start"],
    });

    const inProfile = await buildContext(store, workspace, {
      profile: "session-start",
    });
    expect(inProfile.block).toContain("### docs/kb");

    const otherProfile = await buildContext(store, workspace, {
      profile: "turn",
    });
    expect(otherProfile.block).toBe("");

    // A run without a profile is the explicit full view.
    const noProfile = await buildContext(store, workspace);
    expect(noProfile.block).toContain("### docs/kb");
  });

  test("wraps the block in a valid hook JSON envelope", () => {
    const wrapped = JSON.parse(toHookJson("## Block\n", "SessionStart")) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    expect(wrapped.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(wrapped.hookSpecificOutput.additionalContext).toBe("## Block\n");
  });

  test("the context command is silent with no pins and wraps with --format json", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    try {
      const command = KB_COMMANDS_BY_NAME.get("context")!;
      const ctx = { store, actor: "test", now: () => at };

      const silent = await command.run(
        ctx,
        command.input.parse(
          command.fromArgv(["context"], bundle, () => Promise.resolve("")),
        ),
      );
      expect(silent).toBe("");

      await pinBase(store, workspace, bundle, at);
      const wrapped = await command.run(
        ctx,
        command.input.parse(
          command.fromArgv(
            ["context", "--format", "json", "--event", "BeforeAgent"],
            bundle,
            () => Promise.resolve(""),
          ),
        ),
      );
      const parsed = JSON.parse(wrapped as string) as {
        hookSpecificOutput: {
          hookEventName: string;
          additionalContext: string;
        };
      };
      expect(parsed.hookSpecificOutput.hookEventName).toBe("BeforeAgent");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "## Knowledge bases (pinned)",
      );
    } finally {
      cwd.mockRestore();
    }
  });
});

describe("syncInstructions", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "strauss-kb-sync-"));
  });
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const block = "## Knowledge bases (pinned)\n\ncontent";

  test("creates the file and block when absent, idempotently", async () => {
    const file = join(workspace, "AGENTS.md");

    expect(await syncInstructions(file, block)).toEqual({
      file,
      action: "created",
    });
    const first = readFileSync(file, "utf8");
    expect(first).toContain(CONTEXT_BEGIN);
    expect(first).toContain(CONTEXT_END);

    // Running twice yields the identical file.
    expect(await syncInstructions(file, block)).toEqual({
      file,
      action: "unchanged",
    });
    expect(readFileSync(file, "utf8")).toBe(first);
  });

  test("replaces only the sentinel region, preserving everything else", async () => {
    const file = join(workspace, "AGENTS.md");
    writeFileSync(
      file,
      `# Project\n\nAbove.\n\n${CONTEXT_BEGIN}\nstale\n${CONTEXT_END}\n\nBelow.\n`,
    );

    expect(await syncInstructions(file, block)).toEqual({
      file,
      action: "replaced",
    });

    const written = readFileSync(file, "utf8");
    expect(written).toContain("Above.");
    expect(written).toContain("Below.");
    expect(written).toContain("content");
    expect(written).not.toContain("stale");
    // Idempotent over the replaced result too.
    expect(await syncInstructions(file, block)).toMatchObject({
      action: "unchanged",
    });
  });

  test("appends the block to a file without sentinels", async () => {
    const file = join(workspace, "CLAUDE.md");
    writeFileSync(file, "# Project\n");

    expect(await syncInstructions(file, block)).toMatchObject({
      action: "appended",
    });
    expect(readFileSync(file, "utf8").startsWith("# Project\n")).toBe(true);
  });

  test("removes the region when there is nothing to say", async () => {
    const file = join(workspace, "AGENTS.md");
    writeFileSync(
      file,
      `Above.\n\n${CONTEXT_BEGIN}\nstale\n${CONTEXT_END}\n\nBelow.\n`,
    );

    expect(await syncInstructions(file, "")).toMatchObject({
      action: "removed",
    });
    const written = readFileSync(file, "utf8");
    expect(written).not.toContain(CONTEXT_BEGIN);
    expect(written).toContain("Above.");
    expect(written).toContain("Below.");

    // And a file with no region and nothing to say is left alone.
    expect(await syncInstructions(file, "")).toMatchObject({
      action: "unchanged",
    });
  });
});
