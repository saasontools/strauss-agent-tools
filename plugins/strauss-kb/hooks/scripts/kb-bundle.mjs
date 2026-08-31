#!/usr/bin/env node
/**
 * Shared helpers for the record-edit hooks (validate-kb-bundle.mjs,
 * deny-kb-generated-edits.mjs). Both only ever run from this plugin's own
 * tree — wired through hooks/hooks.json, not copied out to a project like
 * block-kb-reads.mjs is — so importing a sibling module here costs nothing
 * the plugin doesn't already carry.
 */
import { basename, sep } from "node:path";

/**
 * Generated files a bundle's write path (kb_write, kb_supersede, ...) owns.
 * Kept in sync by hand with `STORE_OWNED` in packages/strauss-kb/src/
 * kb-store.ts — this script cannot import that package (it may run before
 * the CLI is even installed), so the three names are restated here.
 */
export const STORE_OWNED_BASENAMES = new Set([
  "INDEX.md",
  "log.jsonl",
  ".index.sqlite",
]);

/**
 * The bundle root a path lives under, or null outside one.
 *
 * Matches the two conventions this plugin documents: a directory literally
 * named `.kb`, or a `kb` directory under `.strauss` (the default bundle —
 * `KB_DIR` in the package). This is a path-segment match, not a filesystem
 * walk: it costs no I/O and works for a path that doesn't exist on disk yet
 * (a `Write` creating a brand-new record), which a `stat`-based walk would
 * miss. The nearest enclosing match wins, for the (unusual) case of a bundle
 * nested under another.
 */
export function findBundleRoot(filePath) {
  const isAbsolute = filePath.startsWith(sep);
  const parts = filePath.split(sep).filter((part) => part.length > 0);

  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === ".kb" || (parts[i] === "kb" && parts[i - 1] === ".strauss")) {
      const root = parts.slice(0, i + 1).join(sep);
      return isAbsolute ? sep + root : root;
    }
  }
  return null;
}

export function isStoreOwnedFile(filePath) {
  return STORE_OWNED_BASENAMES.has(basename(filePath));
}
