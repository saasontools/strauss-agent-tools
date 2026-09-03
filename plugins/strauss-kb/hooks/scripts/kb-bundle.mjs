#!/usr/bin/env node
/** Shared bundle helpers for validate-kb-bundle.mjs and deny-kb-generated-edits.mjs: findBundleRoot, isStoreOwnedFile, looksLikeBundle. */
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
 * The bundle root a path lives under, or null outside one. Matches a `.kb`
 * or `.strauss/kb` path segment (nearest enclosing wins); does not read
 * `kb-pins.json`, so a pinned-elsewhere base is invisible to it. Splits on
 * `/` and `\` both, so a forward-slash Windows drive path is handled too.
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
