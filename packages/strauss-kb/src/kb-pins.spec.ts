import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { composeRecord } from "./compose.js";
import {
  assertBaseNotFrozen,
  KbBaseFrozenError,
  KbPinsMalformedError,
  PINS_FILE,
  listPins,
  pinBase,
  readPinsManifest,
  unpinBase,
} from "./kb-pins.js";
import { KbStore } from "./kb-store.js";

describe("kb-pins", () => {
  let workspace: string;
  let bundle: string;
  const store = new KbStore();
  const at = "2026-08-19T00:00:00Z";

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), "strauss-kb-pins-"));
    bundle = join(workspace, "docs", "kb");
    await store.write(
      bundle,
      composeRecord(
        "fact",
        {
          slug: "pins-are-workspace-state",
          title: "Pins are workspace state",
          why: "A base must remain copyable without knowing who pins it.",
        },
        "seed",
        at,
      ),
    );
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("pin, list, unpin round-trip", async () => {
    const pinned = await pinBase(store, workspace, bundle, at);
    expect(pinned).toMatchObject({
      path: "docs/kb",
      pinnedAt: at,
      alreadyPinned: false,
    });
    expect(pinned.warning).toBeUndefined();

    expect(await listPins(store, workspace)).toMatchObject([
      { path: "docs/kb", valid: true, recordCount: 1 },
    ]);

    expect(await unpinBase(workspace, bundle)).toEqual({
      path: "docs/kb",
      removed: true,
      layers: ["project"],
    });
    expect(await listPins(store, workspace)).toEqual([]);
  });

  test("pin is idempotent, keeping the original pinnedAt", async () => {
    await pinBase(store, workspace, bundle, at);
    // The same base spelled differently — absolute against relative-with-`..`
    // — is still the same pin.
    const again = await pinBase(
      store,
      workspace,
      join(workspace, "docs", "..", "docs", "kb"),
      "2026-08-20T00:00:00Z",
    );

    expect(again).toMatchObject({ pinnedAt: at, alreadyPinned: true });
    expect(await listPins(store, workspace)).toHaveLength(1);
  });

  test("mode and profiles round-trip, and re-pinning updates just them", async () => {
    await pinBase(store, workspace, bundle, at, {
      mode: "full",
      profiles: ["session-start"],
    });
    expect(await listPins(store, workspace)).toMatchObject([
      { path: "docs/kb", mode: "full", profiles: ["session-start"] },
    ]);

    // Re-pin with new options: the entry's fields update, pinnedAt survives.
    const updated = await pinBase(
      store,
      workspace,
      bundle,
      "2026-08-21T00:00:00Z",
      {
        mode: "index",
      },
    );
    expect(updated).toMatchObject({
      alreadyPinned: true,
      pinnedAt: at,
      mode: "index",
      profiles: ["session-start"],
    });

    // An invalid hand-edited mode degrades to absent, not to a broken manifest.
    const file = join(workspace, PINS_FILE);
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      pins: Record<string, unknown>[];
    };
    raw.pins[0]!.mode = "everything";
    writeFileSync(file, JSON.stringify(raw));
    expect(await listPins(store, workspace)).toMatchObject([
      { path: "docs/kb", mode: null },
    ]);
  });

  test("layers merge nearest-first and unpin sweeps them all", async () => {
    const userRoot = mkdtempSync(join(tmpdir(), "strauss-kb-user-"));
    const prevUserRoot = process.env.STRAUSS_KB_USER_ROOT;
    process.env.STRAUSS_KB_USER_ROOT = userRoot;
    try {
      // The same base pinned in project and user; a second base per layer.
      await pinBase(store, workspace, bundle, at, { mode: "index" });
      await pinBase(store, workspace, bundle, at, {
        layer: "user",
        mode: "full",
      });
      await pinBase(store, workspace, join(workspace, "scratch"), at, {
        layer: "local",
      });
      await pinBase(store, workspace, join(userRoot, "kb"), at, {
        layer: "user",
      });

      const pins = await listPins(store, workspace);
      // Project wins the conflict; each remaining pin keeps its layer, and
      // the user pin's relative path resolved against the user root.
      expect(pins).toMatchObject([
        { path: "docs/kb", layer: "project", mode: "index" },
        { path: "scratch", layer: "local" },
        { path: "kb", layer: "user", absolutePath: join(userRoot, "kb") },
      ]);

      const gone = await unpinBase(workspace, bundle);
      expect(gone.layers.sort()).toEqual(["project", "user"]);
      expect(await listPins(store, workspace)).toHaveLength(2);
    } finally {
      process.env.STRAUSS_KB_USER_ROOT = prevUserRoot;
      rmSync(userRoot, { recursive: true, force: true });
    }
  });

  test("a frozen pin refuses writes until unfrozen, from any layer", async () => {
    await pinBase(store, workspace, bundle, at, {
      layer: "local",
      frozen: true,
    });

    await expect(assertBaseNotFrozen(workspace, bundle)).rejects.toThrow(
      KbBaseFrozenError,
    );
    // Another base in the workspace stays writable.
    await expect(
      assertBaseNotFrozen(workspace, join(workspace, "other")),
    ).resolves.toBeUndefined();

    await pinBase(store, workspace, bundle, at, {
      layer: "local",
      frozen: false,
    });
    await expect(
      assertBaseNotFrozen(workspace, bundle),
    ).resolves.toBeUndefined();
  });

  test("pinning an unpopulated path succeeds with a warning", async () => {
    const result = await pinBase(
      store,
      workspace,
      join(workspace, "not-yet"),
      at,
    );

    expect(result.alreadyPinned).toBe(false);
    expect(result.warning).toContain("no records found");
    expect(await listPins(store, workspace)).toMatchObject([
      { path: "not-yet", valid: false, recordCount: 0 },
    ]);
  });

  test("unpinning what was never pinned says so without writing", async () => {
    expect(await unpinBase(workspace, bundle)).toMatchObject({
      removed: false,
    });
    expect(await readPinsManifest(workspace)).toEqual({ pins: [] });
  });

  // The same tolerance the record reader extends to frontmatter it did not
  // write: another producer's keys survive this package's rewrite.
  test("preserves unknown keys through a rewrite", async () => {
    const file = join(workspace, PINS_FILE);
    mkdirSync(join(workspace, ".strauss"), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        pins: [{ path: "docs/kb", pinnedAt: at, team: "auth" }],
        editor: "by-hand",
      }),
    );

    await pinBase(store, workspace, join(workspace, "other"), at);

    const rewritten = JSON.parse(readFileSync(file, "utf8")) as {
      editor: string;
      pins: Record<string, unknown>[];
    };
    expect(rewritten.editor).toBe("by-hand");
    expect(rewritten.pins[0]).toMatchObject({ path: "docs/kb", team: "auth" });
    expect(rewritten.pins).toHaveLength(2);
  });

  // Every write path is a full rewrite, and rewriting over content that could
  // not be read would destroy the one copy of it.
  test("refuses to write over a manifest it cannot read", async () => {
    mkdirSync(join(workspace, ".strauss"), { recursive: true });
    writeFileSync(join(workspace, PINS_FILE), "{ not json");

    await expect(pinBase(store, workspace, bundle, at)).rejects.toThrow(
      KbPinsMalformedError,
    );
  });
});
