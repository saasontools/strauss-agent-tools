import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { grammarManifest, grammarsDataPath } from "../grammars/index.js";

/**
 * Which grammar a file extension is parsed with, and which definitions query
 * runs over it. Both are generated — `pnpm grammars pin` — from GitHub
 * Linguist and from each pack's own tags query, so adding a language is a pin
 * run rather than a hand-written query.
 *
 * `tagsDir` overrides where the queries are read from, for tests.
 */

let extensions: Record<string, string> | undefined;

function extensionTable(): Record<string, string> {
  extensions ??= Object.fromEntries(
    Object.entries(grammarManifest().packs).flatMap(([language, pack]) =>
      pack.extensions.map((extension) => [extension, language]),
    ),
  );
  return extensions;
}

function queryPath(language: string, tagsDir?: string): string {
  return tagsDir
    ? join(tagsDir, `${language}.scm`)
    : grammarsDataPath("tags", `${language}.scm`);
}

/**
 * Grammar for a path, or `undefined` when the extension has none — or when the
 * pinned grammar release ships no tags query for it, so the regex heuristic
 * keeps those files, as before the resolver existed.
 */
export function languageForFile(
  file: string,
  tagsDir?: string,
): string | undefined {
  const language = extensionTable()[extname(file).toLowerCase()];
  return language && definitionsQuery(language, tagsDir) ? language : undefined;
}

/** The tags query for a language, or `undefined` when its release ships none. */
export function definitionsQuery(
  language: string,
  tagsDir?: string,
): string | undefined {
  const path = queryPath(language, tagsDir);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Every language the resolver can resolve in: a grammar and a tags query. */
export function treeSitterLanguages(): string[] {
  return [...new Set(Object.values(extensionTable()))]
    .filter((language) => existsSync(queryPath(language)))
    .sort();
}
