#!/usr/bin/env node
/**
 * Shared helpers for the record-edit hooks (validate-kb-bundle.mjs,
 * deny-kb-generated-edits.mjs). Both only ever run from this plugin's own
 * tree — wired through hooks/hooks.json, not copied out to a project like
 * block-kb-reads.mjs is — so importing a sibling module here costs nothing
 * the plugin doesn't already carry.
 */
import { existsSync, readdirSync } from "node:fs";
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
 *
 * Splits on `/` and `\` both, regardless of the current platform's own
 * `path.sep`: the caller is expected to have run the path through
 * `path.resolve` first (native separators, `..` collapsed), but this stays
 * correct even for a raw path someone hands it directly — a Windows
 * drive-absolute path spelled with forward slashes (`C:/Users/...`, which
 * `path.win32.isAbsolute` accepts) would otherwise never split on a bare
 * `path.sep` of `\`, silently turning the whole path into one segment and
 * the hook into a permanent no-op on that platform. The match is returned
 * joined with the current platform's `sep`, so it composes cleanly with
 * `path.dirname`/`path.resolve` on whatever's left of the string.
 *
 * Known scope cut (documented, not a bug): this only recognises the two
 * *conventional* directory names. A base pinned somewhere else entirely
 * (`docs/kb`, `docs/adr`, ... via `.strauss/kb-pins.json` and its local/user
 * layers — see `block-kb-reads.mjs`) is invisible to it. Reading those pin
 * manifests would mean this pure, I/O-free path match growing filesystem
 * reads and JSON parsing on every single edit; the plugin README calls this
 * out as a v1 limitation rather than silently covering only some bases.
 */
export function findBundleRoot(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/");

  for (let i = parts.length - 1; i >= 0; i--) {
    if (
      parts[i] === ".kb" ||
      (parts[i] === "kb" && parts[i - 1] === ".strauss")
    ) {
      return parts.slice(0, i + 1).join(sep);
    }
  }
  return null;
}

export function isStoreOwnedFile(filePath) {
  return STORE_OWNED_BASENAMES.has(basename(filePath));
}

/**
 * A directory really looks like a KB bundle: it exists and holds at least
 * one record (a `.md` file that isn't itself store-owned) or one of the
 * store-owned files the write path has already produced. Cheap — one
 * `readdir`, no parsing — and its only job is to avoid shelling out to
 * `strauss-kb validate` for a directory that merely happens to be named
 * `kb` under `.strauss` but was never a real bundle (or isn't one yet).
 */
export function looksLikeBundle(bundleRoot) {
  if (!existsSync(bundleRoot)) return false;
  let names;
  try {
    names = readdirSync(bundleRoot);
  } catch {
    return false;
  }
  return names.some(
    (name) => STORE_OWNED_BASENAMES.has(name) || name.endsWith(".md"),
  );
}

/**
 * Flattens a string to one line and bounds its length before it goes into
 * model-facing hook output. `strauss-kb validate`'s problem notes can quote
 * arbitrary frontmatter content verbatim (e.g. an unrecognised `type`
 * value) — a record is, in the end, just a file an edit tool wrote, so that
 * content is only as trustworthy as whatever produced the edit. Collapsing
 * newlines keeps an embedded payload from imitating a new line of hook
 * output or a fake conversation turn; the length cap keeps one bad record
 * from ballooning the context injected on every edit.
 */
export function sanitizeForContext(value, maxLen = 200) {
  const flat = String(value)
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen - 1)}…` : flat;
}
