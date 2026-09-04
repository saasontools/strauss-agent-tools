import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { grammarsDataPath } from "../grammars/index.js";

/**
 * Which grammar a file extension is parsed with, and which definitions query
 * runs over it. Both tables are generated — `pnpm grammars:pin --tags` — from
 * GitHub Linguist and from each grammar's own `queries/tags.scm`, so adding a
 * language is a pin run rather than a hand-written query.
 */

let extensions: Record<string, string> | undefined;

function extensionTable(): Record<string, string> {
  extensions ??= JSON.parse(
    readFileSync(grammarsDataPath("extensions.json"), "utf8"),
  ) as Record<string, string>;
  return extensions;
}

function queryPath(language: string): string {
  return grammarsDataPath("tags", `${language}.scm`);
}

/** Grammar for a path, or `undefined` when the extension has none. */
export function languageForFile(file: string): string | undefined {
  return extensionTable()[extname(file).toLowerCase()];
}

/** The tags query for a language, or `undefined` when upstream ships none. */
export function definitionsQuery(language: string): string | undefined {
  const path = queryPath(language);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Every language the resolver can resolve in: a grammar and a tags query. */
export function treeSitterLanguages(): string[] {
  return [...new Set(Object.values(extensionTable()))]
    .filter((language) => existsSync(queryPath(language)))
    .sort();
}
