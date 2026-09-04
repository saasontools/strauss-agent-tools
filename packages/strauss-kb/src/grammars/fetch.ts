import { fetchTimeoutMs } from "../remote-repo/index.js";
import { DEFAULT_GRAMMARS_BASE_URL, type GrammarEntry } from "./model.js";
import { matches } from "./store.js";

/** `<base>/tree-sitter-wasms@<version>/out/tree-sitter-<language>.wasm`. */
export function grammarUrl(
  base: string,
  pkg: string,
  version: string,
  language: string,
): string {
  let root = base;
  while (root.endsWith("/")) root = root.slice(0, -1);
  return `${root}/${pkg}@${version}/out/tree-sitter-${language}.wasm`;
}

export function grammarsBaseUrl(override?: string): string {
  return (
    override ??
    process.env["STRAUSS_KB_GRAMMARS_URL"] ??
    DEFAULT_GRAMMARS_BASE_URL
  );
}

/**
 * The grammar's bytes, or `null` for any failure — never a throw. Bytes that
 * do not hash as the manifest says are discarded: the manifest is what makes
 * an unsigned CDN safe to fetch from.
 */
export async function downloadGrammar(
  url: string,
  entry: GrammarEntry,
  timeoutMs?: number,
): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(fetchTimeoutMs(timeoutMs)),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return matches(bytes, entry) ? bytes : null;
  } catch {
    return null;
  }
}
