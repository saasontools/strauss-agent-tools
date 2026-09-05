import { readFile } from "node:fs/promises";
import { downloadPart, grammarsBaseUrl, grammarUrl } from "./fetch.js";
import { grammarManifest } from "./manifest.js";
import type { Grammar, GrammarOptions, Pinned } from "./model.js";
import {
  grammarCachePath,
  grammarsCacheRoot,
  verifyCached,
  writeCached,
} from "./store.js";

export { grammarsBaseUrl, grammarUrl } from "./fetch.js";
export {
  grammarManifest,
  grammarsDataPath,
  setGrammarManifest,
} from "./manifest.js";
export {
  grammarManifestSchema,
  type Grammar,
  type GrammarManifest,
  type GrammarPack,
  type GrammarOptions,
} from "./model.js";
export { grammarCachePath, grammarsCacheRoot } from "./store.js";

/** One download per pack per process, however many callers ask at once. */
const inFlight = new Map<string, Promise<Grammar | null>>();

/** Packs this process wanted and could not get, and why, for the hint. */
const missing = new Map<string, { subject: string; cause?: string }>();

/** Languages whose pinned tags query would not compile, and why. */
const uncompilable = new Map<string, string>();

/** Languages whose pinned grammar this runtime refused to load, and why. */
const rejected = new Map<string, string>();

/** `STRAUSS_KB_GRAMMARS=off` keeps a run off the wire; the cache still counts. */
export function grammarsDownloadDisabled(): boolean {
  return process.env["STRAUSS_KB_GRAMMARS"] === "off";
}

/**
 * Both halves of a verified pack (cached WASM path, tags query text), each
 * downloaded once. `null` on any refused, disabled or mismatched part is what
 * the resolver reports as `resolver-unavailable`; a miss is not remembered.
 */
export async function ensureGrammar(
  language: string,
  options: GrammarOptions = {},
): Promise<Grammar | null> {
  const pack = grammarManifest().packs[language];
  if (!pack) return null;

  const root = grammarsCacheRoot(options.cacheRoot);
  const wasm = grammarCachePath(root, language, pack.wasm.sha256);
  // Keyed on the pack rather than the part, so a pack downloads once however
  // many parts it has.
  const key = `${wasm} ${grammarsBaseUrl(options.baseUrl) ?? ""}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const grammar = await ensurePart(
      wasm,
      `tree-sitter-${language}`,
      pack.wasm,
      options,
    );
    if (grammar !== true)
      return miss(language, `grammar tree-sitter-${language}`, grammar);

    const parts: string[] = [];
    const total = pack.tags.length;
    for (const [at, part] of pack.tags.entries()) {
      const name = `${language} tags${total > 1 ? ` part ${at + 1}/${total}` : ""}`;
      const path = grammarCachePath(root, language, part.sha256, "scm");
      const held = await ensurePart(path, name, part, options);
      if (held !== true) return miss(language, name, held);
      parts.push(`; ${part.url}\n${lf(await readFile(path, "utf8"))}`);
    }

    missing.delete(language);
    return { wasm, query: total ? parts.join("\n") : undefined };
  })();
  inFlight.set(key, pending);
  const result = await pending;
  if (result === null) inFlight.delete(key);
  return result;
}

/** `true` once the part is cached and hashes as the lock says, else why not. */
async function ensurePart(
  path: string,
  name: string,
  entry: Pinned & { url: string },
  options: GrammarOptions,
): Promise<true | { cause?: string }> {
  if (await verifyCached(path, entry)) return true;
  if (options.offline === true || grammarsDownloadDisabled()) return {};
  const download = await downloadPart(
    grammarUrl(entry.url, options.baseUrl),
    name,
    entry,
    options,
  );
  if ("cause" in download) return { cause: download.cause };
  await writeCached(path, download.bytes).catch(() => null);
  return true;
}

/** Records which part of the pack this run could not get, for the hint. */
function miss(
  language: string,
  subject: string,
  failure: { cause?: string },
): null {
  missing.set(language, { subject, ...failure });
  return null;
}

/** The pin concatenates parts LF-normalised; the runtime must compile the same. */
function lf(body: string): string {
  return body.replace(/\r\n/g, "\n");
}

/**
 * A tags query that will not compile against the grammar release it is pinned
 * to. The resolver reports the language unavailable; the repair is a re-pin.
 */
export function noteUncompilableQuery(language: string, cause: string): void {
  uncompilable.set(language, cause);
}

/**
 * A grammar the runtime will not load — a WASM built at an ABI outside the
 * range this `web-tree-sitter` accepts. The resolver reports the language
 * unavailable; the repair is a re-pin against the installed runtime.
 */
export function noteRejectedGrammar(language: string, cause: string): void {
  rejected.set(language, cause);
}

/**
 * One line per grammar this process could not use, for the doctor and
 * anchor-resolve reports. The only place a repair is spelled out.
 */
export function grammarHints(): string[] {
  const manifest = grammarManifest();
  const packs = manifest.packs;
  const lines = new Map<string, string>();
  for (const [language, { subject, cause }] of missing)
    lines.set(
      language,
      `${subject} not cached${cause ? ` (${cause})` : ""}; run online once, or set STRAUSS_KB_GRAMMARS_DIR`,
    );
  for (const [language, cause] of rejected)
    lines.set(
      language,
      `${packs[language]?.package ?? `tree-sitter-${language}`} rejected by web-tree-sitter ${manifest.webTreeSitter}${cause ? `: ${cause}` : ""}; re-pin with pnpm grammars pin ${language}`,
    );
  for (const [language, cause] of uncompilable)
    lines.set(
      language,
      `tags query for ${language} does not compile against ${packs[language]?.package ?? `tree-sitter-${language}`}: ${cause}; re-pin with pnpm grammars pin ${language}`,
    );
  return [...lines]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, line]) => line);
}

/** Test seam: forgets this process's downloads, misses and query failures. */
export function resetGrammarState(): void {
  inFlight.clear();
  missing.clear();
  uncompilable.clear();
  rejected.clear();
}
