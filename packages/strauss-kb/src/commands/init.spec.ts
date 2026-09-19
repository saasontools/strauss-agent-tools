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
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BUNDLE_IGNORE_BLOCK, GITIGNORE_FILE } from "../kb-files.js";
import { KbStore } from "../kb-store.js";
import { initCommand, type KbInitResult } from "./init.js";

describe("initCommand", () => {
  let bundle: string;
  const store = new KbStore();

  const init = async () =>
    (await initCommand.run(
      { store, actor: "agent:tester", now: () => "2026-09-18T00:00:00Z" },
      initCommand.input.parse({ bundlePath: bundle }),
    )) as KbInitResult;

  beforeEach(() => {
    bundle = join(mkdtempSync(join(tmpdir(), "strauss-kb-init-")), "kb");
  });

  afterEach(() => rmSync(bundle, { recursive: true, force: true }));

  test("creates the directory and the ignore block", async () => {
    expect(await init()).toEqual({ bundlePath: bundle, gitignore: "created" });
    expect(readFileSync(join(bundle, GITIGNORE_FILE), "utf8")).toBe(
      BUNDLE_IGNORE_BLOCK,
    );
  });

  test("is idempotent, and says it found the block already there", async () => {
    await init();

    expect(await init()).toEqual({ bundlePath: bundle, gitignore: "present" });
    expect(readFileSync(join(bundle, GITIGNORE_FILE), "utf8")).toBe(
      BUNDLE_IGNORE_BLOCK,
    );
  });

  test("keeps an ignore file that is already there, and appends", async () => {
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, GITIGNORE_FILE), "scratch/\n");

    expect(await init()).toEqual({ bundlePath: bundle, gitignore: "appended" });
    expect(readFileSync(join(bundle, GITIGNORE_FILE), "utf8")).toBe(
      `scratch/\n${BUNDLE_IGNORE_BLOCK}`,
    );
  });

  // Deleting the block is how you decline it; nothing puts it back on its own.
  // Re-running init is the explicit ask, and that is allowed to write.
  test("does not fight a deleted block, and restores it when asked again", async () => {
    await init();
    rmSync(join(bundle, GITIGNORE_FILE));

    await store.write(
      bundle,
      (await import("../compose.js")).composeRecord(
        "fact",
        { slug: "a-record", title: "A record", why: "Writing must not care." },
        "seed",
        "2026-09-18T00:00:00Z",
      ),
    );
    expect(existsSync(join(bundle, GITIGNORE_FILE))).toBe(false);

    expect(await init()).toEqual({ bundlePath: bundle, gitignore: "created" });
  });

  test("is not an MCP tool", () => {
    expect(initCommand.tool).toBeUndefined();
  });
});
