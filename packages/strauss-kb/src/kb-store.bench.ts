import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, describe } from "vitest";
import { SAMPLING } from "./bench/fixtures.js";
import { KbStore } from "./kb-store.js";

/**
 * `stamp` over the companion fixture against its own tree: list, adjudicate,
 * digest, and the shallow drift pass over every anchored file. A reload hook
 * runs this on every turn, so it is the store call a person waits on.
 *
 * Skipped where the fixture is not on disk — a published checkout has no
 * `fixtures/`.
 */
const BASE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/companion-repo/base",
);
const KB = join(BASE, ".strauss", "kb");

const store = new KbStore();

describe.skipIf(!existsSync(KB))("stamp", () => {
  bench(
    "the companion fixture base",
    async () => {
      await store.stamp(KB, { repoRoot: BASE });
    },
    SAMPLING,
  );
});
