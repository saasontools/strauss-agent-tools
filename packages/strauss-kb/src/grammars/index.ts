import { downloadGrammar, grammarsBaseUrl, grammarUrl } from "./fetch.js";
import { grammarManifest } from "./manifest.js";
import type { GrammarOptions } from "./model.js";
import {
  grammarCachePath,
  grammarsCacheRoot,
  verifyCached,
  writeCached,
} from "./store.js";

export { grammarsBaseUrl, grammarUrl } from "./fetch.js";
export { grammarManifest } from "./manifest.js";
export {
  DEFAULT_GRAMMARS_BASE_URL,
  grammarManifestSchema,
  type GrammarEntry,
  type GrammarManifest,
  type GrammarOptions,
} from "./model.js";
export { grammarCachePath, grammarsCacheRoot } from "./store.js";

/** One download per language per process, however many callers ask at once. */
const inFlight = new Map<string, Promise<string | null>>();

/** Languages this process wanted and could not get, for the hint. */
const missing = new Set<string>();

/** `STRAUSS_KB_GRAMMARS=off` keeps a run off the wire; the cache still counts. */
export function grammarsDownloadDisabled(): boolean {
  return process.env["STRAUSS_KB_GRAMMARS"] === "off";
}

/**
 * The path to a verified grammar, downloaded once when not cached. `null`
 * (unknown language, refused or disabled download, hash mismatch) is what the
 * resolver reports as `resolver-unavailable`. A miss is not remembered, so a
 * later call in the same process — the MCP server — tries the network again.
 */
export async function ensureGrammar(
  language: string,
  options: GrammarOptions = {},
): Promise<string | null> {
  const manifest = grammarManifest();
  const entry = manifest.grammars[language];
  if (!entry) return null;

  const root = grammarsCacheRoot(options.cacheRoot);
  const path = grammarCachePath(root, manifest.version, language);
  const key = `${path} ${grammarsBaseUrl(options.baseUrl)}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    if (await verifyCached(path, entry)) {
      missing.delete(language);
      return path;
    }
    if (options.offline === true || grammarsDownloadDisabled()) {
      missing.add(language);
      return null;
    }
    const bytes = await downloadGrammar(
      grammarUrl(
        grammarsBaseUrl(options.baseUrl),
        manifest.package,
        manifest.version,
        language,
      ),
      entry,
      options.fetchTimeoutMs,
    );
    if (!bytes) {
      missing.add(language);
      return null;
    }
    await writeCached(path, bytes).catch(() => null);
    missing.delete(language);
    return path;
  })();
  inFlight.set(key, pending);
  const result = await pending;
  if (result === null) inFlight.delete(key);
  return result;
}

/**
 * One line per grammar this process could not obtain, for the doctor and
 * anchor-resolve reports. The only place the repair is spelled out.
 */
export function grammarHints(): string[] {
  return [...missing]
    .sort()
    .map(
      (language) =>
        `grammar tree-sitter-${language} not cached; run online once, or set STRAUSS_KB_GRAMMARS_DIR`,
    );
}

/** Test seam: forgets this process's downloads and misses. */
export function resetGrammarState(): void {
  inFlight.clear();
  missing.clear();
}
