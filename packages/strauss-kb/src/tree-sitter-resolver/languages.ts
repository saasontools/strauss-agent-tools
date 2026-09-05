import { extname } from "node:path";
import { grammarManifest, type GrammarManifest } from "../grammars/index.js";

/**
 * Which grammar a file extension is parsed with, and whether a definitions
 * query runs over it. Both are generated — `pnpm grammars pin` — from GitHub
 * Linguist and from each pack's own tags query, so adding a language is a pin
 * run rather than a hand-written query.
 */

/** Inverted once per lock — the lock a test stands in is a different object. */
let table:
  { of: GrammarManifest; extensions: Record<string, string> } | undefined;

function extensionTable(): Record<string, string> {
  const manifest = grammarManifest();
  if (table?.of !== manifest)
    table = {
      of: manifest,
      extensions: Object.fromEntries(
        Object.entries(manifest.packs).flatMap(([language, pack]) =>
          pack.extensions.map((extension) => [extension, language]),
        ),
      ),
    };
  return table.extensions;
}

/** Does the lock pin a tags query for this language? The query itself downloads. */
function hasQuery(language: string): boolean {
  return (grammarManifest().packs[language]?.tags.length ?? 0) > 0;
}

/**
 * Grammar for a path, or `undefined` when the extension has none — or when the
 * pinned grammar release ships no tags query for it, so the regex heuristic
 * keeps those files, as before the resolver existed.
 */
export function languageForFile(file: string): string | undefined {
  const language = extensionTable()[extname(file).toLowerCase()];
  return language && hasQuery(language) ? language : undefined;
}

/** Every language the resolver can resolve in: a grammar and a tags query. */
export function treeSitterLanguages(): string[] {
  return [...new Set(Object.values(extensionTable()))].filter(hasQuery).sort();
}
